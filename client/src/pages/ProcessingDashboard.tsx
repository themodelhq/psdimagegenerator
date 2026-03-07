import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Zap, Loader2, CheckCircle, AlertCircle, Download, Wifi, WifiOff, Play } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import { useJobProgress } from '@/hooks/useJobProgress';

export default function ProcessingDashboard() {
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
  const [jobs, setJobs] = useState<any[]>([]);

  const jobsQuery = trpc.batch.list.useQuery(undefined, { refetchInterval: 5000 });
  const startBatchMutation = trpc.batch.start.useMutation();
  const generateTestMutation = trpc.batch.generateTest.useMutation();
  const createZipMutation = trpc.batch.createZip.useMutation();

  const { progress, isConnected } = useJobProgress({
    jobId: selectedJobId || undefined,
    onProgress: (update) => {
      setJobs(prev => prev.map(job =>
        job.id === update.jobId
          ? { ...job, processedRows: update.processedCount || 0, status: update.status === 'completed' ? 'completed' : update.status === 'failed' ? 'failed' : 'processing' }
          : job
      ));
    },
    onComplete: (jobId) => {
      toast.success('Batch processing completed!');
      setJobs(prev => prev.map(job => job.id === jobId ? { ...job, status: 'completed', completedAt: new Date() } : job));
      jobsQuery.refetch();
    },
    onError: (jobId, error) => {
      toast.error(`Job ${jobId} failed: ${error}`);
      setJobs(prev => prev.map(job => job.id === jobId ? { ...job, status: 'failed' } : job));
    },
  });

  useEffect(() => {
    if (jobsQuery.data) {
      setJobs(jobsQuery.data);
      if (!selectedJobId && jobsQuery.data.length > 0) {
        setSelectedJobId(jobsQuery.data[jobsQuery.data.length - 1].id);
      }
    }
  }, [jobsQuery.data]);

  const selectedJob = selectedJobId ? jobs.find(j => j.id === selectedJobId) : null;

  const handleStartJob = async (jobId: number) => {
    try {
      await startBatchMutation.mutateAsync({ jobId });
      toast.success('Job started! Tracking progress via WebSocket…');
      jobsQuery.refetch();
    } catch (err) {
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

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      completed: 'bg-green-100 text-green-800 border-green-200',
      processing: 'bg-blue-100 text-blue-800 border-blue-200',
      failed: 'bg-red-100 text-red-800 border-red-200',
      pending: 'bg-slate-100 text-slate-700 border-slate-200',
    };
    return <Badge className={`border ${styles[status] || styles.pending}`}>{status}</Badge>;
  };

  const getProgressPct = (job: any) => job.totalRows === 0 ? 0 : Math.round((job.processedRows / job.totalRows) * 100);

  if (jobsQuery.isLoading) return <div className="flex items-center justify-center p-12"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>;

  if (jobs.length === 0) {
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
        <div className="lg:col-span-1">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Batch Jobs</CardTitle>
              <CardDescription>{jobs.length} job(s)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {[...jobs].reverse().map(job => (
                <button
                  key={job.id}
                  onClick={() => setSelectedJobId(job.id)}
                  className={`w-full text-left p-3 rounded-lg border-2 transition-all ${selectedJobId === job.id ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'}`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="font-semibold text-sm">Job #{job.id}</p>
                    {getStatusBadge(job.status)}
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-slate-500">
                      <span>{job.processedRows}/{job.totalRows} rows</span>
                      <span>{getProgressPct(job)}%</span>
                    </div>
                    <Progress value={getProgressPct(job)} className="h-1" />
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2">
          {selectedJob ? (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>Job #{selectedJob.id}</CardTitle>
                    {getStatusBadge(selectedJob.status)}
                  </div>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">Progress</span>
                      <span className="text-slate-600">{selectedJob.processedRows} / {selectedJob.totalRows}</span>
                    </div>
                    <Progress value={getProgressPct(selectedJob)} className="h-3" />
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
                      <p className={`font-semibold text-sm ${selectedJob.failedRows > 0 ? 'text-red-600' : 'text-slate-900'}`}>{selectedJob.failedRows}</p>
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
                        onClick={() => handleStartJob(selectedJob.id)}
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
                        <span className="text-sm text-blue-700">Processing… {getProgressPct(selectedJob)}% complete</span>
                      </div>
                    )}
                    {selectedJob.status === 'completed' && (
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
