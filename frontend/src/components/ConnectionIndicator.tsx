import { useGymStore } from '@/store/gymStore';

/**
 * Pulsing green dot = WebSocket connected.
 * Solid red dot = disconnected.
 * Always visible; never lies about live status.
 */
export function ConnectionIndicator() {
  const wsConnected = useGymStore((s) => s.wsConnected);

  return (
    <div
      data-testid="ws-indicator"
      className="flex items-center gap-2"
      title={wsConnected ? 'WebSocket connected — live data active' : 'WebSocket disconnected'}
    >
      <span className="relative flex items-center justify-center w-3 h-3">
        {wsConnected ? (
          <>
            <span className="absolute inline-flex h-3 w-3 rounded-full bg-green-400/60 animate-ping" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-green-400" />
          </>
        ) : (
          <span className="inline-flex h-2 w-2 rounded-full bg-red-500" />
        )}
      </span>
      <span className={`text-xs font-medium ${wsConnected ? 'text-green-400' : 'text-red-400'}`}>
        {wsConnected ? 'Live' : 'Disconnected'}
      </span>
    </div>
  );
}

