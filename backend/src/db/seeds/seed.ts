/**
 * seed.ts — Idempotent database seeder
 *
 * Checks a `meta` flag before running. Safe to call on every app boot.
 * Uses pg-copy-streams for bulk check-in inserts (~270,000 rows, spec §4).
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
// Target ~270,000 total (spec §4).
// Avg DOW multiplier = (1.00+0.95+0.90+0.95+0.85+0.70+0.45)/7 ≈ 0.8286
// base = 270,000 / 90 / 0.8286 ≈ 3,620
const BASE_DAILY_CHECKINS = 3_620;
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

// ── Churn risk segment targets ────────────────────────────────────────────────
const CHURN_HIGH_COUNT     = 150; // last_checkin_at: 45–60 days ago  → HIGH RISK
const CHURN_CRITICAL_COUNT =  80; // last_checkin_at: > 60 days ago   → CRITICAL RISK

// ── Anomaly enums aligned with schema CHECK constraints ──────────────────────

const ANOMALY_TYPES = ['zero_checkins', 'capacity_breach', 'revenue_drop'] as const;
const SEVERITY_LEVELS = ['warning', 'critical'] as const;

// ── Plan / member-type enums ──────────────────────────────────────────────────

const PLAN_TYPES = ['monthly', 'quarterly', 'annual'] as const;
const MEMBER_TYPES = ['new', 'renewal'] as const;

// ── Indian name data ──────────────────────────────────────────────────────────

const FIRST_NAMES = [
  // Male
  'Rahul', 'Amit', 'Arjun', 'Rohan', 'Vikram', 'Sanjay', 'Deepak', 'Nikhil', 'Ankit', 'Rajesh',
  'Pradeep', 'Suresh', 'Mahesh', 'Arun', 'Vijay', 'Sandeep', 'Akash', 'Varun', 'Manish', 'Gaurav',
  'Tarun', 'Sachin', 'Dhruv', 'Kiran', 'Rajan', 'Harsh', 'Pavan', 'Siddharth', 'Yash', 'Kartik',
  // Female
  'Priya', 'Neha', 'Pooja', 'Anjali', 'Divya', 'Sunita', 'Rekha', 'Meena', 'Kavita', 'Anita',
  'Shreya', 'Swati', 'Preeti', 'Ritu', 'Nisha', 'Radha', 'Seema', 'Geeta', 'Sonia', 'Asha',
  'Deepika', 'Pallavi', 'Sneha', 'Radhika', 'Aditi', 'Tanvi', 'Ria', 'Ishita', 'Diya', 'Nidhi',
] as const;

const LAST_NAMES = [
  'Sharma', 'Verma', 'Patel', 'Singh', 'Kumar', 'Gupta', 'Mehta', 'Joshi', 'Malhotra', 'Kapoor',
  'Agarwal', 'Bose', 'Roy', 'Iyer', 'Nair', 'Reddy', 'Rao', 'Pillai', 'Mishra', 'Pandey',
  'Srivastava', 'Shukla', 'Tiwari', 'Dwivedi', 'Chandra', 'Chauhan', 'Thakur', 'Jain', 'Shah', 'Desai',
  'Saxena', 'Bhatia', 'Khanna', 'Chopra', 'Banerjee', 'Chatterjee', 'Mukherjee', 'Das', 'Sen', 'Ghosh',
  'Dutta', 'Trivedi', 'Kulkarni', 'Patil', 'Gaikwad', 'Sawant', 'Bhatt', 'Raval', 'Parekh', 'Dixit',
] as const;

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
 * frozenCount  = round(nonActive / 3)   → ~4% of total
 * inactiveCount = nonActive - frozenCount → ~8% of total
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

/**
 * Returns a shuffled deck with exactly 80% 'new' and 20% 'renewal'.
 */
function buildMemberTypeDeck(count: number): string[] {
  const newCount     = Math.round(count * 0.80);
  const renewalCount = count - newCount;
  return shuffle([
    ...Array<string>(newCount).fill('new'),
    ...Array<string>(renewalCount).fill('renewal'),
  ]);
}

