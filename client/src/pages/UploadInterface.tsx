import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Upload, AlertCircle, CheckCircle, FileText, Layers, ChevronRight } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import { isGuestMode } from '@/hooks/useGuest';

const DIAPER_SIZES = [
  { id: 'micro',   label: 'Micro',    weightRange: '>2.5 kg',  color: 'bg-pink-100 text-pink-800' },
  { id: 'newborn', label: 'New Born', weightRange: '2-5 kg',   color: 'bg-yellow-100 text-yellow-800' },
  { id: 'mini',    label: 'Mini',     weightRange: '3-6 kg',   color: 'bg-green-100 text-green-800' },
  { id: 'midi',    label: 'Midi',     weightRange: '4-9 kg',   color: 'bg-blue-100 text-blue-800' },
  { id: 'maxi',    label: 'Maxi',     weightRange: '7-15 kg',  color: 'bg-purple-100 text-purple-800' },
  { id: 'xlarge',  label: 'XLarge',   weightRange: '>15 kg',   color: 'bg-orange-100 text-orange-800' },
  { id: 'junior',  label: 'Junior',   weightRange: '11-25 kg', color: 'bg-red-100 text-red-800' },
];

/** Convert a File to base64 — browser-safe, no Node Buffer needed */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      resolve(dataUrl.split(',')[1]);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

interface UploadState {
  psdFile: File | null;
  excelFile: File | null;
  psdParsed: boolean;
  excelParsed: boolean;
  psdLoading: boolean;
  excelLoading: boolean;
  psdError: string | null;
  excelError: string | null;
  templateId: number | null;
  guestTemplateFileKey: string | null; // used when in guest mode (no DB templateId)
  excelFileKey: string | null;
  excelFileUrl: string | null;
  excelHeaders: string[];
  rowCount: number;
  textLayers: Array<{ name: string; text: string }>;
  selectedSizeId: string;
}

