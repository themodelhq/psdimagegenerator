import { Server as HTTPServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';

export interface ProgressUpdate {
  jobId: number;
  currentStep: number;
  totalSteps: number;
  percentage: number;
  status: 'processing' | 'completed' | 'error';
  message: string;
  processedCount?: number;
  totalCount?: number;
  currentProductName?: string;
}

export interface ClientToServerEvents {
  'subscribe-job': (jobId: number) => void;
  'unsubscribe-job': (jobId: number) => void;
}

export interface ServerToClientEvents {
  'progress-update': (update: ProgressUpdate) => void;
  'job-completed': (jobId: number, fileKeys?: string[]) => void;
  'job-error': (jobId: number, error: string) => void;
}

export interface InterServerEvents {
  ping: () => void;
}

export interface SocketData {
  userId?: number;
  subscribedJobs: Set<number>;
}

let io: SocketIOServer<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData> | null = null;

/**
 * Initialize WebSocket server
 */
export function initializeWebSocket(
  httpServer: HTTPServer,
  options?: {
    cors?: {
      origin: string | string[];
      credentials: boolean;
    };
  }
) {
  io = new SocketIOServer(httpServer, {
    cors: options?.cors || {
      origin: '*',
      credentials: true,
    },
  });

  io.on('connection', (socket: Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>) => {
    socket.data.subscribedJobs = new Set();

    socket.on('subscribe-job', (jobId: number) => {
      socket.data.subscribedJobs.add(jobId);
      socket.join(`job-${jobId}`);
      console.log(`Client subscribed to job ${jobId}`);
    });

    socket.on('unsubscribe-job', (jobId: number) => {
      socket.data.subscribedJobs.delete(jobId);
      socket.leave(`job-${jobId}`);
      console.log(`Client unsubscribed from job ${jobId}`);
    });

    socket.on('disconnect', () => {
      console.log(`Client disconnected, was subscribed to ${socket.data.subscribedJobs.size} jobs`);
    });
  });

  return io;
}

/**
 * Get the WebSocket server instance
 */
export function getWebSocket() {
  if (!io) {
    throw new Error('WebSocket server not initialized');
  }
  return io;
}

/**
 * Broadcast progress update to all clients subscribed to a job
 */
export function broadcastProgress(jobId: number, update: ProgressUpdate) {
  if (!io) {
    console.warn('WebSocket server not initialized, cannot broadcast progress');
    return;
  }

  io.to(`job-${jobId}`).emit('progress-update', update);
}

/**
 * Notify clients that a job has completed
 */
export function notifyJobCompleted(jobId: number, fileKeys?: string[]) {
  if (!io) {
    console.warn('WebSocket server not initialized, cannot notify completion');
    return;
  }

  io.to(`job-${jobId}`).emit('job-completed', jobId, fileKeys);
}

/**
 * Notify clients of a job error
 */
export function notifyJobError(jobId: number, error: string) {
  if (!io) {
    console.warn('WebSocket server not initialized, cannot notify error');
    return;
  }

  io.to(`job-${jobId}`).emit('job-error', jobId, error);
}