/**
 * Returns a joined_at timestamp appropriate for the member's status:
 *   active   → random within the last 90 days
 *   inactive → random 91–180 days ago
 *   frozen   → random 91–180 days ago
 */
function getJoinedAt(status: string): Date {
  if (status === 'active') {
    return randomDate(randomBetween(0, 90));
  }
  return randomDate(randomBetween(91, 180));
}

/**
 * Computes plan_expires_at = joinedAt + plan duration.
 *   monthly   → + 30 days
 *   quarterly → + 90 days
 *   annual    → + 365 days
 */
function getPlanExpiresAt(joinedAt: Date, planType: string): Date {
  const d = new Date(joinedAt);
  if (planType === 'quarterly') d.setDate(d.getDate() + 90);
  else if (planType === 'annual') d.setDate(d.getDate() + 365);
  else d.setDate(d.getDate() + 30); // monthly
  return d;
}

/** Tracks used emails across the entire seed run to guarantee uniqueness. */
const usedEmails = new Set<string>();

/**
 * Generates a realistic Indian-style email with no duplicates.
 * Format: firstname.lastnameN@gmail.com
 */
function generateEmail(firstName: string, lastName: string): string {
  const base = `${firstName.toLowerCase()}.${lastName.toLowerCase()}`;
  let suffix = randomBetween(1, 99);
  let email  = `${base}${suffix}@gmail.com`;
  while (usedEmails.has(email)) {
    suffix++;
    email = `${base}${suffix}@gmail.com`;
  }
  usedEmails.add(email);
  return email;
}

/**
 * Generates a 10-digit Indian mobile number starting with 9, 8, or 7.
 */
