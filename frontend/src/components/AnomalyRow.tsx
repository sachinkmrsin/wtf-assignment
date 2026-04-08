import type { Anomaly } from '@/types/models';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

const severityConfig: Record<string, { badge: 'default' | 'secondary' | 'destructive'; rowBg: string; dot: string }> = {
  low:      { badge: 'secondary',   rowBg: '',                          dot: 'bg-green-400' },
  medium:   { badge: 'default',     rowBg: '',                          dot: 'bg-amber-400' },
  high:     { badge: 'destructive', rowBg: 'border-l-2 border-orange-500/60 pl-3', dot: 'bg-orange-400' },
  critical: { badge: 'destructive', rowBg: 'border-l-2 border-red-500/70 pl-3 bg-red-950/20 rounded-r', dot: 'bg-red-400 animate-pulse' },
};

interface AnomalyBadgeProps { severity: Anomaly['severity'] }
export function AnomalyBadge({ severity }: AnomalyBadgeProps) {
  const cfg = severityConfig[severity] ?? severityConfig.medium;
  return <Badge variant={cfg.badge} className="capitalize text-[11px]">{severity}</Badge>;
}

interface AnomalyRowProps {
  anomaly: Anomaly;
  onResolve?: (id: string) => void;
}

export function AnomalyRow({ anomaly, onResolve }: AnomalyRowProps) {
  const cfg = severityConfig[anomaly.severity] ?? severityConfig.medium;

  return (
    <div
      data-testid="anomaly-row"
      className={`flex items-start justify-between gap-4 py-3 border-b border-border last:border-0 ${cfg.rowBg}`}
    >
      <div className="flex flex-col gap-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Live pulse dot */}
          <span className={`w-2 h-2 rounded-full shrink-0 ${cfg.dot}`} />
          <AnomalyBadge severity={anomaly.severity} />
          <span className="text-sm font-medium truncate">{anomaly.gym_name}</span>
          <span className="text-xs text-muted-foreground capitalize">
            {anomaly.type.replace(/_/g, ' ')}
          </span>
        </div>
        <p className="text-sm text-muted-foreground leading-snug">{anomaly.message}</p>
        <p className="text-xs text-muted-foreground/60">
          {new Date(anomaly.detected_at).toLocaleString()}
        </p>
      </div>
      {!anomaly.resolved && onResolve && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => onResolve(anomaly.id)}
          className="shrink-0 text-xs h-7 border-teal-500/30 text-teal-400 hover:bg-teal-500/10"
        >
          Resolve
        </Button>
      )}
    </div>
  );
}
