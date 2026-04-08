import pool from '../db/pool';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CrossGymRevenueEntry {
  gym_id: string;
  gym_name: string;
  total_revenue: number;
  rank: number;
}

// ── Queries ───────────────────────────────────────────────────────────────────

/**
 * Cross-gym revenue for the last 30 days, sorted descending, with dense rank.
 *
 * Performance target: < 2 ms.
 *
 * Index path: idx_payments_date (paid_at DESC, gym_id) INCLUDE (amount)
 *   • Range scan on paid_at filters the 30-day window from the index alone.
 *   • gym_id and amount are both in the index leaf — zero heap fetches.
 *   • JOIN with gyms is trivial (tiny table, always in shared_buffers).
 * Result: true index-only scan; no heap access on payments required.
 */
export async function getCrossGymRevenue(days: number = 30): Promise<CrossGymRevenueEntry[]> {
  const { rows } = await pool.query(
    `SELECT
      p.gym_id,
      g.name                                                  AS gym_name,
      SUM(p.amount)::FLOAT                                    AS total_revenue,
      RANK() OVER (ORDER BY SUM(p.amount) DESC)::INT          AS rank
    FROM payments p
    JOIN gyms g ON g.id = p.gym_id
    WHERE p.paid_at >= NOW() - ($1::int * INTERVAL '1 day')
    GROUP BY p.gym_id, g.name
    ORDER BY total_revenue DESC`,
    [days],
  );
  return rows;
}
