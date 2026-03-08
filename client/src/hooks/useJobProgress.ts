import { useEffect, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

export interface ProgressUpdate {
  jobId: number;
  currentStep: number;
  totalSteps: number;
  percentage: number;
  status: 'processing' | 'completed' | 'error' | 'failed';
  message: string;
  processedCount?: number;
  totalCount?: number;
  currentProductName?: string;
}

interface UseJobProgressOptions {
  jobId?: number;
  onProgress?: (update: ProgressUpdate) => void;
  onComplete?: (jobId: number) => void;
  onError?: (jobId: number, error: string) => void;
}

// In production (Netlify), VITE_API_URL is the Render backend URL.
// In development, connect to the same origin (Vite dev server proxies socket.io).
function getSocketUrl(): string {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL as string;
  }
  return window.location.origin;
}

export function useJobProgress({ jobId, onProgress, onComplete, onError }: UseJobProgressOptions) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [progress, setProgress] = useState<ProgressUpdate | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const newSocket = io(getSocketUrl(), {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 10,
      withCredentials: true,
    });

    newSocket.on('connect', () => {
      setIsConnected(true);
      if (jobId) newSocket.emit('subscribe-job', jobId);
    });

    newSocket.on('disconnect', () => setIsConnected(false));

    newSocket.on('progress-update', (update: ProgressUpdate) => {
      setProgress(update);
      onProgress?.(update);
    });

    newSocket.on('job-completed', (completedJobId: number) => {
      onComplete?.(completedJobId);
    });

    newSocket.on('job-error', (errorJobId: number, error: string) => {
      onError?.(errorJobId, error);
    });

    setSocket(newSocket);

    return () => {
      if (jobId) newSocket.emit('unsubscribe-job', jobId);
      newSocket.disconnect();
    };
  }, [jobId]);

  const subscribeToJob = useCallback((newJobId: number) => {
    if (socket?.connected) socket.emit('subscribe-job', newJobId);
  }, [socket]);

  const unsubscribeFromJob = useCallback((id: number) => {
    if (socket?.connected) socket.emit('unsubscribe-job', id);
  }, [socket]);

  return { progress, isConnected, subscribeToJob, unsubscribeFromJob };
}
