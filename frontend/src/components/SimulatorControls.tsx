import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';
type Speed = 1 | 5 | 10;
type SimStatus = 'idle' | 'running' | 'paused';

const statusStyle: Record<SimStatus, string> = {
  idle:    'bg-secondary text-muted-foreground',
  running: 'bg-teal-500/10 text-teal-400 border border-teal-500/30',
  paused:  'bg-amber-500/10 text-amber-400 border border-amber-500/30',
};

export function SimulatorControls() {
  const [status, setStatus]   = useState<SimStatus>('idle');
  const [speed, setSpeed]     = useState<Speed>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const call = async (action: 'start' | 'stop' | 'reset') => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/api/simulator/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: action === 'start' ? JSON.stringify({ speed }) : undefined,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      setStatus(action === 'start' ? 'running' : action === 'stop' ? 'paused' : 'idle');
    } catch (e) {
      setError(e instanceof Error ? e.message : `Failed to ${action} simulator`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card data-testid="simulator-controls">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <span className="text-base">⚙️</span>
          Simulator
          <span className={`ml-auto text-[11px] px-2 py-0.5 rounded-full font-medium ${statusStyle[status]}`}>
            {status}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Speed selector */}
        <div>
          <p className="text-[11px] text-muted-foreground uppercase tracking-widest mb-2">Speed</p>
          <div className="flex gap-1.5">
            {([1, 5, 10] as Speed[]).map((s) => (
              <button
                key={s}
                data-testid={`speed-${s}x`}
                onClick={() => setSpeed(s)}
                disabled={status === 'running'}
                className={`px-3 py-1 rounded text-xs font-medium border transition-colors ${
                  speed === s
                    ? 'bg-teal-500/20 border-teal-500/50 text-teal-400'
                    : 'border-border text-muted-foreground hover:border-teal-500/30 hover:text-foreground'
                } disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                {s}×
              </button>
            ))}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2">
          <Button
            size="sm"
            data-testid="sim-start"
            onClick={() => call('start')}
            disabled={loading || status === 'running'}
            className="bg-teal-600 hover:bg-teal-500 text-white text-xs h-7"
          >
            ▶ Start
          </Button>
          <Button
            size="sm"
            variant="outline"
            data-testid="sim-stop"
            onClick={() => call('stop')}
            disabled={loading || status !== 'running'}
            className="text-xs h-7"
          >
            ⏸ Pause
          </Button>
          <Button
            size="sm"
            variant="outline"
            data-testid="sim-reset"
            onClick={() => call('reset')}
            disabled={loading}
            className="text-xs h-7 text-muted-foreground hover:text-destructive hover:border-destructive/50"
          >
            ↺ Reset
          </Button>
        </div>

        {error && (
          <p className="text-xs text-destructive border border-destructive/20 bg-destructive/5 rounded px-2 py-1">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

