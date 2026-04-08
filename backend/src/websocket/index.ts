import { Server as HttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import {
  ServerToClientEvents,
  ClientToServerEvents,
  InterServerEvents,
  SocketData,
} from '../types/events';

let io: SocketIOServer<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

export function initSocketIO(httpServer: HttpServer): typeof io {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL ?? '*',
      methods: ['GET', 'POST'],
    },
  });

  io.on('connection', (socket) => {
    console.log(`[ws] Client connected: ${socket.id}`);
    socket.data.subscribedGyms = new Set();

    socket.on('gym:subscribe', (gymId: string) => {
      socket.join(`gym:${gymId}`);
      socket.data.subscribedGyms.add(gymId);
      console.log(`[ws] ${socket.id} subscribed to gym:${gymId}`);
    });

    socket.on('gym:unsubscribe', (gymId: string) => {
      socket.leave(`gym:${gymId}`);
      socket.data.subscribedGyms.delete(gymId);
    });

    socket.on('disconnect', () => {
      console.log(`[ws] Client disconnected: ${socket.id}`);
    });
  });

  return io;
}

export function getIO(): typeof io {
  if (!io) throw new Error('Socket.io not initialized — call initSocketIO first');
  return io;
}

// ── Broadcast helpers ────────────────────────────────────────────────────────

export function broadcastToGym<Ev extends keyof ServerToClientEvents>(
  gymId: string,
  event: Ev,
  data: Parameters<ServerToClientEvents[Ev]>[0]
): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (getIO().to(`gym:${gymId}`) as any).emit(event, data);
}

export function broadcastToAll<Ev extends keyof ServerToClientEvents>(
  event: Ev,
  data: Parameters<ServerToClientEvents[Ev]>[0]
): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (getIO() as any).emit(event, data);
}