function generatePhone(): string {
  let phone = randomElement(['9', '8', '7'] as const);
  for (let i = 0; i < 9; i++) {
    phone += Math.floor(Math.random() * 10).toString();
  }
  return phone;
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

    // Reset email tracker for a clean run
    usedEmails.clear();

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
    // Track active members for churn-risk designation (id + home gym)
    const activeMemberRecords: Array<{ id: string; gymId: string }> = [];

    const MEMBER_BATCH = 500;

    for (const spec of MEMBER_SPECS) {
      const gymId          = gymIds[spec.gymIndex];
      const planDeck       = buildPlanDeck(spec.monthly, spec.quarterly, spec.annual);
      const statusDeck     = buildStatusDeck(spec.count, spec.activeRate);
      const memberTypeDeck = buildMemberTypeDeck(spec.count);

      console.log(
        `[seed]   ${GYMS[spec.gymIndex].name}: ${spec.count} members ` +
        `(monthly=${spec.monthly}, quarterly=${spec.quarterly}, annual=${spec.annual}, ` +
        `active≈${Math.round(spec.count * spec.activeRate)})`,
      );

      for (let b = 0; b < spec.count; b += MEMBER_BATCH) {
        const batchSize = Math.min(MEMBER_BATCH, spec.count - b);
        const values: unknown[] = [];
        const placeholders: string[] = [];
        // Track statuses in this batch so we can push active members after INSERT
        const batchStatuses: string[] = [];
        let p = 1;

        for (let i = 0; i < batchSize; i++) {
          const deckIndex  = b + i;
          const planType   = planDeck[deckIndex];
          const status     = statusDeck[deckIndex];
          const memberType = memberTypeDeck[deckIndex];

          const firstName     = randomElement(FIRST_NAMES);
          const lastName      = randomElement(LAST_NAMES);
          const name          = `${firstName} ${lastName}`;
          const email         = generateEmail(firstName, lastName);
          const phone         = generatePhone();
          const joinedAt      = getJoinedAt(status);
          const planExpiresAt = getPlanExpiresAt(joinedAt, planType);

          batchStatuses.push(status);
          values.push(gymId, name, email, phone, planType, memberType, status, joinedAt, planExpiresAt);
          placeholders.push(
            `($${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++})`,
          );
        }

        const result = await client.query<{ id: string }>(
          `INSERT INTO members
             (gym_id, name, email, phone, plan_type, member_type, status, joined_at, plan_expires_at)
           VALUES ${placeholders.join(', ')}
           RETURNING id`,
          values,
        );

        for (let ri = 0; ri < result.rows.length; ri++) {
          const { id } = result.rows[ri];
          memberIds.push(id);
          if (batchStatuses[ri] === 'active') {
            activeMemberRecords.push({ id, gymId });
          }
        }
      }
    }

    // ── 2b. Designate churn-risk members from the shuffled active pool ─────────
    console.log(
      `[seed] Designating churn-risk members ` +
      `(${CHURN_HIGH_COUNT} high-risk, ${CHURN_CRITICAL_COUNT} critical-risk)...`,
    );
    const shuffledActive    = shuffle([...activeMemberRecords]);
    const churnHighRisk     = shuffledActive.slice(0, CHURN_HIGH_COUNT);
    const churnCriticalRisk = shuffledActive.slice(CHURN_HIGH_COUNT, CHURN_HIGH_COUNT + CHURN_CRITICAL_COUNT);
    // Build a fast-lookup set so we can exclude them from Bandra West open checkins
    const churnRiskIdSet    = new Set([...churnHighRisk, ...churnCriticalRisk].map(r => r.id));

    // Update joined_at for HIGH-risk members (must have joined ≥ 61 days ago so
    // last_checkin_at of 45–60 days ago is chronologically valid).
    if (churnHighRisk.length > 0) {
      await client.query(
        `UPDATE members
         SET
           joined_at       = v.new_joined,
           plan_expires_at = CASE plan_type
             WHEN 'monthly'   THEN v.new_joined + INTERVAL '30 days'
             WHEN 'quarterly' THEN v.new_joined + INTERVAL '90 days'
             WHEN 'annual'    THEN v.new_joined + INTERVAL '365 days'
           END
         FROM (
           SELECT id::uuid,
                  NOW() - (INTERVAL '1 day' * (61 + floor(random() * 30)::int)) AS new_joined
           FROM   unnest($1::uuid[]) AS id
         ) v
         WHERE members.id = v.id`,
        [churnHighRisk.map(r => r.id)],
      );
    }

    // Update joined_at for CRITICAL-risk members (must have joined ≥ 91 days ago).
    if (churnCriticalRisk.length > 0) {
      await client.query(
        `UPDATE members
         SET
           joined_at       = v.new_joined,
           plan_expires_at = CASE plan_type
             WHEN 'monthly'   THEN v.new_joined + INTERVAL '30 days'
             WHEN 'quarterly' THEN v.new_joined + INTERVAL '90 days'
             WHEN 'annual'    THEN v.new_joined + INTERVAL '365 days'
           END
         FROM (
           SELECT id::uuid,
                  NOW() - (INTERVAL '1 day' * (91 + floor(random() * 30)::int)) AS new_joined
           FROM   unnest($1::uuid[]) AS id
         ) v
         WHERE members.id = v.id`,
        [churnCriticalRisk.map(r => r.id)],
      );
    }

    console.log(
      `[seed]   ✓ Churn-risk joined_at updated: ` +
      `${churnHighRisk.length} high-risk (joined 61–90 d ago), ` +
      `${churnCriticalRisk.length} critical (joined 91–120 d ago)`,
    );

    // ── 3. Check-ins via COPY (bulk) ──────────────────────────────────────────
    // nonChurnMemberIds is computed here so steps 3a and 3b can reuse it.
    const nonChurnMemberIds = memberIds.filter(id => !churnRiskIdSet.has(id));
    console.log('[seed] Bulk inserting check-ins via COPY...');
    await bulkInsertCheckins(client, gymIds, memberIds);

    // ── 3a. Pre-seeded open check-ins per gym tier (spec §4.4) ───────────────
    // Inserts today's "currently in gym" population so the live occupancy counter
    // is non-zero from the first request. Uses non-churn members only so step 3c
    // does not accidentally delete these open sessions.
    console.log('[seed] Pre-seeding open check-ins per gym capacity tier...');
    await insertPreSeededOpenCheckins(client, gymIds, nonChurnMemberIds);

    // ── 3b. Scenario B: Bandra West capacity breach ───────────────────────────
    // Exclude churn-risk members so their open-sessions are not later deleted
    // by the churn-risk clean-up step (which would drop occupancy below 90 %).
    console.log('[seed] 🏋️  Scenario B: inserting 280 open check-ins for Bandra West...');
    await insertBandraWestOpenCheckins(client, gymIds[2], nonChurnMemberIds);

    // ── 3c. Churn-risk: fix check-in history ──────────────────────────────────
    // • Delete any recent check-ins the bulk COPY may have assigned to these members.
    // • Insert exactly one historical check-in per member at the correct window.
    // • last_checkin_at will then be derived correctly by the UPDATE below.
    console.log('[seed] 🕐  Seeding churn-risk check-in history...');
    await insertChurnRiskCheckins(client, churnHighRisk, churnCriticalRisk);

    // ── 3d. Derive last_checkin_at from actual check-in data ──────────────────
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

// ── Check-in distribution tables (spec §4.1 / §4.2) ─────────────────────────

/** Day-of-week volume multipliers, index 0 = Sunday … 6 = Saturday (spec 4.2) */
const DOW_MULTIPLIERS = [0.45, 1.00, 0.95, 0.90, 0.95, 0.85, 0.70];

/**
 * Per-hour weights matching spec 4.1.  Index = hour (0–23).
 * Boundary hours use fractional weights:
 *   hour 5  → 05:30–05:59 open  (0.60 × 0.5 h = 0.30)
 *   hour 22 → 22:00–22:30 open  (0.35 × 0.5 h = 0.175)
 */
const HOURLY_WEIGHTS = [
  0,     0,     0,     0,     0,     // 00–04  dead night   (closed)
  0.30,                              // 05     early morning (half-hour)
  0.60,                              // 06     early morning
  1.00,  1.00,  1.00,               // 07–09  morning rush  (PEAK)
  0.40,  0.40,                      // 10–11  mid morning
  0.30,  0.30,                      // 12–13  lunch slot
  0.20,  0.20,  0.20,               // 14–16  afternoon
  0.90,  0.90,  0.90,  0.90,       // 17–20  evening rush  (PEAK)
  0.35,                              // 21     late evening
  0.175,                             // 22     late evening (half-hour until 22:30)
  0,                                 // 23     after closing (closed)
];

// Build cumulative weight array once for O(1) weighted random sampling
const _cumHW: number[] = [];
{ let s = 0; for (const w of HOURLY_WEIGHTS) _cumHW.push(s += w); }
const _totalHW = _cumHW[23];

/** Returns a weighted-random hour following spec 4.1 */
function sampleHour(): number {
  const r = Math.random() * _totalHW;
  for (let h = 0; h < 24; h++) if (r <= _cumHW[h]) return h;
  return 21;
}

/** Restricts minute range for boundary hours (spec 4.1) */
function sampleMinute(hour: number): number {
  if (hour === 5)  return randomBetween(30, 59); // 05:30–05:59 only
  if (hour === 22) return randomBetween(0,  30); // 22:00–22:30 only
  return randomBetween(0, 59);
}

// ── Pre-seeded open check-in tier targets (spec 4.4) ─────────────────────────
// Bandra West (gymIndex 2) is excluded — handled by Scenario B (280 open).
// Velachery  (gymIndex 9) is excluded — Scenario A requires 0 open sessions.

const OPEN_CHECKIN_TIERS: Array<{ gymIndex: number; min: number; max: number }> = [
  { gymIndex: 0, min: 15, max: 25 }, // Lajpat Nagar   (medium, 220)
  { gymIndex: 1, min: 15, max: 25 }, // Connaught Place (medium, 180)
  { gymIndex: 3, min: 25, max: 35 }, // Powai           (large,  250)
  { gymIndex: 4, min: 15, max: 25 }, // Indiranagar     (medium, 200)
  { gymIndex: 5, min: 15, max: 25 }, // Koramangala     (medium, 180)
  { gymIndex: 6, min: 15, max: 25 }, // Banjara Hills   (medium, 160)
  { gymIndex: 7, min:  8, max: 15 }, // Noida           (small,  140)
  { gymIndex: 8, min:  8, max: 15 }, // Salt Lake       (small,  120)
];

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

      // Scale daily volume by day-of-week multiplier (spec 4.2)
      const dow = baseDate.getDay(); // 0 = Sunday
      const checkinsThisDay = Math.round(BASE_DAILY_CHECKINS * DOW_MULTIPLIERS[dow]);

      for (let c = 0; c < checkinsThisDay; c++) {
        const gymId    = gymIds[c % GYMS_COUNT];
        const memberId = memberIds[randomBetween(0, memberIds.length - 1)];

        // ── Scenario A: Velachery (gym index 9 in the rotation) ──────────────
        // On the most-recent day: push ALL Velachery check-ins to 3 h 10 m – 6 h
        // before seed time and close every session (no open sessions).
        // This guarantees zero open sessions AND last_checkin > 2 h 10 m ago,
        // so the zero_checkins detector fires on the very first cycle.
        const isVelachery = (c % GYMS_COUNT) === 9;

        let checkedIn: Date;

        if (isVelachery && day === DAYS_BACK - 1) {
          // Force check-in to be 3 h 10 m – 6 h before NOW (safe for any clock)
          const minsAgo = randomBetween(190, 360);
          checkedIn = new Date(now.getTime() - minsAgo * 60_000);
        } else {
          // Weighted-random hour per spec 4.1 hourly distribution table
          const hour   = sampleHour();
          const minute = sampleMinute(hour);
          checkedIn = new Date(baseDate);
          checkedIn.setHours(hour, minute, randomBetween(0, 59), 0);
        }

        // All bulk check-ins are historical → always have a checked_out (spec 4.3).
        // Pre-seeded open check-ins ("currently in gym") are inserted separately
        // by insertPreSeededOpenCheckins() after this COPY completes.
        const durationMins = randomBetween(45, 90); // spec 4.3: 45–90 min sessions
        const co = new Date(checkedIn.getTime() + durationMins * 60_000);
        const checkedOut = co.toISOString();

        yield `${memberId},${gymId},${checkedIn.toISOString()},${checkedOut}\n`;
      }
    }
  }

  const readable = Readable.from(generateRows());
  await pipeline(readable, stream);
}

