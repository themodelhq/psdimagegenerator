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

// Always connect the WebSocket directly to the backend (Render).
// Netlify's CDN redirect rules don't support WebSocket protocol upgrades,
// so we must bypass Netlify and hit Render directly.
function getSocketUrl(): string {
  // VITE_API_URL is set at Netlify build time to the Render backend URL
  const apiUrl = import.meta.env.VITE_API_URL as string | undefined;
  if (apiUrl && apiUrl.startsWith('http')) return apiUrl;
  // Dev: same origin (Vite proxies socket.io to localhost:3000)
  return window.location.origin;
}

export function useJobProgress({ jobId, onProgress, onComplete, onError }: UseJobProgressOptions) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [progress, setProgress] = useState<ProgressUpdate | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const newSocket = io(getSocketUrl(), {
      // Prefer WebSocket, fall back to polling — avoids Netlify proxy issues
      transports: ['websocket', 'polling'],
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
