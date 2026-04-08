/**
 * seed.ts — Idempotent database seeder
 *
 * Checks a `meta` flag before running. Safe to call on every app boot.
 * Uses pg-copy-streams for bulk check-in inserts (~279,000 rows).
 *
 * Usage:
 *   pnpm seed          (direct invocation)
 *   Called by app.ts   (on every startup, skipped if already seeded)
 */

import { Pool, PoolClient } from 'pg';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import copyFrom from 'pg-copy-streams';
import dotenv from 'dotenv';

dotenv.config();

const DAYS_BACK = 90;
const CHECKINS_PER_DAY = 3_100; // ~279,000 total
const ANOMALY_COUNT = 100;

// ── Exact gym specifications ──────────────────────────────────────────────────

const GYMS: Array<{
  name: string;
  city: string;
  capacity: number;
  opens_at: string;
  closes_at: string;
}> = [
  { name: 'WTF Gyms — Lajpat Nagar',      city: 'New Delhi',  capacity: 220, opens_at: '05:30', closes_at: '22:30' },
  { name: 'WTF Gyms — Connaught Place',    city: 'New Delhi',  capacity: 180, opens_at: '06:00', closes_at: '22:00' },
  { name: 'WTF Gyms — Bandra West',        city: 'Mumbai',     capacity: 300, opens_at: '05:00', closes_at: '23:00' },
  { name: 'WTF Gyms — Powai',              city: 'Mumbai',     capacity: 250, opens_at: '05:30', closes_at: '22:30' },
  { name: 'WTF Gyms — Indiranagar',        city: 'Bengaluru',  capacity: 200, opens_at: '05:30', closes_at: '22:00' },
  { name: 'WTF Gyms — Koramangala',        city: 'Bengaluru',  capacity: 180, opens_at: '06:00', closes_at: '22:00' },
  { name: 'WTF Gyms — Banjara Hills',      city: 'Hyderabad',  capacity: 160, opens_at: '06:00', closes_at: '22:00' },
  { name: 'WTF Gyms — Sector 18 Noida',   city: 'Noida',      capacity: 140, opens_at: '06:00', closes_at: '21:30' },
  { name: 'WTF Gyms — Salt Lake',          city: 'Kolkata',    capacity: 120, opens_at: '06:00', closes_at: '21:00' },
  { name: 'WTF Gyms — Velachery',          city: 'Chennai',    capacity: 110, opens_at: '06:00', closes_at: '21:00' },
];

const GYMS_COUNT = GYMS.length; // 10

// ── Exact member-distribution specifications ──────────────────────────────────
// Row order matches GYMS[] above. Total = 5,000 members.

interface MemberSpec {
  gymIndex:   number;  // index into GYMS / gymIds[]
  count:      number;
  monthly:    number;
  quarterly:  number;
  annual:     number;
  activeRate: number;  // e.g. 0.88 → 88% active; remainder split ~2:1 inactive:frozen
}

const MEMBER_SPECS: MemberSpec[] = [
  //                           gym              total  monthly  quarterly  annual  active%
  { gymIndex: 0, count:  650, monthly: 325, quarterly: 195, annual: 130, activeRate: 0.88 }, // Lajpat Nagar
  { gymIndex: 1, count:  550, monthly: 220, quarterly: 220, annual: 110, activeRate: 0.85 }, // Connaught Place
  { gymIndex: 2, count:  750, monthly: 300, quarterly: 300, annual: 150, activeRate: 0.90 }, // Bandra West
  { gymIndex: 3, count:  600, monthly: 240, quarterly: 240, annual: 120, activeRate: 0.87 }, // Powai
  { gymIndex: 4, count:  550, monthly: 220, quarterly: 220, annual: 110, activeRate: 0.89 }, // Indiranagar
  { gymIndex: 5, count:  500, monthly: 200, quarterly: 200, annual: 100, activeRate: 0.86 }, // Koramangala
  { gymIndex: 6, count:  450, monthly: 225, quarterly: 135, annual:  90, activeRate: 0.84 }, // Banjara Hills
  { gymIndex: 7, count:  400, monthly: 240, quarterly: 100, annual:  60, activeRate: 0.82 }, // Sector 18 Noida
  { gymIndex: 8, count:  300, monthly: 180, quarterly:  90, annual:  30, activeRate: 0.80 }, // Salt Lake
  { gymIndex: 9, count:  250, monthly: 150, quarterly:  75, annual:  25, activeRate: 0.78 }, // Velachery
];

