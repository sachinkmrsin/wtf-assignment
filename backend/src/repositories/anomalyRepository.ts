import pool from '../db/pool';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AnomalyRecord {
  id: string;
  gym_id: string;
  gym_name: string;
  type: string;
  severity: string;
  message: string;
  resolved: boolean;
  dismissed: boolean;
  detected_at: string;
  resolved_at: string | null;
}

export interface AnomalyFilters {
  gym_id?: string;
  severity?: string;
}

// ── Queries ───────────────────────────────────────────────────────────────────

/**
 * Returns all active (unresolved, not dismissed) anomalies.
 * Optional filters: gym_id, severity.
 * Uses idx_anomalies_active partial index for maximum speed on the hot path.
 */
export async function findActiveAnomalies(filters: AnomalyFilters): Promise<AnomalyRecord[]> {
  const conditions: string[] = ['a.resolved = FALSE', 'a.dismissed = FALSE'];
  const params: unknown[] = [];
  let p = 1;

  if (filters.gym_id) {
    conditions.push(`a.gym_id = $${p++}`);
    params.push(filters.gym_id);
  }
  if (filters.severity) {
    conditions.push(`a.severity = $${p++}`);
    params.push(filters.severity);
  }

  const { rows } = await pool.query(
    `SELECT a.*, g.name AS gym_name
     FROM anomalies a
     JOIN gyms g ON g.id = a.gym_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY a.detected_at DESC`,
    params
  );
  return rows;
}

/**
 * Returns a single anomaly by ID (including gym_name).
 */
export async function findAnomalyById(id: string): Promise<AnomalyRecord | null> {
  const { rows } = await pool.query(
    `SELECT a.*, g.name AS gym_name
     FROM anomalies a
     JOIN gyms g ON g.id = a.gym_id
     WHERE a.id = $1`,
    [id]
  );
  return rows[0] ?? null;
}

/**
 * Marks a warning-level anomaly as dismissed.
 * Only updates if severity = 'warning' AND resolved = FALSE AND dismissed = FALSE.
 * Returns the updated record, or null if the update had no effect.
 */
export async function dismissAnomalyById(id: string): Promise<AnomalyRecord | null> {
  const { rows } = await pool.query(
    `UPDATE anomalies
     SET dismissed = TRUE
     WHERE id = $1
       AND severity = 'warning'
       AND resolved  = FALSE
       AND dismissed = FALSE
     RETURNING *`,
    [id]
  );
  return rows[0] ?? null;
}
