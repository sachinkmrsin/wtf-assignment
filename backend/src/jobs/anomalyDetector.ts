import { getAllGymIds, getGymCapacity, refreshHeatmap } from '../services/statsService';
import {
  checkZeroCheckinsAnomaly,
  checkOccupancyAnomaly,
  checkRevenueAnomaly,
} from '../services/anomalyService';

const ANOMALY_CHECK_INTERVAL_MS = 60_000; // every 60 seconds
const HEATMAP_REFRESH_INTERVAL_MS = 15 * 60_000; // every 15 minutes

let anomalyTimer: NodeJS.Timeout | null = null;
let heatmapTimer: NodeJS.Timeout | null = null;

async function runAnomalyCheck(): Promise<void> {
  const gymIds = await getAllGymIds();
  for (const gymId of gymIds) {
    try {
      const capacity = await getGymCapacity(gymId);
      await checkZeroCheckinsAnomaly(gymId); // Scenario A
      await checkOccupancyAnomaly(gymId, capacity); // Scenario B
      await checkRevenueAnomaly(gymId); // Scenario C
    } catch (err) {
      console.warn(`[anomalyDetector] check failed for gym ${gymId}:`, err);
    }
  }
}

export function startAnomalyDetector(): void {
  if (anomalyTimer) return;

  // Run immediately on startup — satisfies "within 30 seconds of boot" requirement
  console.log('[anomalyDetector] Running initial anomaly check on startup...');
  runAnomalyCheck().catch((err) => console.error('[anomalyDetector] Initial check error:', err));

  console.log('[anomalyDetector] Starting anomaly detection (every 60s)');
  anomalyTimer = setInterval(async () => {
    try {
      await runAnomalyCheck();
    } catch (err) {
      console.error('[anomalyDetector] Error:', err);
    }
  }, ANOMALY_CHECK_INTERVAL_MS);

  console.log('[anomalyDetector] Starting heatmap refresh (every 15m)');
  heatmapTimer = setInterval(async () => {
    try {
      await refreshHeatmap();
    } catch (err) {
      console.error('[anomalyDetector] Heatmap refresh error:', err);
    }
  }, HEATMAP_REFRESH_INTERVAL_MS);
}

export function stopAnomalyDetector(): void {
  if (anomalyTimer) {
    clearInterval(anomalyTimer);
    anomalyTimer = null;
  }
  if (heatmapTimer) {
    clearInterval(heatmapTimer);
    heatmapTimer = null;
  }
  console.log('[anomalyDetector] Stopped');
}
