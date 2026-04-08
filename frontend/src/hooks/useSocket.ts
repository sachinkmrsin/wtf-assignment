import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import type { ServerToClientEvents, ClientToServerEvents } from '../types/events';
import { useGymStore } from '../store/gymStore';
import { useAnomalyStore } from '../store/anomalyStore';
import { useToastStore } from '../store/toastStore';
import type { Anomaly } from '../types/models';

const WS_URL = import.meta.env.VITE_WS_URL ?? 'http://localhost:3001';

type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socketInstance: AppSocket | null = null;

function getSocket(): AppSocket {
  if (!socketInstance) {
    socketInstance = io(WS_URL, { transports: ['websocket'], autoConnect: true });
  }
  return socketInstance;
}

export function useSocket() {
  const socketRef = useRef<AppSocket | null>(null);

  const updateOccupancy   = useGymStore((s) => s.updateOccupancy);
  const addActivity       = useGymStore((s) => s.addActivity);
  const setRevenueTicker  = useGymStore((s) => s.setRevenueTicker);
  const setWeeklyCheckins = useGymStore((s) => s.setWeeklyCheckins);
  const setWsConnected    = useGymStore((s) => s.setWsConnected);

  const addAnomaly   = useAnomalyStore((s) => s.addAnomaly);
  const markResolved = useAnomalyStore((s) => s.markResolved);
  const addToast     = useToastStore((s) => s.addToast);

  useEffect(() => {
    const socket = getSocket();
    socketRef.current = socket;

    // ── Connection state ─────────────────────────────────────────────────────
    const onConnect    = () => setWsConnected(true);
    const onDisconnect = () => setWsConnected(false);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    // Reflect current state immediately
    setWsConnected(socket.connected);

    // ── CHECKIN_EVENT ────────────────────────────────────────────────────────
    socket.on('gym:checkin', (data) => {
      updateOccupancy(data.gymId, data.currentOccupancy);
      addActivity(data.gymId, {
        type: 'checkin',
        gymId: data.gymId,
        memberName: data.memberName,
        timestamp: data.checkedInAt,
        currentOccupancy: data.currentOccupancy,
        capacityPct: data.capacityPct,
      });
    });

    // ── CHECKOUT_EVENT ───────────────────────────────────────────────────────
    socket.on('gym:checkout', (data) => {
      updateOccupancy(data.gymId, data.currentOccupancy);
      addActivity(data.gymId, {
        type: 'checkout',
        gymId: data.gymId,
        memberName: data.memberName,
        timestamp: data.checkedOutAt,
        currentOccupancy: data.currentOccupancy,
        capacityPct: data.capacityPct,
      });
    });

    // ── gym:occupancy ────────────────────────────────────────────────────────
    socket.on('gym:occupancy', (data) => {
      updateOccupancy(data.gymId, data.count);
    });

    // ── PAYMENT_EVENT ────────────────────────────────────────────────────────
    socket.on('payment:new', (data) => {
      setRevenueTicker(data.gymId, data.todayTotal);
    });

    // ── STATS_UPDATE ─────────────────────────────────────────────────────────
    socket.on('stats:update', (data) => {
      setRevenueTicker(data.gymId, data.dailyRevenue);
      setWeeklyCheckins(data.gymId, data.weeklyCheckins);
    });

    // ── ANOMALY_DETECTED ─────────────────────────────────────────────────────
    socket.on('anomaly:detected', (data) => {
      const anomaly: Anomaly = {
        id: data.id,
        gym_id: data.gymId,
        gym_name: data.gymName,
        type: data.type,
        severity: data.severity === 'critical' ? 'critical' : 'high',
        message: data.message,
        resolved: false,
        detected_at: data.detectedAt,
      };
      addAnomaly(anomaly);
      addToast({
        variant: 'anomaly_detected',
        title: `${data.severity === 'critical' ? '🚨' : '⚠️'} ${data.gymName || 'Gym'} Anomaly`,
        message: data.message,
        severity: data.severity,
      });
    });

    // ── ANOMALY_RESOLVED ─────────────────────────────────────────────────────
    socket.on('anomaly:resolved', (data) => {
      markResolved(data.id);
      addToast({
        variant: 'anomaly_resolved',
        title: '✅ Anomaly Resolved',
        message: `Issue at gym resolved${data.resolvedAt ? ` at ${new Date(data.resolvedAt).toLocaleTimeString()}` : ''}.`,
      });
    });

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('gym:checkin');
      socket.off('gym:checkout');
      socket.off('gym:occupancy');
      socket.off('payment:new');
      socket.off('stats:update');
      socket.off('anomaly:detected');
      socket.off('anomaly:resolved');
    };
  }, [updateOccupancy, addActivity, setRevenueTicker, setWeeklyCheckins, setWsConnected, addAnomaly, markResolved, addToast]);

  const subscribeToGym = useCallback((gymId: string) => {
    socketRef.current?.emit('gym:subscribe', gymId);
  }, []);

  const unsubscribeFromGym = useCallback((gymId: string) => {
    socketRef.current?.emit('gym:unsubscribe', gymId);
  }, []);

  return { subscribeToGym, unsubscribeFromGym, socket: socketRef.current };
}
