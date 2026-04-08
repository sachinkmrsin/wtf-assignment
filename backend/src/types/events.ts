// Socket.io typed event interfaces — backend
// Keep in sync with frontend/src/types/events.ts

export interface GymOccupancyPayload {
  gymId: string;
  count: number;
  capacity: number;
  timestamp: string;
}

export interface CheckinPayload {
  gymId: string;
  memberId: string;
  memberName: string;
  checkinId: string;
  checkedInAt: string;
  currentOccupancy: number;
  capacityPct: number;
}

export interface CheckoutPayload {
  gymId: string;
  memberId: string;
  memberName: string;
  checkinId: string;
  checkedOutAt: string;
  currentOccupancy: number;
  capacityPct: number;
}

export interface PaymentPayload {
  gymId: string;
  memberId: string;
  memberName: string;
  planType: string;
  amount: number;
  todayTotal: number;
  paidAt: string;
}

export interface AnomalyPayload {
  id: string;
  gymId: string;
  gymName: string;
  type: 'zero_checkins' | 'capacity_breach' | 'revenue_drop';
  severity: 'warning' | 'critical';
  message: string;
  detectedAt: string;
}

export interface AnomalyResolvedPayload {
  id: string;
  gymId: string;
  resolvedAt?: string;
}

export interface StatsUpdatePayload {
  gymId: string;
  dailyRevenue: number;
  weeklyCheckins: number;
  timestamp: string;
}

export interface ServerToClientEvents {
  'gym:occupancy': (data: GymOccupancyPayload) => void;
  'gym:checkin': (data: CheckinPayload) => void;
  'gym:checkout': (data: CheckoutPayload) => void;
  'payment:new': (data: PaymentPayload) => void;
  'anomaly:detected': (data: AnomalyPayload) => void;
  'anomaly:resolved': (data: AnomalyResolvedPayload) => void;
  'stats:update': (data: StatsUpdatePayload) => void;
}

export interface ClientToServerEvents {
  'gym:subscribe': (gymId: string) => void;
  'gym:unsubscribe': (gymId: string) => void;
}

export interface InterServerEvents {
  ping: () => void;
}

export interface SocketData {
  subscribedGyms: Set<string>;
}
