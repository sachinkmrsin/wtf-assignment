import type { ReactNode } from 'react';
import { useCountUp } from '@/hooks/useCountUp';
import { Skeleton } from '@/components/ui/skeleton';

interface KpiCardProps {
  label: string;
  value: number;
  format?: (v: number) => string;
  suffix?: string;
  icon?: ReactNode;
  loading?: boolean;
  error?: string | null;
  /** 'teal' | 'red' | 'amber' | 'default' */
  color?: 'default' | 'teal' | 'red' | 'amber';
  'data-testid'?: string;
}

const colorMap: Record<string, string> = {
  teal:    'text-teal-400',
  red:     'text-red-400',
  amber:   'text-amber-400',
  default: 'text-foreground',
};

export function KpiCard({
  label,
  value,
  format,
  suffix,
  icon,
  loading = false,
  error = null,
  color = 'default',
  'data-testid': testId = 'kpi-card',
}: KpiCardProps) {
  const animated = useCountUp(loading ? 0 : value);
  const display  = format ? format(animated) : animated.toLocaleString('en-IN');
  const cls      = colorMap[color] ?? colorMap.default;

  return (
    <div
      data-testid={testId}
      className="rounded-lg border border-border bg-card px-4 py-3 space-y-1.5"
    >
      <p className="text-xs text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
        {icon}
        {label}
      </p>

      {loading ? (
        <>
          <Skeleton className="h-8 w-28 rounded" />
          <Skeleton className="h-3 w-16 rounded" />
        </>
      ) : error ? (
        <p className="text-sm text-destructive pt-1">{error}</p>
      ) : (
        <p className={`text-3xl font-bold tabular-nums leading-none ${cls}`}>
          {display}
          {suffix && (
            <span className="text-sm font-normal text-muted-foreground ml-1">{suffix}</span>
          )}
        </p>
      )}
    </div>
  );
}

