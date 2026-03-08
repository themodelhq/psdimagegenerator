import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ImageIcon, Loader2, Download, X } from 'lucide-react';
import { trpc } from '@/lib/trpc';

interface PreviewImage {
  id: number;
  imageUrl: string;
  productName?: string | null;
  rowIndex: number;
  status: string;
}

export default function PreviewGallery() {
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
  const [selectedImage, setSelectedImage] = useState<PreviewImage | null>(null);

  const jobsQuery = trpc.batch.list.useQuery();
  const imagesQuery = trpc.batch.getImages.useQuery(
    { jobId: selectedJobId || 0 },
    { enabled: selectedJobId !== null }
  );
  const createZipMutation = trpc.batch.createZip.useMutation();

  const jobs = jobsQuery.data || [];
  const images = imagesQuery.data || [];
  const selectedJob = selectedJobId ? jobs.find(j => j.id === selectedJobId) : null;

  const handleDownloadZip = async (jobId: number) => {
    try {
      const result = await createZipMutation.mutateAsync({ jobId });
      if (result.zipUrl) {
        window.open(result.zipUrl, '_blank');
      }
    } catch (error) {
      console.error('Failed to create ZIP:', error);
    }
  };

  if (jobsQuery.isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center py-12">
            <ImageIcon className="w-12 h-12 mx-auto text-slate-300 mb-4" />
            <p className="text-slate-600">No images yet</p>
            <p className="text-sm text-slate-500 mt-1">Generate images in the Processing tab to view them here</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Job Selection */}
      <Card>
        <CardHeader>
          <CardTitle>Select Job</CardTitle>
          <CardDescription>Choose a job to preview its generated images</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {jobs.map(job => (
              <button
                key={job.id}
                onClick={() => setSelectedJobId(job.id)}
                className={`p-3 rounded-lg border-2 transition text-left ${
                  selectedJobId === job.id
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <p className="font-medium text-sm">Job #{job.id}</p>
                <p className="text-xs text-slate-600">
                  {job.processedRows} images
                </p>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Gallery */}
      {selectedJob && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Generated Images</CardTitle>
              <CardDescription>Job #{selectedJob.id} - {images.length} images</CardDescription>
            </div>
            {images.length > 0 && (
              <Button
                onClick={() => handleDownloadZip(selectedJob.id)}
                disabled={createZipMutation.isPending}
                size="sm"
              >
                {createZipMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4 mr-2" />
                    Download All
                  </>
                )}
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {imagesQuery.isLoading ? (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
              </div>
            ) : images.length === 0 ? (
              <div className="text-center py-12">
                <ImageIcon className="w-12 h-12 mx-auto text-slate-300 mb-4" />
                <p className="text-slate-600">No images generated yet</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {images.map(image => (
                  <button
                    key={image.id}
                    onClick={() => setSelectedImage(image)}
                    className="group relative overflow-hidden rounded-lg border border-slate-200 hover:border-slate-400 transition"
                  >
                    <img
                      src={image.imageUrl}
                      alt={image.productName || `Product ${image.rowIndex}`}
                      className="w-full aspect-square object-cover group-hover:scale-105 transition"
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition flex items-center justify-center">
                      <div className="opacity-0 group-hover:opacity-100 transition">
                        <p className="text-white text-sm font-medium">View</p>
                      </div>
                    </div>
                    {image.status === 'failed' && (
                      <Badge className="absolute top-2 right-2 bg-red-600">Failed</Badge>
                    )}
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Image Preview Modal */}
      <Dialog open={!!selectedImage} onOpenChange={() => setSelectedImage(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selectedImage?.productName || `Product ${selectedImage?.rowIndex}`}</DialogTitle>
            <DialogDescription>
              {selectedImage?.status === 'success' ? (
                <Badge className="bg-green-600">Success</Badge>
              ) : (
                <Badge className="bg-red-600">Failed</Badge>
              )}
            </DialogDescription>
          </DialogHeader>
          {selectedImage && (
            <div className="space-y-4">
              <img
                src={selectedImage.imageUrl}
                alt={selectedImage.productName || `Product ${selectedImage.rowIndex}`}
                className="w-full rounded-lg border border-slate-200"
              />
              <div className="flex gap-2">
                <Button
                  onClick={() => {
                    const a = document.createElement('a');
                    a.href = selectedImage.imageUrl;
                    a.download = `${selectedImage.productName || `product-${selectedImage.rowIndex}`}.jpg`;
                    a.click();
                  }}
                  className="flex-1"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Download
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
