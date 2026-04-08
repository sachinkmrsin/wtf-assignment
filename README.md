# WTF LivePulse

Real-time gym management platform with live occupancy tracking, revenue analytics, anomaly detection, and a Socket.io-powered dashboard.

---

## Table of Contents

1. [Quick Start](#1-quick-start)
2. [Project Structure](#2-project-structure)
3. [Backend](#3-backend)
4. [Frontend](#4-frontend)
5. [Testing](#5-testing)
6. [Architecture Decisions](#6-architecture-decisions)
7. [AI Tools Used](#7-ai-tools-used)
8. [Query Benchmarks](#8-query-benchmarks)
9. [Known Limitations](#9-known-limitations)

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
2. Build and start the Node.js/Express backend (port **3001**) — seeds the database on first boot
3. Build and serve the React frontend via Nginx (port **3000**)

Open **http://localhost:3000** once all three services are healthy.

> **Resetting the database:** `docker compose down -v && docker compose up` — the `-v` flag wipes the Postgres volume and re-runs migrations + seed from scratch.

### Running tests locally (without Docker)

```bash
# Backend unit tests
cd backend && pnpm test:unit

# Backend integration tests (uses pg-mem in-process — no real DB required)
cd backend && pnpm test:integration

# Frontend unit tests
cd frontend && pnpm test

# Frontend E2E tests (requires the full Docker stack to be running first)
cd frontend && pnpm test:e2e
```

---

## 2. Project Structure

```
WTF_assignment/
├── docker-compose.yml          # Orchestrates db, backend, frontend
├── pnpm-workspace.yaml         # pnpm monorepo config
├── backend/
│   ├── src/
│   │   ├── app.ts              # Express entry-point, bootstrap, Socket.io init
│   │   ├── controllers/        # HTTP request handlers (gym, analytics, anomaly, simulator)
│   │   ├── db/
│   │   │   ├── pool.ts         # pg connection pool
│   │   │   ├── migrations/     # 001_initial.sql (schema + indexes + mat. view)
│   │   │   │                     002_indexes.sql (additional covering indexes)
│   │   │   └── seeds/          # Idempotent seed: 10 gyms, 5,000 members, 270k+ check-ins
│   │   ├── jobs/
│   │   │   ├── simulator.ts    # Periodic check-in/checkout/payment events
│   │   │   └── anomalyDetector.ts  # Runs anomaly checks on all gyms every 30s
│   │   ├── repositories/       # DB query layer (gym, analytics, anomaly)
│   │   ├── routes/             # Express routers (gyms, members, analytics, anomalies, simulator)
│   │   ├── services/           # Business logic (stats, simulator, anomaly, analytics)
│   │   ├── types/              # Shared TypeScript types and Socket.io event payloads
│   │   └── websocket/          # Socket.io server, room management, broadcast helpers
│   └── tests/
│       ├── unit/               # Jest unit tests (anomalyService, simulatorService, statsService)
│       └── integration/        # Supertest integration tests (gyms, members, analytics, anomalies, simulator)
└── frontend/
    ├── src/
    │   ├── App.tsx             # Router, global socket init, error boundary
    │   ├── pages/              # Dashboard, Analytics, Anomalies
    │   ├── components/         # GymCard, KpiCard, SummaryBar, ActivityFeed, SimulatorControls, …
    │   ├── hooks/              # useSocket, useGymData, useAnomalies, useCountUp
    │   ├── store/              # Zustand stores (gymStore, anomalyStore, toastStore)
    │   └── types/              # Frontend TypeScript types
    └── tests/
        ├── unit/               # Vitest + Testing Library component & hook tests
        └── e2e/                # Playwright E2E tests (dashboard, analytics, anomalies)
```

---

## 3. Backend

### Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 20 + TypeScript |
| Framework | Express 4 |
| Database | PostgreSQL 15 |
| Real-time | Socket.io 4 |
| DB client | `pg` + `pg-copy-streams` (bulk inserts) |
| Testing | Jest 29 + `ts-jest` + `pg-mem` + Supertest |

### REST API

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Health check |
| `GET` | `/api/gyms` | List all gyms with live stats |
| `GET` | `/api/gyms/:id` | Single gym stats |
| `GET` | `/api/gyms/:id/heatmap` | Peak-hour heatmap (from materialized view) |
| `GET` | `/api/members` | List members (supports `?gymId=` and `?churnRisk=true`) |
| `GET` | `/api/analytics/revenue` | Cross-gym revenue comparison (last 30 days) |
| `GET` | `/api/analytics/stats` | Aggregate KPIs across all gyms |
| `GET` | `/api/anomalies` | List anomalies (supports `?resolved=false`) |
| `PATCH` | `/api/anomalies/:id/resolve` | Manually resolve an anomaly |
| `POST` | `/api/simulator/checkin` | Manually trigger a simulated check-in |
| `POST` | `/api/simulator/checkout` | Manually trigger a simulated checkout |
| `POST` | `/api/simulator/payment` | Manually trigger a simulated payment |

### Socket.io Events

All events are scoped to **room `gym:<id>`** so clients only receive events for gyms they are watching.

| Event | Direction | Payload |
|---|---|---|
| `gym:checkin` | Server → Client | `gymId, memberId, memberName, checkinId, checkedInAt, currentOccupancy, capacityPct` |
| `gym:checkout` | Server → Client | `gymId, memberId, memberName, checkinId, checkedOutAt, currentOccupancy, capacityPct` |
| `gym:occupancy` | Server → Client | `gymId, count, capacity, timestamp` |
| `payment:new` | Server → Client | `gymId, memberId, memberName, planType, amount, todayTotal, paidAt` |
| `stats:update` | Server → Client | `gymId, dailyRevenue, weeklyCheckins, timestamp` |
| `anomaly:detected` | Server → Client | `id, gymId, gymName, type, severity, message, detectedAt` |
| `anomaly:resolved` | Server → Client (broadcast) | `id, gymId, resolvedAt` |

### Background Jobs

#### Simulator (`jobs/simulator.ts`)
Fires every **5 seconds**, randomly selecting 1–3 gyms per tick and executing one of:
- **Check-in** (45% probability): inserts a `checkins` row for a random active member, updates `last_checkin_at`, broadcasts `gym:checkin` + `gym:occupancy`
- **Checkout** (30% probability): closes the oldest open check-in, broadcasts `gym:checkout` + `gym:occupancy`
- **Payment** (25% probability): inserts a `payments` row, broadcasts `payment:new` + `stats:update`

Every **15 minutes** the simulator also runs `REFRESH MATERIALIZED VIEW CONCURRENTLY gym_hourly_stats`.

#### Anomaly Detector (`jobs/anomalyDetector.ts`)
Polls every **30 seconds** across all gyms and checks three scenarios:

| Scenario | Trigger | Severity | Auto-resolves? |
|---|---|---|---|
| `zero_checkins` | 0 open sessions AND last check-in > 2 hours ago | `warning` | ✅ When activity resumes |
| `capacity_breach` | Live occupancy > 90% of capacity | `critical` | ✅ When occupancy drops below 85% |
| `revenue_drop` | Today's revenue < 30% of same weekday last week | `warning` | ❌ Manual resolve required |

Each detected anomaly is persisted to the `anomalies` table and immediately broadcast via Socket.io.

### Database Schema

| Table | Purpose |
|---|---|
| `gyms` | 10 gyms with name, city, capacity, operating hours |
| `members` | 5,000 members with plan type, status, last check-in |
| `checkins` | 270,000+ records; `duration_min` is a generated stored column |
| `payments` | Payment records linked to member + gym |
| `anomalies` | Detected anomaly events with resolve tracking |
| `meta` | Key/value store used for idempotent seed flag |
| `gym_hourly_stats` | **Materialized view** — pre-aggregated peak-hour data (7-day window) |

---

## 4. Frontend

### Tech Stack

| Layer | Technology |
|---|---|
| Framework | React 19 + TypeScript + Vite |
| Styling | Tailwind CSS v4 + shadcn/ui (`@base-ui/react`) |
| Routing | React Router v7 |
| State | Zustand v5 |
| Real-time | Socket.io-client v4 |
| Charts | Recharts |
| Font | Geist Variable |
| Testing | Vitest + Testing Library + Playwright |

### Pages

| Page | Route | Description |
|---|---|---|
| Dashboard | `/` | Live grid of all 10 gyms — occupancy, today's revenue, weekly check-ins, active members. Real-time updates via Socket.io. Activity feed with latest events. Summary bar with fleet-wide KPIs. |
| Analytics | `/analytics` | Cross-gym revenue comparison bar chart (last 30 days). Peak-hour heatmap per gym. Churn-risk member table. |
| Anomalies | `/anomalies` | Live anomaly feed with severity badges. One-click resolve. Toast notifications for new anomalies. |

### Components

| Component | Description |
|---|---|
| `GymCard` | Displays live occupancy bar, revenue, check-in counts, member count for one gym |
| `KpiCard` | Generic KPI tile with animated count-up |
| `SummaryBar` | Fleet-wide total occupancy, revenue, and check-ins banner |
| `ActivityFeed` | Scrolling live feed of check-in / checkout / payment events |
| `SimulatorControls` | Buttons to manually trigger check-in, checkout, or payment events |
| `AnomalyRow` | Single anomaly with type icon, severity badge, resolve button |
| `ConnectionIndicator` | Socket.io connection status dot (green/red) |
| `Navbar` | Navigation with route links |
| `ErrorBoundary` | React error boundary wrapping all routes |

### State Management (Zustand)

| Store | Manages |
|---|---|
| `gymStore` | Gym list, live stats, activity feed entries, socket event handlers |
| `anomalyStore` | Active/resolved anomaly list, socket event handlers |
| `toastStore` | Toast queue for anomaly notifications |

### Custom Hooks

| Hook | Purpose |
|---|---|
| `useSocket` | Initialises the Socket.io connection once at app root; joins/leaves gym rooms |
| `useGymData` | Fetches initial gym stats via REST, subscribes to real-time updates |
| `useAnomalies` | Fetches active anomalies, subscribes to `anomaly:detected` / `anomaly:resolved` |
| `useCountUp` | Smooth animated number transitions for KPI cards |

---

## 5. Testing

### Backend — Unit Tests (`pnpm test:unit`)

Tests run entirely in-process using `pg-mem` (no Docker or real DB required).

| File | Covers |
|---|---|
| `anomalyService.test.ts` | Zero-checkins, capacity-breach, revenue-drop detection logic; auto-resolve behaviour; duplicate-suppression (no duplicate unresolved anomaly) |
| `simulatorService.test.ts` | `simulateCheckin`, `simulateCheckout`, `simulatePayment` — verifies DB writes and Socket.io broadcasts |
| `statsService.test.ts` | `getGymStats`, `getAllGymIds`, `getGymCapacity`, `refreshHeatmap` |

### Backend — Integration Tests (`pnpm test:integration`)

HTTP-level tests using Supertest against an in-memory `pg-mem` database seeded per test suite.

| File | Covers |
|---|---|
| `gyms.test.ts` | `GET /api/gyms`, `GET /api/gyms/:id`, `GET /api/gyms/:id/heatmap` |
| `members.test.ts` | `GET /api/members?gymId=`, `GET /api/members?churnRisk=true` |
| `analytics.test.ts` | `GET /api/analytics/revenue`, `GET /api/analytics/stats` |
| `anomalies.test.ts` | `GET /api/anomalies`, `PATCH /api/anomalies/:id/resolve` |
| `simulator.test.ts` | `POST /api/simulator/checkin`, `/checkout`, `/payment` |

### Frontend — Unit Tests (`pnpm test`)

Vitest + `@testing-library/react` with jsdom.

| File | Covers |
|---|---|
| `GymCard.test.tsx` | Renders occupancy bar, revenue, capacity percentage |
| `KpiCard.test.tsx` | Renders title and value; handles loading state |
| `SummaryBar.test.tsx` | Aggregated KPI totals rendered correctly |
| `SimulatorControls.test.tsx` | Button click handlers call correct API endpoints |
| `ConnectionIndicator.test.tsx` | Shows green when connected, red when disconnected |
| `useGymData.test.ts` | REST fetch on mount; applies socket update to store |
| `useAnomalies.test.ts` | Fetches anomalies; resolves via store on socket event |
| `useCountUp.test.ts` | Animated value converges to target over time |

### Frontend — E2E Tests (`pnpm test:e2e`)

Playwright tests — require the full Docker stack to be running.

| File | Covers |
|---|---|
| `dashboard.spec.ts` | Page load, gym cards visible, live activity feed updates, simulator controls |
| `analytics.spec.ts` | Revenue chart renders, heatmap loads, churn table populated |
| `anomalies.spec.ts` | Anomaly list loads, resolve button marks item resolved, toast appears |

---

## 6. Architecture Decisions

### Index Strategy

| Index | Type | Reasoning |
|---|---|---|
| `idx_checkins_live_occupancy` | **Partial B-Tree** on `checkins(gym_id, checked_out)` WHERE `checked_out IS NULL` | Only open check-ins matter for live occupancy. A partial index eliminates the ~80% of rows that are already checked out, shrinking the index dramatically and making Q1 sub-millisecond. |
| `idx_checkins_time_brin` | **BRIN** on `checkins(checked_in)` | BRIN is ideal for the large, naturally append-ordered `checked_in` column when range queries span the full table. Covers historical analytics queries at a fraction of a B-Tree's storage cost. |
| `idx_payments_gym_date` | **Composite B-Tree** on `payments(gym_id, paid_at DESC)` | Q2 always filters on both columns. Composite preserves the leading-column advantage; `gym_id` first matches the equality filter, `paid_at` second satisfies the range scan without a sort. |
| `idx_payments_date` | **Covering B-Tree** on `payments(paid_at DESC)` INCLUDE `(gym_id, amount)` | Q5 groups by `gym_id` and sums `amount` over a date range. The covering index avoids heap fetches entirely — the planner satisfies the entire query from the index leaf pages. |
| `idx_members_churn_risk` | **Partial B-Tree** on `members(last_checkin_at)` WHERE `status = 'active'` | Churn-risk queries only target active members. Filtering inactive/frozen members from the index keeps it small and fast. |
| `idx_anomalies_active` | **Partial B-Tree** on `anomalies(gym_id, detected_at DESC)` WHERE `resolved = FALSE` | The anomaly dashboard only shows unresolved alerts. A partial index on the small unresolved subset is far cheaper than a full index, and `DESC` ordering matches the `ORDER BY detected_at DESC` in Q6. |
| `idx_gym_hourly_stats_unique` | **Unique index** on `gym_hourly_stats(gym_id, day_of_week, hour_of_day)` | Required by PostgreSQL for `REFRESH MATERIALIZED VIEW CONCURRENTLY`. Also makes Q4 lookups by gym instant. |

**Why BRIN for `idx_checkins_time_brin`?**  
BRIN is optimal for naturally-ordered append-only data queried by range. The `checked_in` column is a natural insertion-time timestamp — rows are always appended in order — so BRIN's block-range summaries accurately narrow the scan. For `gym_id`-based occupancy queries, B-Tree partial indexes are still the right choice because gym filtering isn't correlated with insertion order.

### Materialized View — `gym_hourly_stats`

Q4 (Peak Hour Heatmap) aggregates 270,000+ check-in rows by gym, hour-of-day, and day-of-week over a rolling 7-day window. Running this aggregation on every request would be expensive. The materialized view pre-computes the result; the background simulator refreshes it with `REFRESH MATERIALIZED VIEW CONCURRENTLY` every 15 minutes, which avoids read locks on the view during refresh.

### Socket.io Room-per-Gym

Each gym gets its own Socket.io room (`gym:<id>`). The frontend subscribes only to the gyms it is currently displaying. This avoids broadcasting every event to every connected client — especially important as the simulator fires events across all 10 gyms simultaneously.

### Seed Strategy

Migrations run via PostgreSQL's `docker-entrypoint-initdb.d` (SQL files mounted as a volume). Seeds are separate: the backend calls an idempotent `runSeedIfNeeded()` on every boot that checks a `meta` table flag. If the flag is absent, it seeds; otherwise it skips. `pg-copy-streams` is used for the 270,000+ check-in rows to achieve bulk-insert speeds orders of magnitude faster than individual `INSERT` statements.

### Anomaly Auto-resolution

Two of the three anomaly types auto-resolve via the detector job:
- **`zero_checkins`** resolves when any new activity is detected (occupancy > 0)
- **`capacity_breach`** resolves when occupancy drops below 85% (hysteresis band prevents flapping)

Resolution broadcasts `anomaly:resolved` to all connected clients so the UI updates in real time without polling.

---

## 7. AI Tools Used

| Tool | Used For |
|---|---|
| **GitHub Copilot** | Scaffolding project structure, boilerplate for Express routes and React hooks, SQL index recommendations, seed script bulk-insert pattern with `pg-copy-streams`, Playwright test structure, Zustand store patterns, Tailwind component layouts |

> **Note to reviewer:** AI usage is encouraged and fully disclosed above. All generated code was reviewed, tested, and adapted to fit the project requirements.

---

## 8. Query Benchmarks

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

## 9. Known Limitations

- **Benchmark screenshots** are placeholders — they must be captured after `docker compose up` seeds the database and `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)` is run against the live data.
- **Playwright E2E tests** require the full Docker stack to be running (`docker compose up`) before `pnpm test:e2e` is executed from the `frontend/` directory.
- **Materialized view refresh** is triggered every 15 minutes by the background simulator job. Fresh deployments may show empty heatmap data until the first refresh completes.
- **Simulator is synthetic** — it generates fake check-ins and payments at a fixed interval. A production system would hook into real entry hardware or a POS system.
- **Authentication is not implemented** — all API endpoints are unauthenticated. Adding JWT/session auth is the first production hardening step.
- **No pagination** — member and anomaly list endpoints return all rows. For large datasets, cursor-based pagination should be added.
