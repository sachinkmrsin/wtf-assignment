import { NavLink } from 'react-router-dom';
import { useAnomalyStore } from '@/store/anomalyStore';
import { Badge } from '@/components/ui/badge';
import { ConnectionIndicator } from '@/components/ConnectionIndicator';

export function Navbar() {
  const unreadCount = useAnomalyStore((s) => s.unreadCount);

  return (
    <nav className="border-b border-border bg-card px-6 py-3 flex items-center gap-6 sticky top-0 z-40 backdrop-blur-sm">
      {/* Brand */}
      <span className="font-bold text-lg tracking-tight text-teal-400 flex items-center gap-1.5">
        <span className="text-xl">⚡</span>
        WTF <span className="text-foreground">LivePulse</span>
      </span>

      {/* Nav links */}
      <div className="flex gap-4 ml-4">
        <NavLink
          to="/"
          className={({ isActive }) =>
            `text-sm font-medium transition-colors ${isActive ? 'text-teal-400' : 'text-muted-foreground hover:text-foreground'}`
          }
        >
          Dashboard
        </NavLink>
        <NavLink
          to="/analytics"
          className={({ isActive }) =>
            `text-sm font-medium transition-colors ${isActive ? 'text-teal-400' : 'text-muted-foreground hover:text-foreground'}`
          }
        >
          Analytics
        </NavLink>
        <NavLink
          to="/anomalies"
          className={({ isActive }) =>
            `text-sm font-medium transition-colors flex items-center gap-1.5 ${isActive ? 'text-teal-400' : 'text-muted-foreground hover:text-foreground'}`
          }
        >
          Anomalies
          {unreadCount > 0 && (
            <Badge variant="destructive" className="h-4 min-w-4 px-1 text-[10px]">
              {unreadCount}
            </Badge>
          )}
        </NavLink>
      </div>

      {/* Right: live indicator */}
      <div className="ml-auto">
        <ConnectionIndicator />
      </div>
    </nav>
  );
}
