import pool from '../db/pool';
import { broadcastToGym } from '../websocket';
import { getAllGymIds, getGymStats } from './statsService';

let gymIds: string[] = [];

async function loadGymIds(): Promise<void> {
  gymIds = await getAllGymIds();
}

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomElement<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function getRandomMemberForGym(gymId: string): Promise<{ id: string; name: string; planType: string } | null> {
  const { rows } = await pool.query(
    `SELECT id, name, plan_type FROM members WHERE gym_id = $1 AND status = 'active'
     ORDER BY RANDOM() LIMIT 1`,
    [gymId],
  );
  if (!rows[0]) return null;
  return { id: rows[0].id, name: rows[0].name, planType: rows[0].plan_type };
}

async function getLiveOccupancyAndCapacity(gymId: string): Promise<{ count: number; capacity: number }> {
  const [occRow, gymRow] = await Promise.all([
    pool.query(`SELECT COUNT(*) AS count FROM checkins WHERE gym_id = $1 AND checked_out IS NULL`, [gymId]),
    pool.query(`SELECT capacity FROM gyms WHERE id = $1`, [gymId]),
  ]);
  return {
    count: parseInt(occRow.rows[0].count, 10),
    capacity: parseInt(gymRow.rows[0]?.capacity ?? '100', 10),
  };
}

export async function simulateCheckin(gymId: string): Promise<void> {
  const member = await getRandomMemberForGym(gymId);
  if (!member) return;

  const now = new Date().toISOString();

  const { rows: insertRows } = await pool.query(
    `INSERT INTO checkins (gym_id, member_id, checked_in)
     VALUES ($1, $2, NOW())
     RETURNING id`,
    [gymId, member.id],
  );
  const checkinId = insertRows[0].id;

  await pool.query(
    `UPDATE members SET last_checkin_at = NOW() WHERE id = $1`,
    [member.id],
  );

  const { count, capacity } = await getLiveOccupancyAndCapacity(gymId);
  const capacityPct = capacity > 0 ? Math.round((count / capacity) * 100) : 0;

  // CHECKIN_EVENT — includes member_name, current_occupancy, capacity_pct
  broadcastToGym(gymId, 'gym:checkin', {
    gymId,
    memberId: member.id,
    memberName: member.name,
    checkinId,
    checkedInAt: now,
    currentOccupancy: count,
    capacityPct,
  });

  // Live occupancy broadcast for summary bar
  broadcastToGym(gymId, 'gym:occupancy', {
    gymId,
    count,
    capacity,
    timestamp: now,
  });
}

export async function simulateCheckout(gymId: string): Promise<void> {
  const { rows } = await pool.query(
    `SELECT c.id, c.member_id, m.name AS member_name
     FROM checkins c
     JOIN members m ON m.id = c.member_id
     WHERE c.gym_id = $1 AND c.checked_out IS NULL
     ORDER BY c.checked_in ASC LIMIT 1`,
    [gymId],
  );
  if (!rows.length) return;

  const { id: checkinId, member_id: memberId, member_name: memberName } = rows[0];
  const now = new Date().toISOString();

  await pool.query(
    `UPDATE checkins SET checked_out = NOW() WHERE id = $1`,
    [checkinId],
  );

  const { count, capacity } = await getLiveOccupancyAndCapacity(gymId);
  const capacityPct = capacity > 0 ? Math.round((count / capacity) * 100) : 0;

  // CHECKOUT_EVENT — includes member_name, current_occupancy, capacity_pct
  broadcastToGym(gymId, 'gym:checkout', {
    gymId,
    memberId,
    memberName,
    checkinId,
    checkedOutAt: now,
    currentOccupancy: count,
    capacityPct,
  });

  // Live occupancy broadcast for summary bar
  broadcastToGym(gymId, 'gym:occupancy', {
    gymId,
    count,
    capacity,
    timestamp: now,
  });
}

export async function simulatePayment(gymId: string): Promise<void> {
  const member = await getRandomMemberForGym(gymId);
  if (!member) return;

  const amount = randomBetween(2000, 15000) / 100;
  const now = new Date().toISOString();

  await pool.query(
    `INSERT INTO payments (gym_id, member_id, amount, plan_type, paid_at)
     VALUES ($1, $2, $3, $4, NOW())`,
    [gymId, member.id, amount, member.planType],
  );

  // Get today's total revenue after this payment
  const { rows: revRows } = await pool.query(
    `SELECT COALESCE(SUM(amount), 0) AS today_total
     FROM payments WHERE gym_id = $1 AND paid_at >= CURRENT_DATE`,
    [gymId],
  );
  const todayTotal = parseFloat(revRows[0].today_total);

  // PAYMENT_EVENT — includes member_name, plan_type, today_total
  broadcastToGym(gymId, 'payment:new', {
    gymId,
    memberId: member.id,
    memberName: member.name,
    planType: member.planType,
    amount,
    todayTotal,
    paidAt: now,
  });

  // Also broadcast updated stats
  const stats = await getGymStats(gymId);
  if (stats) {
    broadcastToGym(gymId, 'stats:update', {
      gymId,
      dailyRevenue: stats.todayRevenue,
      weeklyCheckins: stats.weeklyCheckins,
      timestamp: now,
    });
  }
}

export async function runSimulatorTick(): Promise<void> {
  if (!gymIds.length) await loadGymIds();
  if (!gymIds.length) return;

  const count = randomBetween(1, 3);
  for (let i = 0; i < count; i++) {
    const gymId = randomElement(gymIds);
    const action = Math.random();

    try {
      if (action < 0.45) {
        await simulateCheckin(gymId);
      } else if (action < 0.75) {
        await simulateCheckout(gymId);
      } else {
        await simulatePayment(gymId);
      }
    } catch (err) {
      console.warn(`[simulator] tick error for gym ${gymId}:`, err);
    }
  }
}
