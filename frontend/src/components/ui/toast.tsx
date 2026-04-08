import { useToastStore, type ToastItem } from '@/store/toastStore';

function ToastCard({ toast }: { toast: ToastItem }) {
  const removeToast = useToastStore((s) => s.removeToast);

  const borderColor =
    toast.variant === 'anomaly_detected'
      ? toast.severity === 'critical'
        ? 'border-l-destructive'
        : 'border-l-yellow-500'
      : toast.variant === 'anomaly_resolved'
        ? 'border-l-green-500'
        : 'border-l-primary';

  return (
    <div
      role="alert"
      className={`flex items-start gap-3 w-80 rounded-lg border border-border bg-card shadow-lg px-4 py-3 border-l-4 ${borderColor} animate-in slide-in-from-right-8`}
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold leading-tight">{toast.title}</p>
        <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{toast.message}</p>
      </div>
      <button
        onClick={() => removeToast(toast.id)}
        className="shrink-0 text-muted-foreground hover:text-foreground transition-colors text-lg leading-none mt-0.5"
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none"
    >
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto">
          <ToastCard toast={t} />
        </div>
      ))}
    </div>
  );
}

