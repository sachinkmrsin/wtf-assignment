import { create } from 'zustand';
import type { Gym } from '../types/models';

export interface ActivityItem {
  type: 'checkin' | 'checkout';
  gymId: string;
  memberName: string;
  timestamp: string;
  currentOccupancy: number;
  capacityPct: number;
}

const FEED_MAX = 20;

interface GymStore {
  gyms: Gym[];
  selectedGymId: string | null;
  activityFeed: Record<string, ActivityItem[]>;
  todayRevenue: Record<string, number>;
  weeklyCheckins: Record<string, number>;
  wsConnected: boolean;

  setGyms: (gyms: Gym[]) => void;
  setSelectedGym: (id: string | null) => void;
  updateOccupancy: (gymId: string, count: number) => void;
  updateRevenue: (gymId: string, delta: number) => void;
  setRevenueTicker: (gymId: string, todayTotal: number) => void;
  setWeeklyCheckins: (gymId: string, count: number) => void;
  addActivity: (gymId: string, item: ActivityItem) => void;
  setWsConnected: (connected: boolean) => void;
}

export const useGymStore = create<GymStore>((set) => ({
  gyms: [],
  selectedGymId: null,
  activityFeed: {},
  todayRevenue: {},
  weeklyCheckins: {},
  wsConnected: false,

  setGyms: (gyms) => set({ gyms }),
  setSelectedGym: (id) => set({ selectedGymId: id }),

  updateOccupancy: (gymId, count) =>
    set((state) => ({
      gyms: state.gyms.map((g) =>
        g.id === gymId ? { ...g, live_occupancy: count } : g,
      ),
    })),

  updateRevenue: (gymId, delta) =>
    set((state) => ({
      gyms: state.gyms.map((g) =>
        g.id === gymId
          ? { ...g, today_revenue: ((g as Gym & { today_revenue?: number }).today_revenue ?? 0) + delta }
          : g,
      ),
    })),

  setRevenueTicker: (gymId, todayTotal) =>
    set((state) => ({
      todayRevenue: { ...state.todayRevenue, [gymId]: todayTotal },
    })),

  setWeeklyCheckins: (gymId, count) =>
    set((state) => ({
      weeklyCheckins: { ...state.weeklyCheckins, [gymId]: count },
    })),

  addActivity: (gymId, item) =>
    set((state) => {
      const current = state.activityFeed[gymId] ?? [];
      return {
        activityFeed: {
          ...state.activityFeed,
          [gymId]: [item, ...current].slice(0, FEED_MAX),
        },
      };
    }),

  setWsConnected: (connected) => set({ wsConnected: connected }),
}));