export default function UploadInterface() {
  const [state, setState] = useState<UploadState>({
    psdFile: null, excelFile: null,
    psdParsed: false, excelParsed: false,
    psdLoading: false, excelLoading: false,
    psdError: null, excelError: null,
    templateId: null, guestTemplateFileKey: null,
    excelFileKey: null, excelFileUrl: null,
    excelHeaders: [], rowCount: 0, textLayers: [],
    selectedSizeId: 'midi',
  });

  const uploadPsdMutation = trpc.template.upload.useMutation();
  const parseExcelMutation = trpc.excel.parse.useMutation();
  const createBatchMutation = trpc.batch.create.useMutation();
  const utils = trpc.useUtils();

  const handlePsdChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith('.psd')) {
      setState(prev => ({ ...prev, psdError: 'Please select a .psd file' }));
      return;
    }
    setState(prev => ({ ...prev, psdFile: file, psdLoading: true, psdError: null }));
    try {
      const fileBase64 = await fileToBase64(file);
      const result = await uploadPsdMutation.mutateAsync({ fileName: file.name, fileBase64 });
      setState(prev => ({
        ...prev,
        psdParsed: true,
        psdLoading: false,
        textLayers: (result.textLayers as any) || [],
        // For guests the server returns fileKey; for users it's saved in DB
        templateId: result.isGuest ? null : undefined as any,  // will be fetched from list
        guestTemplateFileKey: result.isGuest ? result.fileKey : null,
      }));
      toast.success(`PSD uploaded: ${result.width}×${result.height}px, ${result.textLayers.length} text layers`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to upload PSD';
      setState(prev => ({ ...prev, psdError: msg, psdLoading: false }));
      toast.error(msg);
    }
  };

  const handleExcelChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.match(/\.(xlsx|xls)$/)) {
      setState(prev => ({ ...prev, excelError: 'Please select an Excel file (.xlsx or .xls)' }));
      return;
    }
    setState(prev => ({ ...prev, excelFile: file, excelLoading: true, excelError: null }));
    try {
      const fileBase64 = await fileToBase64(file);
      const result = await parseExcelMutation.mutateAsync({ fileName: file.name, fileBase64 });
      setState(prev => ({
        ...prev,
        excelParsed: true,
        excelLoading: false,
        excelFileKey: result.fileKey,
        excelFileUrl: result.fileUrl,
        excelHeaders: result.headers,
        rowCount: result.rowCount,
      }));
      toast.success(`Excel parsed: ${result.rowCount} rows, columns: ${result.headers.join(', ')}`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to parse Excel';
      setState(prev => ({ ...prev, excelError: msg, excelLoading: false }));
      toast.error(msg);
    }
  };

  const handleStartBatch = async () => {
    if (!state.excelFileKey || !state.excelFileUrl) {
      toast.error('Upload Excel file first');
      return;
    }

    try {
      const guest = isGuestMode();

      if (guest) {
        // Guest: pass S3 file keys directly — no DB lookup needed
        if (!state.guestTemplateFileKey) {
          toast.error('Upload a PSD template first');
          return;
        }
        await createBatchMutation.mutateAsync({
          guestTemplateFileKey: state.guestTemplateFileKey,
          excelFileKey: state.excelFileKey,
          excelFileUrl: state.excelFileUrl,
          layerMapping: {},
          totalRows: state.rowCount,
          sizeId: state.selectedSizeId,
        });
      } else {
        // Authenticated user: fetch the latest template from DB
        const templates = await utils.template.list.fetch();
        const latestTemplate = templates[templates.length - 1];
        if (!latestTemplate) {
          toast.error('No template found. Upload PSD first.');
          return;
        }
        await createBatchMutation.mutateAsync({
          templateId: latestTemplate.id,
          excelFileKey: state.excelFileKey,
          excelFileUrl: state.excelFileUrl,
          layerMapping: {},
          totalRows: state.rowCount,
          sizeId: state.selectedSizeId,
        });
      }

      toast.success('Batch job created! Go to the Batch tab to start processing.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create batch job');
    }
  };

  const isReady = state.psdParsed && state.excelParsed;
  const selectedSizeInfo = DIAPER_SIZES.find(s => s.id === state.selectedSizeId);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* PSD Upload */}
        <Card className={state.psdParsed ? 'border-green-200' : ''}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Layers className="w-5 h-5 text-purple-600" />
              PSD Template
            </CardTitle>
            <CardDescription>Upload the Photoshop template (e.g. Diapers.psd)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <label
              htmlFor="psd-input"
              className={`block border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all
                ${state.psdLoading ? 'opacity-50' : 'hover:border-purple-400 hover:bg-purple-50/50'}
                ${state.psdParsed ? 'border-green-300 bg-green-50' : 'border-slate-300'}`}
            >
              <input
                type="file"
                accept=".psd"
                onChange={handlePsdChange}
                disabled={state.psdLoading}
                className="hidden"
                id="psd-input"
              />
              {state.psdParsed ? (
                <div className="flex flex-col items-center gap-2 text-green-700">
                  <CheckCircle className="w-8 h-8" />
                  <p className="font-medium">{state.psdFile?.name}</p>
                  <p className="text-xs text-green-600">{state.textLayers.length} text layers extracted</p>
                </div>
              ) : (
                <>
                  <Upload className="w-8 h-8 mx-auto mb-2 text-slate-400" />
                  <p className="text-sm font-medium text-slate-700">
                    {state.psdFile ? state.psdFile.name : 'Click to upload PSD'}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">Photoshop .psd file</p>
                </>
              )}
            </label>
            {state.psdLoading && (
              <div className="space-y-2">
                <p className="text-sm text-slate-500">Uploading & parsing PSD layers…</p>
                <Progress value={60} />
              </div>
            )}
            {state.psdError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{state.psdError}</AlertDescription>
              </Alert>
            )}
            {state.psdParsed && state.textLayers.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-slate-600">Text Layers:</p>
                <div className="flex flex-wrap gap-1.5">
                  {state.textLayers.slice(0, 8).map((l: any) => (
                    <Badge key={l.name} variant="secondary" className="text-xs">{l.name}</Badge>
                  ))}
                  {state.textLayers.length > 8 && (
                    <Badge variant="outline" className="text-xs">+{state.textLayers.length - 8} more</Badge>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Excel Upload */}
        <Card className={state.excelParsed ? 'border-green-200' : ''}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="w-5 h-5 text-green-600" />
              Product Data (Excel)
            </CardTitle>
            <CardDescription>Upload Excel with columns: name, image_url, SKU, etc.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <label
              htmlFor="excel-input"
              className={`block border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all
                ${state.excelLoading ? 'opacity-50' : 'hover:border-green-400 hover:bg-green-50/50'}
                ${state.excelParsed ? 'border-green-300 bg-green-50' : 'border-slate-300'}`}
            >
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleExcelChange}
                disabled={state.excelLoading}
                className="hidden"
                id="excel-input"
              />
              {state.excelParsed ? (
                <div className="flex flex-col items-center gap-2 text-green-700">
                  <CheckCircle className="w-8 h-8" />
                  <p className="font-medium">{state.excelFile?.name}</p>
                  <p className="text-xs text-green-600">{state.rowCount} products ready</p>
                </div>
              ) : (
                <>
                  <Upload className="w-8 h-8 mx-auto mb-2 text-slate-400" />
                  <p className="text-sm font-medium text-slate-700">
                    {state.excelFile ? state.excelFile.name : 'Click to upload Excel'}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">.xlsx or .xls file</p>
                </>
              )}
            </label>
            {state.excelLoading && (
              <div className="space-y-2">
                <p className="text-sm text-slate-500">Parsing Excel…</p>
                <Progress value={60} />
              </div>
            )}
            {state.excelError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{state.excelError}</AlertDescription>
              </Alert>
            )}
            {state.excelParsed && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-600">Columns detected:</p>
                <div className="flex flex-wrap gap-1.5">
                  {state.excelHeaders.map(h => (
                    <Badge
                      key={h}
                      variant="outline"
                      className={`text-xs ${
                        h.toLowerCase().includes('image') || h.toLowerCase().includes('sku')
                          ? 'border-green-400 text-green-700'
                          : ''
                      }`}
                    >
                      {h}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Configure & Create Batch */}
      {isReady && (
        <Card className="border-blue-200 bg-blue-50/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Configure Batch Job</CardTitle>
            <CardDescription>Select the diaper size to apply to all products in this batch</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="md:col-span-2 space-y-2">
                <Label>Diaper Size for All Products</Label>
                <Select
                  value={state.selectedSizeId}
                  onValueChange={v => setState(prev => ({ ...prev, selectedSizeId: v }))}
                >
                  <SelectTrigger className="bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DIAPER_SIZES.map(size => (
                      <SelectItem key={size.id} value={size.id}>
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-mono ${size.color}`}>
                            {size.weightRange}
                          </span>
                          <span className="font-medium">{size.label}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {selectedSizeInfo && (
                <div className="flex items-end">
                  <div className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${selectedSizeInfo.color}`}>
                    <span>{selectedSizeInfo.label}</span>
                    <span className="opacity-75">{selectedSizeInfo.weightRange}</span>
                  </div>
                </div>
              )}
            </div>
            <div className="pt-2">
              <Button onClick={handleStartBatch} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700">
                Create Batch Job
                <ChevronRight className="w-4 h-4" />
              </Button>
              <p className="text-xs text-slate-500 mt-2">
                Then go to the <strong>Batch</strong> tab to start processing {state.rowCount} products
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {!isReady && (
        <Card className="border-slate-200">
          <CardContent className="pt-5">
            <div className="flex items-center gap-4 text-sm text-slate-600">
              <div className={`flex items-center gap-2 ${state.psdParsed ? 'text-green-700' : 'text-slate-500'}`}>
                {state.psdParsed
                  ? <CheckCircle className="w-4 h-4" />
                  : <div className="w-4 h-4 rounded-full border-2 border-current" />}
                Upload PSD
              </div>
              <ChevronRight className="w-4 h-4 text-slate-300" />
              <div className={`flex items-center gap-2 ${state.excelParsed ? 'text-green-700' : 'text-slate-500'}`}>
                {state.excelParsed
                  ? <CheckCircle className="w-4 h-4" />
                  : <div className="w-4 h-4 rounded-full border-2 border-current" />}
                Upload Excel
              </div>
              <ChevronRight className="w-4 h-4 text-slate-300" />
              <div className="flex items-center gap-2 text-slate-400">
                <div className="w-4 h-4 rounded-full border-2 border-current" />
                Configure &amp; Create Job
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
