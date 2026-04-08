import { useState, useEffect } from 'react';
import { useGymData } from '@/hooks/useGymData';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig,
} from '@/components/ui/chart';
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer,
  LineChart, Line, CartesianGrid, Tooltip,
} from 'recharts';
import type { RevenueComparison, HeatmapRow } from '@/types/models';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const revenueChartConfig: ChartConfig = {
  total_revenue: { label: 'Revenue (₹)', color: '#14B8A6' },
};
const checkinChartConfig: ChartConfig = {
  count: { label: 'Check-ins', color: '#3B82F6' },
};

// Teal heat: 0 → near-bg, 1 → vivid teal
function heatColor(intensity: number): string {
  const l = Math.round(14 + intensity * 58);
  const c = (0.045 + intensity * 0.14).toFixed(3);
  return `oklch(${l / 100} ${c} 185)`;
}

export function Analytics() {
  const { gyms, selectedGymId, setSelectedGym, loading: gymsLoading } = useGymData();
  const [revenueComparison, setRevenueComparison] = useState<RevenueComparison[]>([]);
  const [heatmap, setHeatmap]                     = useState<HeatmapRow[]>([]);
  const [checkinTrend, setCheckinTrend]           = useState<{ day: string; count: number }[]>([]);
  const [revenueLoading, setRevenueLoading]       = useState(true);
  const [heatmapLoading, setHeatmapLoading]       = useState(false);
  const [revenueError, setRevenueError]           = useState<string | null>(null);

  useEffect(() => {
    setRevenueLoading(true);
    setRevenueError(null);
    fetch(`${API}/api/analytics/revenue/comparison`)
      .then((r) => { if (!r.ok) throw new Error(`API ${r.status}`); return r.json(); })
      .then(setRevenueComparison)
      .catch((e) => setRevenueError(e.message))
      .finally(() => setRevenueLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedGymId) return;
    setHeatmapLoading(true);
    Promise.all([
      fetch(`${API}/api/analytics/heatmap/${selectedGymId}`).then((r) => r.json()),
      fetch(`${API}/api/analytics/checkins/${selectedGymId}?days=14`).then((r) => r.json()),
    ])
      .then(([heatData, trendData]: [HeatmapRow[], { day: string; count: string }[]]) => {
        setHeatmap(heatData);
        setCheckinTrend(trendData.map((d) => ({
          day: new Date(d.day).toLocaleDateString('en', { month: 'short', day: 'numeric' }),
          count: parseInt(d.count, 10),
        })));
      })
      .catch(console.error)
      .finally(() => setHeatmapLoading(false));
  }, [selectedGymId]);

  const heatmapMap = new Map(
    heatmap.map((r) => [`${r.day_of_week}-${r.hour_of_day}`, r.total_checkins]),
  );
  const maxCount = Math.max(...heatmap.map((r) => r.total_checkins), 1);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Revenue, check-in trends, and peak hours</p>
      </div>

      {/* Gym selector pill strip */}
      <div className="flex gap-2 flex-wrap" data-testid="gym-selector">
        {gymsLoading
          ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-7 w-24 rounded-full" />)
          : gyms.map((g) => (
            <button
              key={g.id}
              onClick={() => setSelectedGym(g.id)}
              className={`px-3 py-1 rounded-full text-sm border transition-colors ${
                g.id === selectedGymId
                  ? 'bg-teal-500/20 border-teal-500/50 text-teal-400'
                  : 'border-border text-muted-foreground hover:border-teal-500/30 hover:text-foreground'
              }`}
            >
              {g.name}
            </button>
          ))}
      </div>

      {/* Revenue comparison chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">30-Day Revenue Comparison — All Gyms</CardTitle>
        </CardHeader>
        <CardContent>
          {revenueLoading ? (
            <Skeleton className="h-64 w-full rounded" />
          ) : revenueError ? (
            <p className="text-sm text-destructive py-8 text-center">{revenueError}</p>
          ) : (
            <ChartContainer config={revenueChartConfig} className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={revenueComparison}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="gym_name" tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} />
                  <ChartTooltip
                    content={<ChartTooltipContent />}
                    contentStyle={{ background: '#1A1A2E', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6 }}
                  />
                  <Bar dataKey="total_revenue" fill="#14B8A6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      {/* 14-day check-in trend */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">14-Day Check-in Trend</CardTitle>
        </CardHeader>
        <CardContent>
          {heatmapLoading ? (
            <Skeleton className="h-56 w-full rounded" />
          ) : checkinTrend.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-12">
              Select a gym to view trends
            </p>
          ) : (
            <ChartContainer config={checkinChartConfig} className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={checkinTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ background: '#1A1A2E', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, fontSize: 12 }}
                    labelStyle={{ color: '#E2E8F0' }}
                    itemStyle={{ color: '#3B82F6' }}
                  />
                  <Line type="monotone" dataKey="count" stroke="#3B82F6" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      {/* Peak-hour heatmap */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Peak Hour Heatmap</CardTitle>
        </CardHeader>
        <CardContent>
          {heatmapLoading ? (
            <Skeleton className="h-48 w-full rounded" />
          ) : heatmap.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-12">
              Select a gym to view the heatmap
            </p>
          ) : (
            <div className="overflow-x-auto">
              <div className="flex gap-0.5">
                {/* Hour labels */}
                <div className="flex flex-col gap-0.5 mr-1">
                  <div className="h-5 w-8" />
                  {Array.from({ length: 24 }, (_, h) => (
                    <div key={h} className="h-5 w-8 text-[10px] text-muted-foreground flex items-center">
                      {h}:00
                    </div>
                  ))}
                </div>
                {DAY_NAMES.map((day, dow) => (
                  <div key={dow} className="flex flex-col gap-0.5">
                    <div className="h-5 text-[10px] text-muted-foreground text-center w-8">{day}</div>
                    {Array.from({ length: 24 }, (_, h) => {
                      const count     = heatmapMap.get(`${dow}-${h}`) ?? 0;
                      const intensity = maxCount > 0 ? count / maxCount : 0;
                      return (
                        <div
                          key={h}
                          title={`${day} ${h}:00 — ${count} check-ins`}
                          className="w-8 h-5 rounded-sm transition-colors"
                          style={{ backgroundColor: heatColor(intensity) }}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

