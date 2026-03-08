import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Zap, Loader2, CheckCircle, AlertCircle, Download, Wifi, WifiOff, Play } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import { useJobProgress } from '@/hooks/useJobProgress';
import { consumePendingJob, type PendingJob } from '@/hooks/useGuest';

// Shape used for display — works for both DB jobs and ephemeral guest jobs
interface DisplayJob {
  id: number;           // real DB id or a client-generated pseudo-id for guests
  status: string;
  totalRows: number;
  processedRows: number;
  failedRows: number;
  errorMessage?: string | null;
  completedAt?: Date | null;
  // Guest-only: S3 keys passed to batch.start instead of a DB jobId
  isGuest?: boolean;
  guestTemplateFileKey?: string;
  guestExcelFileKey?: string;
  guestSizeId?: string;
}

export default function ProcessingDashboard() {
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
  const [dbJobs, setDbJobs] = useState<DisplayJob[]>([]);
  const [guestJobs, setGuestJobs] = useState<DisplayJob[]>([]);
  const startedRef = useRef<Set<number>>(new Set());

  const jobsQuery = trpc.batch.list.useQuery(undefined, { refetchInterval: 5000 });
  const startBatchMutation = trpc.batch.start.useMutation();
  const createZipMutation = trpc.batch.createZip.useMutation();

  // ── Consume pending job written by UploadInterface ──────────────────────
  useEffect(() => {
    const pending: PendingJob | null = consumePendingJob();
    if (!pending) return;

    if (pending.isGuest) {
      const pseudoId = Date.now();
      const guestJob: DisplayJob = {
        id: pseudoId,
        status: 'pending',
        totalRows: pending.totalRows ?? 0,
        processedRows: 0,
        failedRows: 0,
        isGuest: true,
        guestTemplateFileKey: pending.guestTemplateFileKey,
        guestExcelFileKey: pending.guestExcelFileKey,
        guestSizeId: pending.guestSizeId,
      };
      setGuestJobs([guestJob]);
      setSelectedJobId(pseudoId);
    } else if (pending.jobId) {
      // Authenticated: job is in DB, just select it immediately (list will load it)
      setSelectedJobId(pending.jobId);
    }
  }, []);

  // ── Sync DB jobs from tRPC query ─────────────────────────────────────────
  useEffect(() => {
    if (!jobsQuery.data) return;
    setDbJobs(jobsQuery.data.map(j => ({ ...j, isGuest: false })));
    // Auto-select latest if nothing is selected and no guest job is active
    if (!selectedJobId && guestJobs.length === 0 && jobsQuery.data.length > 0) {
      setSelectedJobId(jobsQuery.data[jobsQuery.data.length - 1].id);
    }
  }, [jobsQuery.data]);

  // ── Merge DB + guest jobs for display ────────────────────────────────────
  const allJobs: DisplayJob[] = [...dbJobs, ...guestJobs];
  const selectedJob = selectedJobId ? allJobs.find(j => j.id === selectedJobId) ?? null : null;

  // ── WebSocket progress ───────────────────────────────────────────────────
  const { progress, isConnected } = useJobProgress({
    jobId: selectedJobId || undefined,
    onProgress: (update) => {
      const updater = (job: DisplayJob) =>
        job.id === update.jobId
          ? { ...job, processedRows: update.processedCount ?? 0, status: update.status === 'completed' ? 'completed' : update.status === 'failed' ? 'failed' : 'processing' }
          : job;
      setDbJobs(prev => prev.map(updater));
      setGuestJobs(prev => prev.map(updater));
    },
    onComplete: (jobId) => {
      toast.success('Batch processing completed!');
      const done = (job: DisplayJob) =>
        job.id === jobId ? { ...job, status: 'completed', completedAt: new Date() } : job;
      setDbJobs(prev => prev.map(done));
      setGuestJobs(prev => prev.map(done));
      jobsQuery.refetch();
    },
    onError: (jobId, error) => {
      toast.error(`Job failed: ${error}`);
      const fail = (job: DisplayJob) => job.id === jobId ? { ...job, status: 'failed' } : job;
      setDbJobs(prev => prev.map(fail));
      setGuestJobs(prev => prev.map(fail));
    },
  });

  // ── Actions ──────────────────────────────────────────────────────────────
  const handleStartJob = async (job: DisplayJob) => {
    if (startedRef.current.has(job.id)) return;
    startedRef.current.add(job.id);

    // Optimistically mark as processing
    const markProcessing = (j: DisplayJob) => j.id === job.id ? { ...j, status: 'processing' } : j;
    setDbJobs(prev => prev.map(markProcessing));
    setGuestJobs(prev => prev.map(markProcessing));

    try {
      if (job.isGuest) {
        await startBatchMutation.mutateAsync({
          guestTemplateFileKey: job.guestTemplateFileKey,
          guestExcelFileKey: job.guestExcelFileKey,
          guestSizeId: job.guestSizeId,
        });
      } else {
        await startBatchMutation.mutateAsync({ jobId: job.id });
      }
      toast.success('Job started! Tracking progress via WebSocket…');
      jobsQuery.refetch();
    } catch (err) {
      startedRef.current.delete(job.id);
      const revert = (j: DisplayJob) => j.id === job.id ? { ...j, status: 'pending' } : j;
      setDbJobs(prev => prev.map(revert));
      setGuestJobs(prev => prev.map(revert));
      toast.error(err instanceof Error ? err.message : 'Failed to start job');
    }
  };

  const handleCreateZip = async (jobId: number) => {
    try {
      const result = await createZipMutation.mutateAsync({ jobId });
      if (result.zipUrl) {
        window.open(result.zipUrl, '_blank');
        toast.success(`ZIP ready: ${result.imageCount} images`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create ZIP');
    }
  };

  // ── Helpers ───────────────────────────────────────────────────────────────
  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      completed: 'bg-green-100 text-green-800 border-green-200',
      processing: 'bg-blue-100 text-blue-800 border-blue-200',
      failed: 'bg-red-100 text-red-800 border-red-200',
      pending: 'bg-slate-100 text-slate-700 border-slate-200',
    };
    return <Badge className={`border ${styles[status] || styles.pending}`}>{status}</Badge>;
  };

  const getPct = (job: DisplayJob) =>
    job.totalRows === 0 ? 0 : Math.round((job.processedRows / job.totalRows) * 100);

  // ── Render ────────────────────────────────────────────────────────────────
  if (jobsQuery.isLoading && guestJobs.length === 0) {
    return <div className="flex items-center justify-center p-12"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>;
  }

  if (allJobs.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center py-16 text-slate-500">
            <Zap className="w-14 h-14 mx-auto text-slate-200 mb-4" />
            <p className="font-medium">No batch jobs yet</p>
            <p className="text-sm mt-1">Upload files in the Upload tab to create a job</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <Alert className={isConnected ? 'border-green-200 bg-green-50' : 'border-yellow-200 bg-yellow-50'}>
        {isConnected
          ? <><Wifi className="h-4 w-4 text-green-600" /><AlertDescription className="text-green-800">Live WebSocket connected — progress updates in real-time</AlertDescription></>
          : <><WifiOff className="h-4 w-4 text-yellow-600" /><AlertDescription className="text-yellow-800">Connecting to WebSocket server…</AlertDescription></>}
      </Alert>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Job list */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Batch Jobs</CardTitle>
              <CardDescription>{allJobs.length} job(s)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {[...allJobs].reverse().map(job => (
                <button
                  key={job.id}
                  onClick={() => setSelectedJobId(job.id)}
                  className={`w-full text-left p-3 rounded-lg border-2 transition-all ${selectedJobId === job.id ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'}`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="font-semibold text-sm">
                      {job.isGuest ? 'Guest Job' : `Job #${job.id}`}
                    </p>
                    {getStatusBadge(job.status)}
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-slate-500">
                      <span>{job.processedRows}/{job.totalRows} rows</span>
                      <span>{getPct(job)}%</span>
                    </div>
                    <Progress value={getPct(job)} className="h-1" />
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Job detail */}
        <div className="lg:col-span-2">
          {selectedJob ? (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>{selectedJob.isGuest ? 'Guest Batch Job' : `Job #${selectedJob.id}`}</CardTitle>
                    {getStatusBadge(selectedJob.status)}
                  </div>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">Progress</span>
                      <span className="text-slate-600">{selectedJob.processedRows} / {selectedJob.totalRows}</span>
                    </div>
                    <Progress value={getPct(selectedJob)} className="h-3" />
                    {progress?.currentProductName && selectedJob.id === selectedJobId && (
                      <p className="text-xs text-slate-500">Processing: <span className="font-medium">{progress.currentProductName}</span></p>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-3 bg-slate-50 rounded-lg text-center">
                      <p className="text-xs text-slate-500">Status</p>
                      <p className="font-semibold text-slate-900 text-sm capitalize">{selectedJob.status}</p>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-lg text-center">
                      <p className="text-xs text-slate-500">Processed</p>
                      <p className="font-semibold text-slate-900 text-sm">{selectedJob.processedRows}</p>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-lg text-center">
                      <p className="text-xs text-slate-500">Failed</p>
                      <p className={`font-semibold text-sm ${(selectedJob.failedRows ?? 0) > 0 ? 'text-red-600' : 'text-slate-900'}`}>{selectedJob.failedRows ?? 0}</p>
                    </div>
                  </div>

                  {selectedJob.errorMessage && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>{selectedJob.errorMessage}</AlertDescription>
                    </Alert>
                  )}

                  {progress?.message && selectedJob.id === selectedJobId && selectedJob.status === 'processing' && (
                    <Alert className="border-blue-200 bg-blue-50">
                      <Zap className="h-4 w-4 text-blue-600" />
                      <AlertDescription className="text-blue-800">{progress.message}</AlertDescription>
                    </Alert>
                  )}

                  <div className="flex gap-2">
                    {selectedJob.status === 'pending' && (
                      <Button
                        onClick={() => handleStartJob(selectedJob)}
                        disabled={startBatchMutation.isPending}
                        className="flex-1 bg-green-600 hover:bg-green-700"
                      >
                        {startBatchMutation.isPending
                          ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Starting…</>
                          : <><Play className="w-4 h-4 mr-2" />Start Processing</>}
                      </Button>
                    )}
                    {selectedJob.status === 'processing' && (
                      <div className="flex-1 flex items-center gap-2 p-3 bg-blue-50 rounded-lg">
                        <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                        <span className="text-sm text-blue-700">Processing… {getPct(selectedJob)}% complete</span>
                      </div>
                    )}
                    {selectedJob.status === 'completed' && !selectedJob.isGuest && (
                      <Button
                        onClick={() => handleCreateZip(selectedJob.id)}
                        disabled={createZipMutation.isPending}
                        className="flex-1"
                      >
                        {createZipMutation.isPending
                          ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creating ZIP…</>
                          : <><Download className="w-4 h-4 mr-2" />Download All as ZIP</>}
                      </Button>
                    )}
                    {selectedJob.status === 'completed' && selectedJob.isGuest && (
                      <div className="flex-1 p-3 bg-amber-50 rounded-lg text-sm text-amber-800 border border-amber-200">
                        Processing complete! Sign in to download a ZIP of all images.
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {selectedJob.completedAt && (
                <Card className="border-green-200 bg-green-50">
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-center gap-3">
                      <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                      <div>
                        <p className="font-medium text-green-900">Job Completed</p>
                        <p className="text-sm text-green-700">
                          {new Date(selectedJob.completedAt).toLocaleString()} — {selectedJob.processedRows} images generated
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          ) : (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center py-12 text-slate-500">
                  <p>Select a job to view details</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
