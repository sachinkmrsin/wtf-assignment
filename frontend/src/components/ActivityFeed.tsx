import { useRef } from 'react';
import type { ActivityItem } from '@/store/gymStore';

interface ActivityFeedProps {
  items: ActivityItem[];
  maxItems?: number;
}

function relativeTime(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 60_000)     return `${Math.floor(diff / 1_000)}s ago`;
  if (diff < 3_600_000)  return `${Math.floor(diff / 60_000)}m ago`;
  return `${Math.floor(diff / 3_600_000)}h ago`;
}

export function ActivityFeed({ items, maxItems = 10 }: ActivityFeedProps) {
  const visible       = items.slice(0, maxItems);
  const prevLenRef    = useRef(0);
  const isNewItem     = (idx: number) => idx === 0 && visible.length > prevLenRef.current;
  prevLenRef.current  = visible.length;

  if (visible.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">
        No activity yet — waiting for live events…
      </p>
    );
  }

  return (
    <ul className="divide-y divide-border" data-testid="activity-feed">
      {visible.map((item, i) => (
        <li
          key={`${item.timestamp}-${i}`}
          className={`flex items-center gap-3 py-2.5 ${isNewItem(i) ? 'animate-in slide-in-from-top-2 fade-in duration-300' : ''}`}
        >
          {/* Type icon */}
          <span
            className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
              item.type === 'checkin'
                ? 'bg-teal-500/10 text-teal-400'
                : 'bg-orange-500/10 text-orange-400'
            }`}
          >
            {item.type === 'checkin' ? '↑' : '↓'}
          </span>

          {/* Name + action */}
          <span className="flex-1 text-sm leading-tight truncate">
            <span className="font-medium text-foreground">{item.memberName}</span>
            <span className="text-muted-foreground">
              {' '}{item.type === 'checkin' ? 'checked in' : 'checked out'}
            </span>
          </span>

          {/* Occupancy badge */}
          <span
            className={`text-xs font-mono px-1.5 py-0.5 rounded shrink-0 ${
              item.capacityPct >= 90
                ? 'bg-red-500/10 text-red-400'
                : item.capacityPct >= 70
                  ? 'bg-amber-500/10 text-amber-400'
                  : 'bg-teal-500/10 text-teal-400'
            }`}
          >
            {item.currentOccupancy} ({item.capacityPct}%)
          </span>

          {/* Timestamp */}
          <span className="text-xs text-muted-foreground/60 w-14 text-right tabular-nums shrink-0">
            {relativeTime(item.timestamp)}
          </span>
        </li>
      ))}
    </ul>
  );
}
