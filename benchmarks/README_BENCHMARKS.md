# Benchmark Screenshots

Place `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)` output screenshots here after running against the seeded database.

## Required Files

| File | Query |
|---|---|
| `Q1.png` | Live Occupancy — Single Gym |
| `Q2.png` | Today's Revenue — Single Gym |
| `Q3.png` | Churn Risk Members |
| `Q4.png` | Peak Hour Heatmap (materialized view) |
| `Q5.png` | Cross-Gym Revenue Comparison |
| `Q6.png` | Active Anomalies — All Gyms |

## How to Run

1. Start the stack: `docker compose up`
2. Wait for seed to complete (watch backend logs: `docker compose logs -f backend`)
3. Connect to the database:
   ```bash
   docker compose exec db psql -U wtf -d wtf_livepulse
   ```
4. Run each query below and screenshot the full output.

---

### Q1 — Live Occupancy (idx_checkins_live_occupancy)
```sql
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT COUNT(*) FROM checkins WHERE gym_id = '<any-gym-id>' AND checked_out IS NULL;
```

### Q2 — Today's Revenue (idx_payments_gym_date)
```sql
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT SUM(amount) FROM payments WHERE gym_id = '<any-gym-id>' AND paid_at >= CURRENT_DATE;
```

### Q3 — Churn Risk Members (idx_members_churn_risk)
```sql
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT id, name, last_checkin_at FROM members
WHERE status = 'active' AND last_checkin_at < NOW() - INTERVAL '45 days';
```

### Q4 — Peak Hour Heatmap (idx_gym_hourly_stats_unique)
```sql
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT * FROM gym_hourly_stats WHERE gym_id = '<any-gym-id>';
```

### Q5 — Cross-Gym Revenue Comparison (idx_payments_date)
```sql
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT gym_id, SUM(amount) FROM payments
WHERE paid_at >= NOW() - INTERVAL '30 days'
GROUP BY gym_id ORDER BY SUM(amount) DESC;
```

### Q6 — Active Anomalies (idx_anomalies_active)
```sql
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT * FROM anomalies WHERE resolved = FALSE ORDER BY detected_at DESC;
```

---

> **Tip:** Run `SELECT id FROM gyms LIMIT 1;` to get a real gym ID to substitute into Q1/Q2/Q4.

