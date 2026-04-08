import pool from '../db/pool';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GymListItem {
  id: string;
  name: string;
  city: string;
  capacity: number;
  current_occupancy: number;
  today_revenue: number;
  status: string;
}

export interface RecentEvent {
  member_id: string;
  checked_in: string;
  checked_out: string | null;
}

export interface ActiveAnomaly {
  id: string;
  type: string;
  severity: string;
  message: string;
  detected_at: string;
}

export interface GymLiveSnapshot {
  id: string;
  name: string;
  city: string;
  capacity: number;
  status: string;
  current_occupancy: number;
  today_revenue: number;
  recent_events: RecentEvent[];
  active_anomalies: ActiveAnomaly[];
}

export interface HeatmapEntry {
  day_of_week: number;
  hour_of_day: number;
  checkin_count: number;
}

export interface RevenuePlanEntry {
  plan_type: string;
  total_revenue: number;
}

export interface ChurnRiskMember {
  id: string;
  name: string;
  email: string | null;
  last_checkin_at: string | null;
}

export interface NewRenewalEntry {
  payment_type: string;
  count: number;
}

export interface GymAnalytics {
  heatmap: HeatmapEntry[];
  revenue_by_plan: RevenuePlanEntry[];
  churn_risk_members: ChurnRiskMember[];
  new_renewal_ratio: NewRenewalEntry[];
}

// ── Queries ───────────────────────────────────────────────────────────────────

/**
 * Returns all gyms with current occupancy and today's revenue.
 * Uses idx_checkins_live_occupancy + idx_payments_gym_date for performance.
 */
export async function findAllGyms(): Promise<GymListItem[]> {
  const { rows } = await pool.query(`
    SELECT
      g.id,
      g.name,
      g.city,
      g.capacity,
      g.status,
      COUNT(c.id) FILTER (WHERE c.checked_out IS NULL)::INT             AS current_occupancy,
      COALESCE(SUM(p.amount) FILTER (WHERE p.paid_at >= CURRENT_DATE), 0)::FLOAT AS today_revenue
    FROM gyms g
    LEFT JOIN checkins c ON c.gym_id = g.id
    LEFT JOIN payments p ON p.gym_id = g.id
    GROUP BY g.id
    ORDER BY g.name
  `);
  return rows;
}

/**
 * Returns a single gym summary (same shape as list).
 */
export async function findGymById(id: string): Promise<GymListItem | null> {
  const { rows } = await pool.query(
    `
    SELECT
      g.id,
      g.name,
      g.city,
      g.capacity,
      g.status,
      COUNT(c.id) FILTER (WHERE c.checked_out IS NULL)::INT             AS current_occupancy,
      COALESCE(SUM(p.amount) FILTER (WHERE p.paid_at >= CURRENT_DATE), 0)::FLOAT AS today_revenue
    FROM gyms g
    LEFT JOIN checkins c ON c.gym_id = g.id
    LEFT JOIN payments p ON p.gym_id = g.id
    WHERE g.id = $1
    GROUP BY g.id
    `,
    [id],
  );
  return rows[0] ?? null;
}

/**
 * Live snapshot for a single gym.
 * All queries run in parallel via Promise.all to stay well under the 5ms target.
 * Each sub-query uses a covering index (no heap fetch needed).
 */
export async function findGymLiveSnapshot(gymId: string): Promise<GymLiveSnapshot | null> {
  const [gymRes, occupancyRes, revenueRes, eventsRes, anomalyRes] = await Promise.all([
    pool.query<{ id: string; name: string; city: string; capacity: number; status: string }>(
      `SELECT id, name, city, capacity, status FROM gyms WHERE id = $1`,
      [gymId],
    ),
    pool.query<{ count: number }>(
      `SELECT COUNT(*)::INT AS count
       FROM checkins
       WHERE gym_id = $1 AND checked_out IS NULL`,
      [gymId],
    ),
    pool.query<{ total: number }>(
      `SELECT COALESCE(SUM(amount), 0)::FLOAT AS total
       FROM payments
       WHERE gym_id = $1 AND paid_at >= CURRENT_DATE`,
      [gymId],
    ),
    pool.query<RecentEvent>(
      `SELECT member_id, checked_in, checked_out
       FROM checkins
       WHERE gym_id = $1
       ORDER BY checked_in DESC
       LIMIT 10`,
      [gymId],
    ),
    pool.query<ActiveAnomaly>(
      `SELECT id, type, severity, message, detected_at
       FROM anomalies
       WHERE gym_id = $1 AND resolved = FALSE
       ORDER BY detected_at DESC`,
      [gymId],
    ),
  ]);

  if (!gymRes.rows.length) return null;

  const gym = gymRes.rows[0];
  return {
    id: gym.id,
    name: gym.name,
    city: gym.city,
    capacity: gym.capacity,
    status: gym.status,
    current_occupancy: occupancyRes.rows[0].count,
    today_revenue: revenueRes.rows[0].total,
    recent_events: eventsRes.rows,
    active_anomalies: anomalyRes.rows,
  };
}

/**
 * Full analytics for a gym over a given date range.
 * All queries run in parallel.
 */
export async function findGymAnalytics(gymId: string, days: number): Promise<GymAnalytics> {
  const [heatmapRes, revenuePlanRes, churnRes, newRenewalRes] = await Promise.all([
    // Peak-hour heatmap from pre-computed materialized view (always covers last 7 days)
    pool.query<HeatmapEntry>(
      `SELECT day_of_week, hour_of_day, checkin_count
       FROM gym_hourly_stats
       WHERE gym_id = $1
       ORDER BY day_of_week, hour_of_day`,
      [gymId],
    ),
    // Revenue broken down by plan type for the requested window
    pool.query<RevenuePlanEntry>(
      `SELECT plan_type, SUM(amount)::FLOAT AS total_revenue
       FROM payments
       WHERE gym_id = $1
         AND paid_at >= NOW() - ($2::int * INTERVAL '1 day')
       GROUP BY plan_type
       ORDER BY total_revenue DESC`,
      [gymId, days],
    ),
    // Active members who haven't checked in for 45+ days (churn risk)
    pool.query<ChurnRiskMember>(
      `SELECT id, name, email, last_checkin_at
       FROM members
       WHERE gym_id = $1
         AND status = 'active'
         AND (last_checkin_at IS NULL OR last_checkin_at < NOW() - ($2::int * INTERVAL '1 day'))
       ORDER BY last_checkin_at ASC NULLS FIRST`,
      [gymId, 45],
    ),
    // New vs renewal payment ratio in the requested window
    pool.query<NewRenewalEntry>(
      `SELECT payment_type, COUNT(*)::INT AS count
       FROM payments
       WHERE gym_id = $1
         AND paid_at >= NOW() - ($2::int * INTERVAL '1 day')
       GROUP BY payment_type`,
      [gymId, days],
    ),
  ]);

  return {
    heatmap: heatmapRes.rows,
    revenue_by_plan: revenuePlanRes.rows,
    churn_risk_members: churnRes.rows,
    new_renewal_ratio: newRenewalRes.rows,
  };
}