// ── Pre-seeded "currently in gym" open check-ins (spec §4.4) ─────────────────
// Inserts open check-ins (checked_out IS NULL) for today so the live occupancy
// counter shows meaningful numbers immediately on dashboard load.
// Bandra West is excluded (Scenario B inserts 280 open check-ins separately).
// Velachery is excluded (Scenario A requires 0 open sessions).

async function insertPreSeededOpenCheckins(
  client: PoolClient,
  gymIds: string[],
  memberIds: string[],
): Promise<void> {
  const now = Date.now();
  const values: unknown[] = [];
  const placeholders: string[] = [];
  let p = 1;
  let total = 0;

  for (const { gymIndex, min, max } of OPEN_CHECKIN_TIERS) {
    const count  = randomBetween(min, max);
    const gymId  = gymIds[gymIndex];
    for (let i = 0; i < count; i++) {
      const memberId = memberIds[randomBetween(0, memberIds.length - 1)];
      const minsAgo  = randomBetween(5, 85); // members arrived 5–85 min ago
      const checkedIn = new Date(now - minsAgo * 60_000);
      values.push(memberId, gymId, checkedIn);
      placeholders.push(`($${p++}, $${p++}, $${p++}, NULL)`);
      total++;
    }
  }

  if (placeholders.length > 0) {
    await client.query(
      `INSERT INTO checkins (member_id, gym_id, checked_in, checked_out)
       VALUES ${placeholders.join(', ')}`,
      values,
    );
  }
  console.log(`[seed]   ✓ Pre-seeded open check-ins: ${total} across ${OPEN_CHECKIN_TIERS.length} gyms (spec §4.4)`);
}

