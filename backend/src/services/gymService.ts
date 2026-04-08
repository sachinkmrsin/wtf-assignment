import * as gymRepo from '../repositories/gymRepository';

// ── Valid date ranges ─────────────────────────────────────────────────────────

export const VALID_DATE_RANGES = ['7d', '30d', '90d'] as const;
export type DateRange = (typeof VALID_DATE_RANGES)[number];

const DATE_RANGE_DAYS: Record<DateRange, number> = {
  '7d':  7,
  '30d': 30,
  '90d': 90,
};

// ── Service methods ───────────────────────────────────────────────────────────

/** List all gyms with current occupancy and today's revenue. */
export function listGyms() {
  return gymRepo.findAllGyms();
}

/** Get a single gym by ID (summary view). Returns null if not found. */
export function getGymById(id: string) {
  return gymRepo.findGymById(id);
}

/**
 * Full live snapshot for a gym.
 * Returns null if the gym does not exist.
 */
export function getLiveSnapshot(gymId: string) {
  return gymRepo.findGymLiveSnapshot(gymId);
}

/**
 * Analytics for a gym over the specified date range.
 * Throws a typed error if dateRange is invalid.
 * Returns null if the gym does not exist.
 */
export async function getGymAnalytics(gymId: string, dateRange: string) {
  if (!VALID_DATE_RANGES.includes(dateRange as DateRange)) {
    const err = new Error('Invalid dateRange. Must be one of: 7d, 30d, 90d') as Error & {
      statusCode: number;
    };
    err.statusCode = 400;
    throw err;
  }

  // Confirm gym exists before running heavy analytics queries
  const gym = await gymRepo.findGymById(gymId);
  if (!gym) return null;

  const days = DATE_RANGE_DAYS[dateRange as DateRange];
  return gymRepo.findGymAnalytics(gymId, days);
}

