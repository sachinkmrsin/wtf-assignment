import { useEffect } from 'react';
import { useAnomalies } from '@/hooks/useAnomalies';
import { AnomalyRow } from '@/components/AnomalyRow';
import { useAnomalyStore } from '@/store/anomalyStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#EF4444',
  high:     '#F97316',
  medium:   '#EAB308',
  low:      '#22C55E',
};

export function Anomalies() {
  const { anomalies, resolve, refetch, loading, error } = useAnomalies();
  const clearUnread = useAnomalyStore((s) => s.clearUnread);

  useEffect(() => {
    clearUnread();
    refetch();
  }, [clearUnread, refetch]);

  const bySeverity = {
    critical: anomalies.filter((a) => a.severity === 'critical').length,
    high:     anomalies.filter((a) => a.severity === 'high').length,
    medium:   anomalies.filter((a) => a.severity === 'medium').length,
    low:      anomalies.filter((a) => a.severity === 'low').length,
  };

  const pieData = (Object.entries(bySeverity) as [string, number][])
    .filter(([, v]) => v > 0)
    .map(([name, value]) => ({ name, value, color: SEVERITY_COLORS[name] }));

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Anomalies</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Active alerts across all gyms</p>
      </div>

      {/* Summary cards + pie chart */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Severity count pills */}
        <div className="lg:col-span-2 flex gap-3 flex-wrap items-start content-start">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-36 rounded-lg" />
            ))
          ) : (
            [
              { key: 'critical', label: 'Critical', color: 'border-red-500/40 bg-red-950/20 text-red-400' },
              { key: 'high',     label: 'High',     color: 'border-orange-500/40 bg-orange-950/20 text-orange-400' },
              { key: 'medium',   label: 'Medium',   color: 'border-amber-500/40 bg-amber-950/20 text-amber-400' },
              { key: 'low',      label: 'Low',      color: 'border-green-500/40 bg-green-950/20 text-green-400' },
            ].map(({ key, label, color }) => (
              <div
                key={key}
                className={`px-4 py-3 rounded-lg border ${color} min-w-[120px]`}
              >
                <p className="text-xs uppercase tracking-widest opacity-70">{label}</p>
                <p className="text-3xl font-bold tabular-nums mt-0.5">
                  {bySeverity[key as keyof typeof bySeverity]}
                </p>
              </div>
            ))
          )}
        </div>

        {/* Pie chart breakdown */}
        <Card>
          <CardHeader className="pb-0">
            <CardTitle className="text-xs text-muted-foreground uppercase tracking-widest">By Severity</CardTitle>
          </CardHeader>
          <CardContent className="pt-2">
            {loading ? (
              <Skeleton className="h-40 w-full rounded" />
            ) : pieData.length === 0 ? (
              <div className="h-40 flex items-center justify-center text-xs text-muted-foreground">
                No active anomalies
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%" cy="50%"
                    innerRadius={42} outerRadius={64}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {pieData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} stroke="transparent" />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: '#1A1A2E', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, fontSize: 12 }}
                    labelStyle={{ color: '#E2E8F0' }}
                  />
                  <Legend
                    iconSize={8}
                    iconType="circle"
                    wrapperStyle={{ fontSize: 11, color: '#64748B' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Anomaly list */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">
            Active Anomalies
            <span className="ml-2 text-muted-foreground font-normal text-xs">
              ({anomalies.length} unresolved)
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded" />
              ))}
            </div>
          ) : error ? (
            <p className="text-sm text-destructive py-4 text-center">{error}</p>
          ) : anomalies.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No active anomalies 🎉
            </p>
          ) : (
            <div data-testid="anomaly-list">
              {anomalies.map((a) => (
                <AnomalyRow key={a.id} anomaly={a} onResolve={resolve} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

