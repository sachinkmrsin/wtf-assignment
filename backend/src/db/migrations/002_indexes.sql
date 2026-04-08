-- ============================================================
-- 002_indexes.sql
-- Supplementary indexes — all REQUIRED indexes live in 001_initial.sql.
-- Each index here is justified by a concrete query in the codebase.
-- ============================================================

-- ── checkins.gym_id ───────────────────────────────────────────────────────────
-- Queries:
--   GET /api/gyms          → LEFT JOIN checkins c ON c.gym_id = g.id  (all gyms at once)
--   GET /api/gyms/:id      → same join, single gym
--   statsService.getGymStats → triple join: gyms+checkins+payments+members on gym_id
-- Without this, every gym-level aggregation does a seq-scan on the full checkins table.
-- The partial index idx_checkins_live_occupancy only covers open check-ins; this covers
-- the full range needed for today_checkins / weekly_checkins aggregations.
CREATE INDEX IF NOT EXISTS idx_checkins_gym_id ON checkins (gym_id);

-- ── payments.member_id ───────────────────────────────────────────────────────
-- Queries:
--   No direct SELECT by member_id today, but:
--   1. ON DELETE CASCADE: when a member is deleted, Postgres must locate and delete
--      all their payments. Without this index that becomes a full seq-scan on payments.
--   2. Future member-level payment history endpoint (obvious next feature).
-- Cost: small — payments is append-only so the index stays compact.
CREATE INDEX IF NOT EXISTS idx_payments_member_id ON payments (member_id);

-- ── anomalies.gym_id ──────────────────────────────────────────────────────────
-- Queries:
--   GET /api/anomalies?resolved=true  → WHERE a.resolved = TRUE (no partial index covers this)
--   GET /api/anomalies/:id            → JOIN gyms g ON g.id = a.gym_id
--   ON DELETE CASCADE from gyms       → must locate all anomalies for a gym
-- Note: idx_anomalies_active (partial, resolved=FALSE) covers the hot path;
-- this plain index covers resolved=TRUE lookups and FK enforcement.
CREATE INDEX IF NOT EXISTS idx_anomalies_gym_id ON anomalies (gym_id);

-- Covering index for cross-gym revenue comparison (Q5) and any paid_at range query:
--   • paid_at DESC  — range scan for the N-day window
--   • gym_id        — GROUP BY key read from the index leaf, no extra sort
--   • INCLUDE amount — aggregate value in the leaf; zero heap fetches
--   • fillfactor=100 — payments are append-only (never UPDATEd), so reserving
--                      page space for HOT updates is wasted I/O; full packing
--                      shrinks the index and reduces the range-scan page count
-- Result: true index-only scan for the 30-day cross-gym revenue query.
CREATE INDEX IF NOT EXISTS idx_payments_date
    ON payments (paid_at DESC, gym_id)
    INCLUDE (amount)
    WITH (fillfactor = 100);
-- ── members.email unique partial ──────────────────────────────────────────────
-- Not primarily a performance index — this is a data-integrity constraint.
-- Prevents duplicate emails while allowing multiple NULL values (members without email).
-- Also makes future email-based lookups (login, contact dedup) instant.
CREATE UNIQUE INDEX IF NOT EXISTS idx_members_email_unique
  ON members (email)
  WHERE email IS NOT NULL;

-- ── REMOVED: idx_gyms_updated_at ─────────────────────────────────────────────
-- No query in gyms.ts, statsService, or simulatorService filters/sorts by updated_at.
-- The gyms table is also tiny (<100 rows) — Postgres would prefer a seq-scan anyway.
-- Drop it to avoid write overhead on every gym UPDATE with zero read benefit.
