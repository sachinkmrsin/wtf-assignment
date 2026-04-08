import { create } from 'zustand';
import type { Anomaly } from '../types/models';

interface AnomalyStore {
  anomalies: Anomaly[];
  setAnomalies: (anomalies: Anomaly[]) => void;
  addAnomaly: (anomaly: Anomaly) => void;
  markResolved: (id: string) => void;
  unreadCount: number;
  clearUnread: () => void;
}

export const useAnomalyStore = create<AnomalyStore>((set) => ({
  anomalies: [],
  unreadCount: 0,

  setAnomalies: (anomalies) => set({ anomalies }),

  addAnomaly: (anomaly) =>
    set((state) => ({
      anomalies: [anomaly, ...state.anomalies],
      unreadCount: state.unreadCount + 1,
    })),

  markResolved: (id) =>
    set((state) => {
      const wasUnresolved = state.anomalies.some((a) => a.id === id && !a.resolved);
      return {
        anomalies: state.anomalies.map((a) =>
          a.id === id ? { ...a, resolved: true } : a,
        ),
        // Decrement badge count only if this anomaly was unread/unresolved
        unreadCount: wasUnresolved ? Math.max(0, state.unreadCount - 1) : state.unreadCount,
      };
    }),

  clearUnread: () => set({ unreadCount: 0 }),
}));
