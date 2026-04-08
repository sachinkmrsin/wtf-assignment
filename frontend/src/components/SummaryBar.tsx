import { useGymStore } from '@/store/gymStore';
import { KpiCard } from '@/components/KpiCard';

interface SummaryBarProps {
  loading?: boolean;
}

export function SummaryBar({ loading = false }: SummaryBarProps) {
  const gyms         = useGymStore((s) => s.gyms);
  const todayRevenue = useGymStore((s) => s.todayRevenue);

  const totalOccupancy = gyms.reduce((sum, g) => sum + (g.live_occupancy ?? 0), 0);
  const totalCapacity  = gyms.reduce((sum, g) => sum + (g.capacity ?? 0), 0);
  const totalRevenue   = Object.values(todayRevenue).reduce((a, b) => a + b, 0);
  const overallPct     = totalCapacity > 0 ? Math.round((totalOccupancy / totalCapacity) * 100) : 0;

  return (
    <div data-testid="summary-bar" className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <KpiCard
        data-testid="kpi-total-occupancy"
        label="Total Occupancy"
        value={totalOccupancy}
        suffix={`/ ${totalCapacity}`}
        loading={loading}
      />
      <KpiCard
        data-testid="kpi-avg-capacity"
        label="Avg Capacity"
        value={overallPct}
        suffix="%"
        color={overallPct >= 90 ? 'red' : overallPct >= 70 ? 'amber' : 'teal'}
        loading={loading}
      />
      <KpiCard
        data-testid="kpi-revenue"
        label="Today's Revenue"
        value={totalRevenue}
        format={(v) => `₹${v.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
        color="teal"
        loading={loading}
      />
      <KpiCard
        data-testid="kpi-active-gyms"
        label="Active Gyms"
        value={gyms.length}
        loading={loading}
      />
    </div>
  );
}