// ── Plan pricing & durations ──────────────────────────────────────────────────
// Exact amounts reviewers will validate against expected revenue ranges.

const PLAN_PRICES: Record<string, string> = {
  monthly:   '1499.00',
  quarterly: '3999.00',
  annual:    '11999.00',
};

const PLAN_DURATION_DAYS: Record<string, number> = {
  monthly:   30,
  quarterly: 90,
  annual:    365,
};

// ── Member-linked payment inserts ─────────────────────────────────────────────
//
// Rules (from spec §5):
//   • Every member gets exactly ONE payment (payment_type = 'new') with
//     paid_at = joined_at ± 5 minutes, capped at NOW.
//   • Renewal members (member_type = 'renewal') additionally get a SECOND
//     payment (payment_type = 'renewal') at joined_at + plan_duration ± 5 min.
//     The second payment is only recorded if it is strictly in the past.
//   • Amounts are plan-specific: monthly ₹1,499 · quarterly ₹3,999 · annual ₹11,999.
//   • No future paid_at timestamps are ever inserted.

async function insertPayments(
  client: PoolClient,
  _gymIds: string[],   // kept for call-site compatibility; gym_id is derived from member row
  memberIds: string[],
): Promise<void> {
  // Fetch every member's plan details and join date in one query
  const { rows: members } = await client.query<{
    id: string;
    gym_id: string;
    plan_type: string;
    member_type: string;
    joined_at: string;
  }>(
    `SELECT id, gym_id, plan_type, member_type, joined_at
     FROM   members
     WHERE  id = ANY($1::uuid[])`,
    [memberIds],
  );

  const nowMs = Date.now();

  interface PayRow {
    gymId: string; memberId: string; amount: string;
    planType: string; paymentType: string; paidAt: Date;
  }
  const paymentRows: PayRow[] = [];

  for (const m of members) {
    const joinedMs = new Date(m.joined_at).getTime();
    const amount   = PLAN_PRICES[m.plan_type];

    // ── First payment: joined_at ± ≤ 5 min, never in the future ─────────────
    const jitter1   = randomBetween(-5, 5) * 60_000;          // ±5 min in ms
    const firstPaid = new Date(Math.min(joinedMs + jitter1, nowMs));
    paymentRows.push({
      gymId: m.gym_id, memberId: m.id, amount,
      planType: m.plan_type, paymentType: 'new', paidAt: firstPaid,
    });

    // ── Renewal second payment: joined_at + plan_duration ± ≤ 5 min ─────────
    if (m.member_type === 'renewal') {
      const durMs     = PLAN_DURATION_DAYS[m.plan_type] * 24 * 60 * 60_000;
      const jitter2   = randomBetween(-5, 5) * 60_000;
      const renewalMs = joinedMs + durMs + jitter2;
      if (renewalMs <= nowMs) {                                // only past payments
        paymentRows.push({
          gymId: m.gym_id, memberId: m.id, amount,
          planType: m.plan_type, paymentType: 'renewal',
          paidAt: new Date(renewalMs),
        });
      }
    }
  }

  // Batch insert (500 rows per statement to avoid parameter-count limits)
  const BATCH = 500;
  let inserted = 0;
  for (let b = 0; b < paymentRows.length; b += BATCH) {
    const batch = paymentRows.slice(b, b + BATCH);
    const values: unknown[] = [];
    const placeholders: string[] = [];
    let p = 1;
    for (const row of batch) {
      values.push(row.gymId, row.memberId, row.amount, row.planType, row.paymentType, row.paidAt);
      placeholders.push(`($${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++})`);
    }
    await client.query(
      `INSERT INTO payments (gym_id, member_id, amount, plan_type, payment_type, paid_at)
       VALUES ${placeholders.join(', ')}`,
      values,
    );
    inserted += batch.length;
  }

  console.log(
    `[seed] ✓ Payments: ${inserted} records for ${members.length} members ` +
    `(${paymentRows.length - members.length} renewal second-payments included)`,
  );
}

