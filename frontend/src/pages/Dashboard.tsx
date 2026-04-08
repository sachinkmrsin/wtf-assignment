import { useEffect, useState } from 'react';
import { useGymData } from '@/hooks/useGymData';
import { useSocket } from '@/hooks/useSocket';
import { useAnomalies } from '@/hooks/useAnomalies';
import { useGymStore } from '@/store/gymStore';
import { GymCard } from '@/components/GymCard';
import { AnomalyRow } from '@/components/AnomalyRow';
import { ActivityFeed } from '@/components/ActivityFeed';
import { SummaryBar } from '@/components/SummaryBar';
import { KpiCard } from '@/components/KpiCard';
import { SimulatorControls } from '@/components/SimulatorControls';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

export function Dashboard() {
  const { gyms, selectedGymId, setSelectedGym, loading: gymsLoading } = useGymData();
  const { subscribeToGym, unsubscribeFromGym } = useSocket();
  const { anomalies, resolve } = useAnomalies();

  const activityFeed = useGymStore((s) => s.activityFeed);
  const todayRevenue = useGymStore((s) => s.todayRevenue);
  const weeklyCheckins = useGymStore((s) => s.weeklyCheckins);

  const [checkinTrend, setCheckinTrend]           = useState<{ day: string; count: number }[]>([]);
  const [checkinTrendLoading, setCheckinTrendLoading] = useState(false);

  // Subscribe to every gym room
  useEffect(() => {
    gyms.forEach((g) => subscribeToGym(g.id));
    return () => gyms.forEach((g) => unsubscribeFromGym(g.id));
  }, [gyms, subscribeToGym, unsubscribeFromGym]);

  // Fetch 7-day checkin trend for selected gym
  useEffect(() => {
    if (!selectedGymId) return;
    setCheckinTrendLoading(true);
    fetch(`${API}/api/analytics/checkins/${selectedGymId}?days=7`)
      .then((r) => r.json())
      .then((data: { day: string; count: string }[]) =>
        setCheckinTrend(
          data.map((d) => ({
            day: new Date(d.day).toLocaleDateString('en', { weekday: 'short' }),
            count: parseInt(d.count, 10),
          })),
        ),
      )
      .catch(console.error)
      .finally(() => setCheckinTrendLoading(false));
  }, [selectedGymId]);

  const recentAnomalies = anomalies.slice(0, 5);
  const selectedFeed    = selectedGymId ? (activityFeed[selectedGymId] ?? []) : [];
  const selectedRevenue = selectedGymId ? (todayRevenue[selectedGymId] ?? null) : null;
  const selectedWeekly  = selectedGymId ? (weeklyCheckins[selectedGymId] ?? null) : null;
  const selectedGym     = gyms.find((g) => g.id === selectedGymId) ?? null;

  return (
    <div className="p-6 space-y-6 min-w-0">
      {/* ── Page header ── */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Live Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Real-time operations across all gyms
          </p>
        </div>
        <div className="w-64 shrink-0">
          <SimulatorControls />
        </div>
      </div>

      {/* ── KPI summary bar ── */}
      <SummaryBar loading={gymsLoading} />

      {/* ── Gym grid ── */}
      {gymsLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-lg" />
          ))}
        </div>
      ) : gyms.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground text-sm">
          No gyms found. Seed the database or start the simulator.
        </div>
      ) : (
        <div
          data-testid="gym-grid"
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
        >
          {gyms.map((gym) => (
            <GymCard
              key={gym.id}
              gym={gym}
              selected={gym.id === selectedGymId}
              onClick={() => setSelectedGym(gym.id)}
            />
          ))}
        </div>
      )}

      {/* ── Detail panels for selected gym ── */}
      {selectedGym && (
        <>
          {/* Selected gym KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard
              label="Live Occupancy"
              value={selectedGym.live_occupancy}
              suffix={`/ ${selectedGym.capacity}`}
              color={
                selectedGym.live_occupancy / selectedGym.capacity >= 0.9 ? 'red' :
                selectedGym.live_occupancy / selectedGym.capacity >= 0.7 ? 'amber' : 'teal'
              }
            />
            <KpiCard
              label="Today Revenue"
              value={selectedRevenue ?? 0}
              format={(v) => `₹${v.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
              color="teal"
              loading={selectedRevenue === null}
            />
            <KpiCard
              label="Weekly Check-ins"
              value={selectedWeekly ?? 0}
              loading={selectedWeekly === null}
            />
            <KpiCard
              label="Capacity"
              value={selectedGym.capacity > 0 ? Math.round((selectedGym.live_occupancy / selectedGym.capacity) * 100) : 0}
              suffix="%"
              color={
                selectedGym.capacity > 0 && (selectedGym.live_occupancy / selectedGym.capacity) >= 0.9 ? 'red' :
                selectedGym.capacity > 0 && (selectedGym.live_occupancy / selectedGym.capacity) >= 0.7 ? 'amber' : 'teal'
              }
            />
          </div>

          {/* Activity feed + trend chart */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <span className="inline-block w-2 h-2 rounded-full bg-teal-400 animate-pulse" />
                  Live Activity — {selectedGym.name}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ActivityFeed items={selectedFeed} />
              </CardContent>
            </Card>

            {/* 7-day trend chart */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">7-Day Check-in Trend</CardTitle>
              </CardHeader>
              <CardContent>
                {checkinTrendLoading ? (
                  <div className="h-48 flex flex-col justify-end gap-1 px-2">
                    {[40, 70, 55, 85, 65, 90, 75].map((h, i) => (
                      <Skeleton key={i} className="rounded" style={{ height: `${h}%` }} />
                    ))}
                  </div>
                ) : checkinTrend.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-12">
                    No check-in data yet
                  </p>
                ) : (
                  <ResponsiveContainer width="100%" height={192}>
                    <AreaChart data={checkinTrend} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                      <defs>
                        <linearGradient id="tealGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#14B8A6" stopOpacity={0.35} />
                          <stop offset="95%" stopColor="#14B8A6" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                      <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#64748B' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: '#64748B' }} axisLine={false} tickLine={false} />
                      <Tooltip
                        contentStyle={{ background: '#1A1A2E', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, fontSize: 12 }}
                        labelStyle={{ color: '#E2E8F0' }}
                        itemStyle={{ color: '#14B8A6' }}
                      />
                      <Area type="monotone" dataKey="count" stroke="#14B8A6" strokeWidth={2} fill="url(#tealGrad)" dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {/* ── Recent anomalies ── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm">
            Recent Anomalies
            {recentAnomalies.length > 0 && (
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                ({recentAnomalies.length} active)
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {recentAnomalies.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2 text-center">
              No active anomalies 🎉
            </p>
          ) : (
            recentAnomalies.map((a) => (
              <AnomalyRow key={a.id} anomaly={a} onResolve={resolve} />
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

