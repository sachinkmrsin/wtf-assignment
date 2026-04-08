import type { Gym } from '@/types/models';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useCountUp } from '@/hooks/useCountUp';

interface GymCardProps {
  gym: Gym;
  selected?: boolean;
  onClick?: () => void;
}

export function GymCard({ gym, selected, onClick }: GymCardProps) {
  const occupancyPct    = gym.capacity > 0 ? Math.round((gym.live_occupancy / gym.capacity) * 100) : 0;
  const animatedOcc     = useCountUp(gym.live_occupancy);
  const animatedPct     = useCountUp(occupancyPct);

  const barColor =
    occupancyPct >= 90 ? 'bg-red-500' :
    occupancyPct >= 70 ? 'bg-amber-400' :
    'bg-teal-400';

  const pctColor =
    occupancyPct >= 90 ? 'text-red-400' :
    occupancyPct >= 70 ? 'text-amber-400' :
    'text-teal-400';

  return (
    <Card
      onClick={onClick}
      data-testid="gym-card"
      className={`cursor-pointer transition-all duration-200 hover:shadow-lg hover:shadow-black/30 hover:border-teal-500/30 ${
        selected ? 'ring-2 ring-teal-500/70 border-teal-500/50' : ''
      }`}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <CardTitle className="text-sm font-semibold leading-tight">{gym.name}</CardTitle>
          <span className={`text-xs font-bold tabular-nums ${pctColor}`}>
            {animatedPct}%
          </span>
        </div>
        <p className="text-xs text-muted-foreground">{gym.location}</p>
      </CardHeader>
      <CardContent>
        <div className="flex items-end gap-1">
          <span className="text-3xl font-bold tabular-nums text-foreground">{animatedOcc}</span>
          <span className="text-muted-foreground text-sm mb-0.5">/ {gym.capacity}</span>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">live occupancy</p>
        {/* Capacity bar */}
        <div className="mt-3 h-1.5 rounded-full bg-secondary overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${barColor}`}
            style={{ width: `${Math.min(occupancyPct, 100)}%` }}
          />
        </div>
      </CardContent>
    </Card>
  );
}