const MEMBERS_TOTAL = MEMBER_SPECS.reduce((s, m) => s + m.count, 0); // 5,000

// ── Anomaly enums aligned with schema CHECK constraints ──────────────────────

const ANOMALY_TYPES = ['zero_checkins', 'capacity_breach', 'revenue_drop'] as const;
const SEVERITY_LEVELS = ['warning', 'critical'] as const;

// ── Plan / member-type enums ──────────────────────────────────────────────────

const PLAN_TYPES = ['monthly', 'quarterly', 'annual'] as const;
const MEMBER_TYPES = ['new', 'renewal'] as const;

// ── Fake data helpers ─────────────────────────────────────────────────────────

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomElement<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomDate(daysAgo: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(randomBetween(5, 22), randomBetween(0, 59), randomBetween(0, 59));
  return d;
}

/** Fisher-Yates shuffle (in-place), returns the array. */
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Returns a shuffled deck of plan-type strings with exact counts.
 * Guarantees monthly + quarterly + annual === spec.count.
 */
function buildPlanDeck(monthly: number, quarterly: number, annual: number): string[] {
  return shuffle([
    ...Array<string>(monthly).fill('monthly'),
    ...Array<string>(quarterly).fill('quarterly'),
    ...Array<string>(annual).fill('annual'),
  ]);
}

/**
 * Returns a shuffled deck of status strings.
 * activeCount  = round(count × activeRate)
 * frozenCount  = round(nonActive / 3)
 * inactiveCount = nonActive - frozenCount
 */
function buildStatusDeck(count: number, activeRate: number): string[] {
  const activeCount   = Math.round(count * activeRate);
  const nonActive     = count - activeCount;
  const frozenCount   = Math.round(nonActive / 3);
  const inactiveCount = nonActive - frozenCount;
  return shuffle([
    ...Array<string>(activeCount).fill('active'),
    ...Array<string>(inactiveCount).fill('inactive'),
    ...Array<string>(frozenCount).fill('frozen'),
  ]);
}

// ── Main seeder ───────────────────────────────────────────────────────────────

