import * as anomalyRepo from '../repositories/anomalyRepository';
import { broadcastToAll } from '../websocket';

export type { AnomalyFilters, AnomalyRecord } from '../repositories/anomalyRepository';

// ── Service methods ───────────────────────────────────────────────────────────

/** List active anomalies with optional gym_id / severity filters. */
export function getActiveAnomalies(filters: anomalyRepo.AnomalyFilters) {
  return anomalyRepo.findActiveAnomalies(filters);
}

/**
 * Dismiss a warning-level anomaly.
 *
 * Returns:
 *  - { forbidden: true }                   — anomaly is critical (HTTP 403)
 *  - { anomaly: null, forbidden: false }    — anomaly not found or already dismissed (HTTP 404)
 *  - { anomaly: <record>, forbidden: false } — success (HTTP 200)
 */
export async function dismissAnomaly(
  id: string,
): Promise<{ anomaly: anomalyRepo.AnomalyRecord | null; forbidden: boolean }> {
  // Load anomaly first so we can check its severity
  const existing = await anomalyRepo.findAnomalyById(id);
  if (!existing) return { anomaly: null, forbidden: false };

  // Critical anomalies cannot be dismissed
  if (existing.severity === 'critical') return { anomaly: null, forbidden: true };

  const updated = await anomalyRepo.dismissAnomalyById(id);
  if (updated) {
    broadcastToAll('anomaly:resolved', { id: updated.id, gymId: updated.gym_id });
  }
  return { anomaly: updated, forbidden: false };
}

