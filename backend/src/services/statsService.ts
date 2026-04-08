import pool from '../db/pool';

export interface GymStats {
  gymId: string;
  gymName: string;
  liveOccupancy: number;
  capacity: number;
  todayRevenue: number;
  todayCheckins: number;
  weeklyCheckins: number;
  activeMembers: number;
}

export async function getGymStats(gymId: string): Promise<GymStats | null> {
  const { rows } = await pool.query(
    `SELECT
       g.id          AS gym_id,
       g.name        AS gym_name,
       g.capacity,
       COUNT(DISTINCT c.id) FILTER (WHERE c.checked_out IS NULL)   AS live_occupancy,
       COALESCE(SUM(p.amount) FILTER (WHERE p.paid_at >= CURRENT_DATE), 0) AS today_revenue,
       COUNT(DISTINCT c.id) FILTER (WHERE c.checked_in >= CURRENT_DATE) AS today_checkins,
       COUNT(DISTINCT c.id) FILTER (WHERE c.checked_in >= NOW() - INTERVAL '7 days') AS weekly_checkins,
       COUNT(DISTINCT m.id) FILTER (WHERE m.status = 'active') AS active_members
     FROM gyms g
     LEFT JOIN checkins c ON c.gym_id = g.id
     LEFT JOIN payments p ON p.gym_id = g.id
     LEFT JOIN members  m ON m.gym_id = g.id
     WHERE g.id = $1
     GROUP BY g.id`,
    [gymId],
  );
  if (!rows.length) return null;
  const r = rows[0];
  return {
    gymId: r.gym_id,
    gymName: r.gym_name,
    liveOccupancy: parseInt(r.live_occupancy),
    capacity: parseInt(r.capacity),
    todayRevenue: parseFloat(r.today_revenue),
    todayCheckins: parseInt(r.today_checkins),
    weeklyCheckins: parseInt(r.weekly_checkins),
    activeMembers: parseInt(r.active_members),
  };
}

export async function getAllGymIds(): Promise<string[]> {
  const { rows } = await pool.query(`SELECT id FROM gyms ORDER BY name`);
  return rows.map((r) => r.id);
}

export async function getGymCapacity(gymId: string): Promise<number> {
  const { rows } = await pool.query(
    `SELECT capacity FROM gyms WHERE id = $1`,
    [gymId],
  );
  return rows[0]?.capacity ?? 100;
}

export async function refreshHeatmap(): Promise<void> {
  await pool.query(`REFRESH MATERIALIZED VIEW CONCURRENTLY gym_hourly_stats`);
  console.log('[stats] gym_hourly_stats refreshed');
}

