-- ============================================================
-- 001_initial.sql
-- Initial schema: tables + materialized view
-- Runs automatically via docker-entrypoint-initdb.d on first launch
-- ============================================================

-- Meta table — used for idempotent seed checks
CREATE TABLE IF NOT EXISTS meta (
  key         VARCHAR(255) PRIMARY KEY,
  value       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Gyms ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gyms (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  city        TEXT        NOT NULL,
  address     TEXT,
  capacity    INTEGER     NOT NULL CHECK (capacity > 0),
  status      TEXT        NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'inactive', 'maintenance')),
  opens_at    TIME        NOT NULL DEFAULT '06:00',
  closes_at   TIME        NOT NULL DEFAULT '22:00',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Members ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS members (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id          UUID        NOT NULL REFERENCES gyms(id) ON DELETE RESTRICT,
  name            TEXT        NOT NULL,
  email           TEXT,
  phone           TEXT,
  plan_type       TEXT        NOT NULL CHECK (plan_type IN ('monthly', 'quarterly', 'annual')),
  member_type     TEXT        NOT NULL DEFAULT 'new' CHECK (member_type IN ('new', 'renewal')),
  status          TEXT        NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'inactive', 'frozen')),
  joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  plan_expires_at TIMESTAMPTZ NOT NULL,
  last_checkin_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- REQUIRED: Partial index for churn risk detection (active members only)
CREATE INDEX IF NOT EXISTS idx_members_churn_risk
  ON members (last_checkin_at)
  WHERE status = 'active';

-- Supporting index for gym-level member queries
CREATE INDEX IF NOT EXISTS idx_members_gym_id ON members (gym_id);

-- ── Check-ins ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS checkins (
  id           BIGSERIAL   PRIMARY KEY,
  member_id    UUID        NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  gym_id       UUID        NOT NULL REFERENCES gyms(id)    ON DELETE CASCADE,
  checked_in   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  checked_out  TIMESTAMPTZ,
  duration_min INTEGER     GENERATED ALWAYS AS (
    CASE WHEN checked_out IS NOT NULL
         THEN EXTRACT(EPOCH FROM (checked_out - checked_in)) / 60
         ELSE NULL
    END
  ) STORED
);

-- REQUIRED: BRIN index for time-series range queries (optimal for append-only large tables)
CREATE INDEX IF NOT EXISTS idx_checkins_time_brin
  ON checkins USING BRIN (checked_in);

-- REQUIRED: Composite index for live occupancy query (most frequent query in the system)
CREATE INDEX IF NOT EXISTS idx_checkins_live_occupancy
  ON checkins (gym_id, checked_out)
  WHERE checked_out IS NULL;

-- Index for member-level checkin history
CREATE INDEX IF NOT EXISTS idx_checkins_member
  ON checkins (member_id, checked_in DESC);

-- ── Payments ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payments (
  id           UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id    UUID           NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  gym_id       UUID           NOT NULL REFERENCES gyms(id)    ON DELETE CASCADE,
  amount       NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
  plan_type    TEXT           NOT NULL,
  payment_type TEXT           NOT NULL DEFAULT 'new'
                 CHECK (payment_type IN ('new', 'renewal')),
  paid_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  notes        TEXT
);

-- REQUIRED: Composite index for today's revenue query (most frequent analytics query)
CREATE INDEX IF NOT EXISTS idx_payments_gym_date
  ON payments (gym_id, paid_at DESC);



-- ── Anomalies ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS anomalies (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id      UUID        NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  type        TEXT        NOT NULL
                CHECK (type IN ('zero_checkins', 'capacity_breach', 'revenue_drop')),
  severity    TEXT        NOT NULL
                CHECK (severity IN ('warning', 'critical')),
  message     TEXT        NOT NULL,
  resolved    BOOLEAN     NOT NULL DEFAULT FALSE,
  dismissed   BOOLEAN     NOT NULL DEFAULT FALSE,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

-- REQUIRED: Partial index for active anomalies (small index, extremely fast)
CREATE INDEX IF NOT EXISTS idx_anomalies_active
  ON anomalies (gym_id, detected_at DESC)
  WHERE resolved = FALSE;

-- ── Materialized View: gym_hourly_stats ──────────────────────────────────────
-- Pre-computes per-gym, per-hour-of-day, per-day-of-week check-in counts.
-- Required for peak-hours heatmap; avoids expensive GROUP BY on checkins at query time.
-- Refreshed CONCURRENTLY every 15 minutes by the background simulator job.
CREATE MATERIALIZED VIEW IF NOT EXISTS gym_hourly_stats AS
SELECT
  gym_id,
  EXTRACT(DOW  FROM checked_in)::INTEGER AS day_of_week,   -- 0=Sunday, 6=Saturday
  EXTRACT(HOUR FROM checked_in)::INTEGER AS hour_of_day,
  COUNT(*)                               AS checkin_count
FROM checkins
WHERE checked_in >= NOW() - INTERVAL '7 days'
GROUP BY gym_id, day_of_week, hour_of_day
WITH DATA;

-- REQUIRED: Unique index enables REFRESH MATERIALIZED VIEW CONCURRENTLY
CREATE UNIQUE INDEX IF NOT EXISTS idx_gym_hourly_stats_unique
  ON gym_hourly_stats (gym_id, day_of_week, hour_of_day);
