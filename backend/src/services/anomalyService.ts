import pool from '../db/pool';
import { broadcastToGym, broadcastToAll } from '../websocket';
import { AnomalyPayload } from '../types/events';

// Must match DB CHECK constraint: CHECK (severity IN ('warning', 'critical'))
export type AnomalySeverity = 'warning' | 'critical';

// Must match DB CHECK constraint: CHECK (type IN ('zero_checkins', 'capacity_breach', 'revenue_drop'))
export type AnomalyType = 'zero_checkins' | 'capacity_breach' | 'revenue_drop';

export interface DetectAnomalyParams {
  gymId: string;
  type: AnomalyType;
  severity: AnomalySeverity;
  message: string;
}

// ── Core insert + broadcast ───────────────────────────────────────────────────

export async function detectAndSave(params: DetectAnomalyParams): Promise<AnomalyPayload> {
  // CTE joins gyms so we get gym_name in a single round-trip
  const { rows } = await pool.query(
    `WITH ins AS (
       INSERT INTO anomalies (gym_id, type, severity, message)
       VALUES ($1, $2, $3, $4)
       RETURNING *
     )
     SELECT ins.*, COALESCE(g.name, '') AS gym_name
     FROM ins
     LEFT JOIN gyms g ON g.id = ins.gym_id`,
    [params.gymId, params.type, params.severity, params.message]
  );
  const anomaly = rows[0];
  const payload: AnomalyPayload = {
    id: anomaly.id,
    gymId: anomaly.gym_id,
    gymName: anomaly.gym_name ?? '',
    type: anomaly.type,
    severity: anomaly.severity,
    message: anomaly.message,
    detectedAt: anomaly.detected_at,
  };
  broadcastToGym(params.gymId, 'anomaly:detected', payload);
  return payload;
}

// ── Manual resolve (used by PATCH /api/anomalies/:id/resolve) ─────────────────

export async function resolveAnomaly(id: string): Promise<boolean> {
  const { rows } = await pool.query(
    `UPDATE anomalies SET resolved = TRUE, resolved_at = NOW()
     WHERE id = $1 AND resolved = FALSE RETURNING *`,
    [id]
  );
  if (!rows.length) return false;
  broadcastToAll('anomaly:resolved', {
    id,
    gymId: rows[0].gym_id,
    ...(rows[0].resolved_at ? { resolvedAt: new Date(rows[0].resolved_at).toISOString() } : {}),
  });
  return true;
}

// ── Helper: check for existing unresolved anomaly ────────────────────────────

async function hasUnresolved(gymId: string, type: AnomalyType): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT 1 FROM anomalies WHERE gym_id = $1 AND type = $2 AND resolved = FALSE LIMIT 1`,
    [gymId, type]
  );
  return rows.length > 0;
}

async function resolveByType(gymId: string, type: AnomalyType): Promise<void> {
  const { rows } = await pool.query(
    `UPDATE anomalies SET resolved = TRUE, resolved_at = NOW()
     WHERE gym_id = $1 AND type = $2 AND resolved = FALSE
     RETURNING id, gym_id, resolved_at`,
    [gymId, type]
  );
  for (const row of rows) {
    broadcastToAll('anomaly:resolved', {
      id: row.id,
      gymId: row.gym_id,
      ...(row.resolved_at ? { resolvedAt: new Date(row.resolved_at).toISOString() } : {}),
    });
  }
}

// ── Scenario A: Zero check-ins ────────────────────────────────────────────────
// Fires when a gym has 0 open sessions AND the last check-in was > 2 hours ago.
// Auto-resolves when activity resumes.

export async function checkZeroCheckinsAnomaly(gymId: string): Promise<void> {
  const { rows } = await pool.query(
    `SELECT
       (SELECT COUNT(*) FROM checkins WHERE gym_id = $1 AND checked_out IS NULL) AS open_count,
       (SELECT MAX(checked_in) FROM checkins WHERE gym_id = $1)                  AS last_checkin`,
    [gymId]
  );

  const openCount = parseInt(rows[0].open_count, 10);
  const lastCheckin: Date | null = rows[0].last_checkin ? new Date(rows[0].last_checkin) : null;

  if (openCount === 0) {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1_000);
    const stale = !lastCheckin || lastCheckin < twoHoursAgo;

    if (stale && !(await hasUnresolved(gymId, 'zero_checkins'))) {
      const lastActivity = lastCheckin
        ? `${Math.round((Date.now() - lastCheckin.getTime()) / 3_600_000)}h ago`
        : 'never';
      await detectAndSave({
        gymId,
        type: 'zero_checkins',
        severity: 'warning',
        message: `No active check-ins detected. Last activity: ${lastActivity}.`,
      });
    }
  } else {
    // Activity restored — resolve any open zero_checkins alert
    await resolveByType(gymId, 'zero_checkins');
  }
}

// ── Scenario B: Capacity breach ───────────────────────────────────────────────
// Fires when live occupancy > 90% of capacity (severity: critical).
// Auto-resolves when occupancy drops back below 85%.

export async function checkOccupancyAnomaly(gymId: string, capacity: number): Promise<void> {
  const { rows } = await pool.query(
    `SELECT COUNT(*) AS count FROM checkins WHERE gym_id = $1 AND checked_out IS NULL`,
    [gymId]
  );
  const occupancy = parseInt(rows[0].count, 10);
  const pct = occupancy / capacity;

  if (pct > 0.9) {
    if (!(await hasUnresolved(gymId, 'capacity_breach'))) {
      await detectAndSave({
        gymId,
        type: 'capacity_breach',
        severity: 'critical',
        message: `Gym at ${Math.round(pct * 100)}% capacity (${occupancy}/${capacity})`,
      });
    }
  } else if (pct < 0.85) {
    // Occupancy has recovered — auto-resolve
    await resolveByType(gymId, 'capacity_breach');
  }
}

// ── Scenario C: Revenue drop ──────────────────────────────────────────────────
// Fires when today's revenue is >70% below the same weekday last week.

export async function checkRevenueAnomaly(gymId: string): Promise<void> {
  const { rows } = await pool.query(
    `SELECT
       COALESCE(SUM(amount) FILTER (WHERE paid_at >= CURRENT_DATE), 0)                         AS today_revenue,
       COALESCE(SUM(amount) FILTER (
         WHERE paid_at >= (CURRENT_DATE - INTERVAL '7 days')
           AND paid_at <  (CURRENT_DATE - INTERVAL '6 days')
       ), 0)                                                                                    AS last_week_revenue
     FROM payments
     WHERE gym_id = $1`,
    [gymId]
  );

  const today = parseFloat(rows[0].today_revenue);
  const lastWeek = parseFloat(rows[0].last_week_revenue);

  // >70% revenue drop vs same weekday last week
  if (lastWeek > 0 && today < lastWeek * 0.3) {
    if (!(await hasUnresolved(gymId, 'revenue_drop'))) {
      const dropPct = Math.round((1 - today / lastWeek) * 100);
      await detectAndSave({
        gymId,
        type: 'revenue_drop',
        severity: 'warning',
        message: `Revenue drop: today ₹${today.toFixed(2)} vs same day last week ₹${lastWeek.toFixed(2)} (${dropPct}% drop)`,
      });
    }
  }
}