export async function runSeedIfNeeded(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    // Idempotency check
    const { rows } = await client.query(
      `SELECT value FROM meta WHERE key = 'seeded'`,
    );
    if (rows.length > 0 && rows[0].value === 'true') {
      console.log('[seed] Database already seeded — skipping.');
      return;
    }

    console.log('[seed] Starting database seed...');
    await client.query('BEGIN');

    // ── 1. Gyms ───────────────────────────────────────────────────────────────
    console.log('[seed] Inserting gyms...');
    const gymIds: string[] = [];

    for (const gym of GYMS) {
      const { rows: gymRows } = await client.query<{ id: string }>(
        `INSERT INTO gyms (name, city, capacity, opens_at, closes_at, status)
         VALUES ($1, $2, $3, $4, $5, 'active')
         RETURNING id`,
        [gym.name, gym.city, gym.capacity, gym.opens_at, gym.closes_at],
      );
      gymIds.push(gymRows[0].id);
      console.log(`[seed]   ✓ ${gym.name} (${gym.city}) — id: ${gymRows[0].id}`);
    }

    // ── 2. Members ────────────────────────────────────────────────────────────
    console.log(`[seed] Inserting ${MEMBERS_TOTAL} members across ${GYMS_COUNT} gyms...`);
    const memberIds: string[] = [];
    let globalMemberIndex = 0;

    const MEMBER_BATCH = 500;

    for (const spec of MEMBER_SPECS) {
      const gymId     = gymIds[spec.gymIndex];
      const planDeck  = buildPlanDeck(spec.monthly, spec.quarterly, spec.annual);
      const statusDeck = buildStatusDeck(spec.count, spec.activeRate);

      console.log(
        `[seed]   ${GYMS[spec.gymIndex].name}: ${spec.count} members ` +
        `(monthly=${spec.monthly}, quarterly=${spec.quarterly}, annual=${spec.annual}, ` +
        `active≈${Math.round(spec.count * spec.activeRate)})`,
      );

      for (let b = 0; b < spec.count; b += MEMBER_BATCH) {
        const batchSize = Math.min(MEMBER_BATCH, spec.count - b);
        const values: unknown[] = [];
        const placeholders: string[] = [];
        let p = 1;

        for (let i = 0; i < batchSize; i++) {
          const deckIndex  = b + i;
          const planType   = planDeck[deckIndex];
          const status     = statusDeck[deckIndex];
          const memberType = randomElement(MEMBER_TYPES); // new | renewal (no spec, stays random)

          // Plan expiry: ±90 days window around today
          const planExpiresAt = randomDate(randomBetween(-30, 60));

          // last_checkin_at is left NULL here and populated in a single
          // batch UPDATE after check-ins are bulk-inserted via COPY.
          globalMemberIndex++;
          const email = `member${globalMemberIndex}@livepulse.dev`;

          values.push(gymId, `Member ${globalMemberIndex}`, email, planType, memberType, status, planExpiresAt);
          placeholders.push(`($${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++})`);
        }

        const result = await client.query<{ id: string }>(
          `INSERT INTO members (gym_id, name, email, plan_type, member_type, status, plan_expires_at)
           VALUES ${placeholders.join(', ')}
           RETURNING id`,
          values,
        );

        for (const row of result.rows) {
          memberIds.push(row.id);
        }
      }
    }

    // ── 3. Check-ins via COPY (bulk) ──────────────────────────────────────────
    // Scenario A is handled inside the generator: Velachery (gym index 9) has
    // its last-day check-ins pushed to 3–6 h before seed time, no open sessions.
    console.log('[seed] Bulk inserting check-ins via COPY...');
    await bulkInsertCheckins(client, gymIds, memberIds);

    // ── 3b. Scenario B: Bandra West capacity breach ───────────────────────────
    // Insert 280 open check-ins (checked_out = NULL) all within the last 90 min.
    // 280 / 300 capacity = 93.3% — well above the 90% breach threshold.
    console.log('[seed] 🏋️  Scenario B: inserting 280 open check-ins for Bandra West...');
    await insertBandraWestOpenCheckins(client, gymIds[2], memberIds);

    // ── 3c. Derive last_checkin_at from actual check-in data ──────────────────
    // Single batch UPDATE using a subquery — no per-row updates.
    console.log('[seed] Updating members.last_checkin_at from check-in data...');
    await client.query(`
      UPDATE members
      SET last_checkin_at = sub.max_checkin
      FROM (
        SELECT member_id, MAX(checked_in) AS max_checkin
        FROM checkins
        GROUP BY member_id
      ) sub
      WHERE members.id = sub.member_id
    `);

    // ── 4. Payments (batched inserts) ─────────────────────────────────────────
    console.log('[seed] Inserting payments...');
    await insertPayments(client, gymIds, memberIds);

    // ── 4b. Scenario C: Salt Lake revenue drop ────────────────────────────────
    // Clear any random payments that landed on today / 7-days-ago for Salt Lake,
    // then seed exact amounts: ≥ ₹15,000 last week, ≤ ₹3,000 today.
    console.log('[seed] 🏋️  Scenario C: seeding Salt Lake revenue drop...');
    await insertSaltLakeRevenueDrop(client, gymIds[8], memberIds);

    // ── 5. Anomalies (single batched insert) ──────────────────────────────────
    console.log('[seed] Inserting anomalies...');
    {
      const values: unknown[] = [];
      const placeholders: string[] = [];
      let p = 1;
      for (let i = 0; i < ANOMALY_COUNT; i++) {
        const gymId       = randomElement(gymIds);
        const daysAgo     = randomBetween(0, DAYS_BACK);
        const resolved    = Math.random() < 0.6;
        const anomalyType = randomElement(ANOMALY_TYPES);
        const severity    = randomElement(SEVERITY_LEVELS);
        values.push(gymId, anomalyType, severity, `Anomaly detected: ${anomalyType} at gym — automated alert`, resolved, randomDate(daysAgo));
        placeholders.push(`($${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++})`);
      }
      await client.query(
        `INSERT INTO anomalies (gym_id, type, severity, message, resolved, detected_at)
         VALUES ${placeholders.join(', ')}`,
        values,
      );
    }

    // ── 6. Refresh materialized view ──────────────────────────────────────────
    console.log('[seed] Refreshing gym_hourly_stats materialized view...');
    await client.query('COMMIT');

    // CONCURRENTLY must run outside a transaction
    await pool.query('REFRESH MATERIALIZED VIEW CONCURRENTLY gym_hourly_stats');

    // ── 7. Mark as seeded ─────────────────────────────────────────────────────
    await pool.query(
      `INSERT INTO meta (key, value) VALUES ('seeded', 'true')
       ON CONFLICT (key) DO UPDATE SET value = 'true'`,
    );

    console.log('[seed] ✅ Seed complete.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[seed] ❌ Seed failed, rolling back:', err);
    throw err;
  } finally {
    client.release();
  }
}

