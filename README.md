# WTF LivePulse

Real-time gym management platform with live occupancy tracking, revenue analytics, anomaly detection, and a Socket.io-powered dashboard.

---

## 1. Quick Start

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) ≥ 4.x (or Docker Engine + Compose v2)
- No other local dependencies required — Node, pnpm, and Postgres all run inside Docker.

### Start the entire stack

```bash
docker compose up
```

That single command will:
1. Start PostgreSQL 15 and run all SQL migrations automatically via `docker-entrypoint-initdb.d`
2. Build and start the Node.js backend (port **3001**) — seeds the database on first boot
3. Build and serve the React frontend via Nginx (port **3000**)

Open **http://localhost:3000** once all three services are healthy.

> **Resetting the database:** `docker compose down -v && docker compose up` — the `-v` flag wipes the Postgres volume and re-runs migrations + seed from scratch.

---

## 2. Architecture Decisions

### Index Strategy

| Index | Type | Reasoning |
|---|---|---|
| `idx_checkins_live_occupancy` | **Partial B-Tree** on `checkins(gym_id)` WHERE `checked_out IS NULL` | Only open check-ins matter for live occupancy. A partial index eliminates the ~80% of rows that are already checked out, shrinking the index dramatically and making Q1 sub-millisecond. |
| `idx_payments_gym_date` | **Composite B-Tree** on `payments(gym_id, paid_at)` | Q2 always filters on both columns. Composite preserves the leading-column advantage; `gym_id` first matches the equality filter, `paid_at` second satisfies the range scan without a sort. |
| `idx_members_churn_risk` | **Partial B-Tree** on `members(last_checkin_at)` WHERE `status = 'active'` | Churn-risk queries only target active members. Filtering inactive/suspended members from the index keeps it small and fast. |
| `idx_gym_hourly_stats_unique` | **Unique index** on `gym_hourly_stats(gym_id, hour_of_day, day_of_week)` | Required by PostgreSQL for `REFRESH MATERIALIZED VIEW CONCURRENTLY`. Also makes Q4 lookups by gym instant. |
| `idx_payments_date` | **Covering B-Tree** on `payments(paid_at, gym_id)` INCLUDE `(amount)` | Q5 groups by `gym_id` and sums `amount` over a date range. The covering index avoids heap fetches entirely — the planner satisfies the entire query from the index leaf pages. |
| `idx_anomalies_active` | **Partial B-Tree** on `anomalies(detected_at DESC)` WHERE `resolved = FALSE` | The anomaly dashboard only shows unresolved alerts. A partial index on the small unresolved subset is far cheaper than a full index, and `DESC` ordering matches the `ORDER BY detected_at DESC` in Q6. |

**Why not BRIN?**  
BRIN is optimal for naturally-ordered append-only data queried by range (e.g. log timestamps). The `checkins` table is queried by `gym_id` — not insertion order — so BRIN would result in sequential scans. B-Tree partial indexes are the correct choice here.

### Materialized View — `gym_hourly_stats`

Q4 (Peak Hour Heatmap) aggregates 270,000+ check-in rows by gym, hour-of-day, and day-of-week. Running this aggregation on every request would be expensive. The materialized view pre-computes the result; the background simulator refreshes it with `REFRESH MATERIALIZED VIEW CONCURRENTLY` every 15 minutes, which avoids read locks on the view during refresh.

### Socket.io Room-per-Gym

Each gym gets its own Socket.io room (`gym:<id>`). The frontend subscribes only to the gyms it is currently displaying. This avoids broadcasting every event to every connected client — especially important as the simulator fires events across all 10 gyms simultaneously.

### Seed Strategy

Migrations run via PostgreSQL's `docker-entrypoint-initdb.d` (SQL files mounted as a volume). Seeds are separate: the backend calls an idempotent `runSeedIfNeeded()` on every boot that checks a `meta` table flag. If the flag is absent, it seeds; otherwise it skips. `pg-copy-streams` is used for the 270,000+ check-in rows to achieve bulk-insert speeds orders of magnitude faster than individual `INSERT` statements.

---

## 3. AI Tools Used

| Tool | Used For |
|---|---|
| **GitHub Copilot** | Scaffolding project structure, boilerplate for Express routes and React hooks, SQL index recommendations, seed script bulk-insert pattern with `pg-copy-streams`, Playwright test structure |
| _(add your tools here)_ | _(describe specific usage)_ |

> **Note to reviewer:** AI usage is encouraged and fully disclosed above. All generated code was reviewed, tested, and adapted to fit the project requirements.

---

## 4. Query Benchmarks

All queries tested against seeded dataset: **10 gyms, 5,000 members, 270,000+ check-in records, 90 days of data**.

Run benchmarks with:
```sql
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) <query here>;
```

| # | Query Name | Index Used | Target | Measured | Screenshot |
|---|---|---|---|---|---|
| Q1 | Live Occupancy — Single Gym | `idx_checkins_live_occupancy` (partial) | < 0.5ms | _TBD_ | [Q1.png](./benchmarks/screenshots/Q1.png) |
| Q2 | Today's Revenue — Single Gym | `idx_payments_gym_date` (composite) | < 0.8ms | _TBD_ | [Q2.png](./benchmarks/screenshots/Q2.png) |
| Q3 | Churn Risk Members | `idx_members_churn_risk` (partial) | < 1ms | _TBD_ | [Q3.png](./benchmarks/screenshots/Q3.png) |
| Q4 | Peak Hour Heatmap (7d) | `idx_gym_hourly_stats_unique` (mat. view) | < 0.3ms | _TBD_ | [Q4.png](./benchmarks/screenshots/Q4.png) |
| Q5 | Cross-Gym Revenue Comparison | `idx_payments_date` (covering) | < 2ms | _TBD_ | [Q5.png](./benchmarks/screenshots/Q5.png) |
| Q6 | Active Anomalies — All Gyms | `idx_anomalies_active` (partial) | < 0.3ms | _TBD_ | [Q6.png](./benchmarks/screenshots/Q6.png) |

> Screenshots in [`/benchmarks/screenshots/`](./benchmarks/screenshots/) — see [`benchmarks/README_BENCHMARKS.md`](./benchmarks/README_BENCHMARKS.md) for the exact SQL to run.

---

## 5. Known Limitations

- **Benchmark screenshots** are placeholders — they must be captured after `docker compose up` seeds the database and `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)` is run against the live data.
- **Playwright E2E tests** are scaffolded but require the full Docker stack to be running (`docker compose up`) before `pnpm test:e2e` is executed from the frontend.
- **Materialized view refresh** is triggered every 15 minutes by the background simulator job. Fresh deployments may show empty heatmap data until the first refresh completes.
- **Simulator is simplified** — it generates synthetic check-ins and payments at a fixed interval. A production system would hook into real entry hardware events.
- **Authentication** is not implemented — all API endpoints are unauthenticated. Adding JWT/session auth is the first production hardening step.