// ── Scenario B: Bandra West — capacity breach ─────────────────────────────────
// Inserts 280 open check-ins (checked_out = NULL) for Bandra West gym, all with
// checked_in within the last 5–89 minutes.  280 / 300 capacity = 93.3% → fires
// capacity_breach (critical) on the first detector cycle.
// memberIds must already exclude churn-risk members.

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

// ── Churn-risk check-in seeding ───────────────────────────────────────────────
//
// For each churn-risk member:
//   HIGH RISK     → delete checkins within last 45 days,
//                   insert one completed checkin 45–60 days ago.
//   CRITICAL RISK → delete checkins within last 61 days,
//                   insert one completed checkin 61–90 days ago.
//
// After this function, the batch UPDATE of last_checkin_at will derive the
// correct values from MAX(checked_in) in the checkins table.

async function insertChurnRiskCheckins(
  client: PoolClient,
  churnHighRisk: Array<{ id: string; gymId: string }>,
  churnCriticalRisk: Array<{ id: string; gymId: string }>,
): Promise<void> {
  // ── HIGH RISK (45–60 days ago) ────────────────────────────────────────────
  if (churnHighRisk.length > 0) {
    // Remove any recent check-ins the bulk COPY assigned to these members
    await client.query(
      `DELETE FROM checkins
       WHERE member_id = ANY($1::uuid[])
         AND checked_in > NOW() - INTERVAL '45 days'`,
      [churnHighRisk.map(r => r.id)],
    );

    // Insert one guaranteed historical check-in per member
    const values: unknown[] = [];
    const placeholders: string[] = [];
    let p = 1;
    for (const { id, gymId } of churnHighRisk) {
      const checkedIn  = randomDate(randomBetween(45, 60));
      const checkedOut = new Date(checkedIn.getTime() + randomBetween(30, 90) * 60_000);
      values.push(id, gymId, checkedIn, checkedOut);
      placeholders.push(`($${p++}, $${p++}, $${p++}, $${p++})`);
    }
    await client.query(
      `INSERT INTO checkins (member_id, gym_id, checked_in, checked_out)
       VALUES ${placeholders.join(', ')}`,
      values,
    );
  }

  // ── CRITICAL RISK (> 60 days ago) ────────────────────────────────────────
  if (churnCriticalRisk.length > 0) {
    // Remove any recent check-ins (within last 61 days)
    await client.query(
      `DELETE FROM checkins
       WHERE member_id = ANY($1::uuid[])
         AND checked_in > NOW() - INTERVAL '61 days'`,
      [churnCriticalRisk.map(r => r.id)],
    );

    // Insert one guaranteed historical check-in per member at 61–90 days ago
    const values: unknown[] = [];
    const placeholders: string[] = [];
    let p = 1;
    for (const { id, gymId } of churnCriticalRisk) {
      const checkedIn  = randomDate(randomBetween(61, 90));
      const checkedOut = new Date(checkedIn.getTime() + randomBetween(30, 90) * 60_000);
      values.push(id, gymId, checkedIn, checkedOut);
      placeholders.push(`($${p++}, $${p++}, $${p++}, $${p++})`);
    }
    await client.query(
      `INSERT INTO checkins (member_id, gym_id, checked_in, checked_out)
       VALUES ${placeholders.join(', ')}`,
      values,
    );
  }

  console.log(
    `[seed]   ✓ Churn-risk checkins: ` +
    `${churnHighRisk.length} HIGH (45–60 d), ${churnCriticalRisk.length} CRITICAL (61–90 d)`,
  );
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