// ── COPY-stream bulk insert for check-ins ─────────────────────────────────────
// checkins schema: id BIGSERIAL (auto), member_id, gym_id, checked_in, checked_out
// CSV NULL represented as empty string via NULL '' option

async function bulkInsertCheckins(
  client: PoolClient,
  gymIds: string[],
  memberIds: string[],
): Promise<void> {
  const stream = client.query(
    copyFrom.from(
      `COPY checkins (member_id, gym_id, checked_in, checked_out)
       FROM STDIN WITH (FORMAT csv, NULL '')`,
    ),
  );

  const now = new Date();
  const startDate = new Date(now);
  startDate.setDate(startDate.getDate() - DAYS_BACK);

  function* generateRows(): Generator<string> {
    for (let day = 0; day < DAYS_BACK; day++) {
      const baseDate = new Date(startDate);
      baseDate.setDate(baseDate.getDate() + day);

      for (let c = 0; c < CHECKINS_PER_DAY; c++) {
        const gymId    = gymIds[c % GYMS_COUNT];
        const memberId = memberIds[randomBetween(0, memberIds.length - 1)];

        // ── Scenario A: Velachery (gym index 9 in the rotation) ──────────────
        // On the most-recent day: push ALL Velachery check-ins to 3 h 10 m – 6 h
        // before seed time and close every session (no open check-ins).
        // This guarantees zero open sessions AND last_checkin > 2 h 10 m ago,
        // so the zero_checkins detector fires on the very first cycle.
        const isVelachery = (c % GYMS_COUNT) === 9;

        // Peak hours: 6-9am and 5-8pm
        const isPeak = Math.random() < 0.6;
        let hour: number;
        if (isPeak) {
          hour = Math.random() < 0.5 ? randomBetween(6, 9) : randomBetween(17, 20);
        } else {
          hour = randomBetween(5, 22);
        }

        let checkedIn = new Date(baseDate);

        if (isVelachery && day === DAYS_BACK - 1) {
          // Force check-in to be 3 h 10 m – 6 h before NOW (safe for any clock)
          const minsAgo = randomBetween(190, 360);
          checkedIn = new Date(now.getTime() - minsAgo * 60_000);
        } else {
          checkedIn.setHours(hour, randomBetween(0, 59), randomBetween(0, 59), 0);
        }

        // Velachery never gets an open session; other gyms: 5% open on last day
        const isOpen = !isVelachery && day === DAYS_BACK - 1 && Math.random() < 0.05;
        let checkedOut = '';
        if (!isOpen) {
          const durationMins = randomBetween(20, 120);
          const co = new Date(checkedIn.getTime() + durationMins * 60_000);
          checkedOut = co.toISOString();
        }

        yield `${memberId},${gymId},${checkedIn.toISOString()},${checkedOut}\n`;
      }
    }
  }

  const readable = Readable.from(generateRows());
  await pipeline(readable, stream);
}

// ── Batched payment inserts ────────────────────────────────────────────────────
// payments schema: id UUID (DEFAULT), member_id, gym_id, amount, plan_type, payment_type, paid_at

async function insertPayments(
  client: PoolClient,
  gymIds: string[],
  memberIds: string[],
): Promise<void> {
  const PAYMENT_TOTAL = 50_000;
  const BATCH = 1_000;

  for (let b = 0; b < PAYMENT_TOTAL; b += BATCH) {
    const batchSize = Math.min(BATCH, PAYMENT_TOTAL - b);
    const values: unknown[] = [];
    const placeholders: string[] = [];
    let p = 1;

    for (let i = 0; i < batchSize; i++) {
      const gymId = gymIds[randomBetween(0, GYMS_COUNT - 1)];
      const memberId = memberIds[randomBetween(0, memberIds.length - 1)];
      const amount = (randomBetween(2000, 15000) / 100).toFixed(2);
      const planType = randomElement(PLAN_TYPES);
      const paymentType = randomElement(MEMBER_TYPES); // 'new' | 'renewal'
      const paidAt = randomDate(randomBetween(0, DAYS_BACK));

      values.push(gymId, memberId, amount, planType, paymentType, paidAt);
      placeholders.push(`($${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++})`);
    }

    await client.query(
      `INSERT INTO payments (gym_id, member_id, amount, plan_type, payment_type, paid_at)
       VALUES ${placeholders.join(', ')}`,
      values,
    );
  }
}

