export interface Gym {
  id: string;
  name: string;
  location: string;
  capacity: number;
  live_occupancy: number;
  active_members?: number;
  created_at: string;
}

export interface Member {
  id: string;
  gym_id: string;
  name: string;
  email: string;
  status: 'active' | 'inactive' | 'suspended';
  last_checkin_at: string | null;
  created_at: string;
}

export interface Anomaly {
  id: string;
  gym_id: string;
  gym_name: string;
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  resolved: boolean;
  detected_at: string;
}

export interface HeatmapRow {
  gym_id: string;
  hour_of_day: number;
  day_of_week: number;
  total_checkins: number;
  avg_duration_minutes: number | null;
  peak_count: number;
}

export interface RevenueComparison {
  gym_id: string;
  gym_name: string;
  total_revenue: string;
}

export interface GymStats {
  gymId: string;
  liveOccupancy: number;
  capacity: number;
  todayRevenue: number;
  weeklyCheckins: number;
}

