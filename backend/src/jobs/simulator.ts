import { runSimulatorTick } from '../services/simulatorService';
import pool from '../db/pool';

// ── Types ─────────────────────────────────────────────────────────────────────

export type SimulatorSpeed = 1 | 5 | 10;
export type SimulatorState = 'running' | 'paused';

// ── Speed → tick interval mapping ────────────────────────────────────────────

const SPEED_INTERVALS: Record<SimulatorSpeed, number> = {
  1:  3_000,  // 1× — one tick every 3 s
  5:    600,  // 5× — one tick every 600 ms
  10:   300,  // 10× — one tick every 300 ms
};

// ── Internal state ────────────────────────────────────────────────────────────

let timer:        NodeJS.Timeout | null = null;
let currentSpeed: SimulatorSpeed        = 1;
let state:        SimulatorState        = 'paused';
let running:      boolean               = false; // guard against overlapping ticks

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Start (or restart at a new speed) the simulator.
 * Calling with no argument keeps the original 1× boot behaviour.
 */
export function startSimulator(speed: SimulatorSpeed = 1): void {
  stopSimulator(); // clear any running interval first

  currentSpeed = speed;
  state        = 'running';

  const interval = SPEED_INTERVALS[speed];
  console.log(`[simulator] Starting at ${speed}× speed (tick every ${interval}ms)`);

  running = true;

  const scheduleTick = () => {
    if (!running) return;
    timer = setTimeout(async () => {
      if (!running) return;
      try {
        await runSimulatorTick();
      } catch (err) {
        console.error('[simulator] Tick error:', err);
      }
      // schedule next tick only after this one finishes
      scheduleTick();
    }, interval);
  };

  scheduleTick();
}

/** Pause the simulator without touching DB data. */
export function stopSimulator(): void {
  running = false;
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  state = 'paused';
  console.log('[simulator] Stopped');
}

/**
 * Stop the simulator and close all open check-ins, returning live data
 * to the seeded baseline (historical data is preserved).
 */
export async function resetSimulator(): Promise<void> {
  stopSimulator();
  const { rowCount } = await pool.query(
    `UPDATE checkins SET checked_out = NOW() WHERE checked_out IS NULL`,
  );
  console.log(`[simulator] Reset: closed ${rowCount ?? 0} open check-in(s)`);
}

/** Current runtime state — consumed by the simulator controller. */
export function getSimulatorStatus(): { state: SimulatorState; speed: SimulatorSpeed } {
  return { state, speed: currentSpeed };
}