// ── Scenario B: Bandra West — capacity breach ─────────────────────────────────
// Inserts 280 open check-ins (checked_out = NULL) for Bandra West gym, all with
// checked_in within the last 5–89 minutes.  280 / 300 capacity = 93.3% → fires
// capacity_breach (critical) on the first detector cycle.

async function insertBandraWestOpenCheckins(
  client: PoolClient,
  bandraWestGymId: string,
  memberIds: string[],
): Promise<void> {
  const OPEN_COUNT = 280;
  const now = Date.now();
  const values: unknown[] = [];
  const placeholders: string[] = [];
  let p = 1;

  for (let i = 0; i < OPEN_COUNT; i++) {
    const memberId = memberIds[randomBetween(0, memberIds.length - 1)];
    const minsAgo  = randomBetween(5, 89);
    const checkedIn = new Date(now - minsAgo * 60_000);
    values.push(memberId, bandraWestGymId, checkedIn);
    placeholders.push(`($${p++}, $${p++}, $${p++}, NULL)`);
  }

  await client.query(
    `INSERT INTO checkins (member_id, gym_id, checked_in, checked_out)
     VALUES ${placeholders.join(', ')}`,
    values,
  );
  console.log(`[seed]   ✓ Bandra West: ${OPEN_COUNT} open check-ins inserted (93% occupancy)`);
}

// ── Scenario C: Salt Lake — revenue drop ──────────────────────────────────────
// 1. Deletes any random payments that fell on today or 7 days ago for Salt Lake
//    (prevents the randomised payment pool from polluting the controlled amounts).
// 2. Seeds 9 payments totalling ₹16,200 on the same weekday last week.
// 3. Seeds 1 payment of ₹2,000 today.
// Result: today (₹2,000) < lastWeek (₹16,200) × 0.30 (₹4,860) → fires revenue_drop.

async function insertSaltLakeRevenueDrop(
  client: PoolClient,
  saltLakeGymId: string,
  memberIds: string[],
): Promise<void> {
  // Remove any random payments for Salt Lake on today and 7 days ago
  await client.query(
    `DELETE FROM payments
     WHERE gym_id = $1
       AND (paid_at >= CURRENT_DATE
         OR (paid_at >= (CURRENT_DATE - INTERVAL '7 days')
             AND paid_at < (CURRENT_DATE - INTERVAL '6 days')))`,
    [saltLakeGymId],
  );

  const values: unknown[] = [];
  const placeholders: string[] = [];
  let p = 1;

  // 9 payments × ₹1,800 = ₹16,200 on the same weekday last week
  for (let i = 0; i < 9; i++) {
    const memberId = memberIds[randomBetween(0, memberIds.length - 1)];
    // Random minute offset within last-week's day so timestamps look natural
    const lastWeekDay = new Date();
    lastWeekDay.setDate(lastWeekDay.getDate() - 7);
    lastWeekDay.setHours(randomBetween(9, 20), randomBetween(0, 59), 0, 0);

    values.push(saltLakeGymId, memberId, '1800.00', randomElement(PLAN_TYPES), randomElement(MEMBER_TYPES), lastWeekDay);
    placeholders.push(`($${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++})`);
  }

  // 1 payment of ₹2,000 today  (₹2,000 ≤ ₹3,000 ✓)
  const todayMemberId = memberIds[randomBetween(0, memberIds.length - 1)];
  const todayTime = new Date();
  todayTime.setHours(randomBetween(9, 12), randomBetween(0, 59), 0, 0); // early morning
  values.push(saltLakeGymId, todayMemberId, '2000.00', randomElement(PLAN_TYPES), randomElement(MEMBER_TYPES), todayTime);
  placeholders.push(`($${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++})`);

  await client.query(
    `INSERT INTO payments (gym_id, member_id, amount, plan_type, payment_type, paid_at)
     VALUES ${placeholders.join(', ')}`,
    values,
  );
  console.log('[seed]   ✓ Salt Lake: last-week ₹16,200 / today ₹2,000 — revenue drop seeded');
}

// ── Standalone entrypoint ──────────────────────────────────────────────────────

if (require.main === module) {
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  runSeedIfNeeded(pool)
    .then(() => pool.end())
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

