import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2, Tag, Upload, ImageIcon, Download, RefreshCw } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';

const DIAPER_SIZES = [
  { id: 'micro',   label: 'Micro',    weightRange: '>2.5 kg',  description: '>2.5 kg – for premature babies' },
  { id: 'newborn', label: 'New Born', weightRange: '2-5 kg',   description: '2-5 kg – Newborn size' },
  { id: 'mini',    label: 'Mini',     weightRange: '3-6 kg',   description: '3-6 kg – Mini size' },
  { id: 'midi',    label: 'Midi',     weightRange: '4-9 kg',   description: '4-9 kg – Midi size' },
  { id: 'maxi',    label: 'Maxi',     weightRange: '7-15 kg',  description: '7-15 kg – Maxi size' },
  { id: 'xlarge',  label: 'XLarge',   weightRange: '>15 kg',   description: '>15 kg – XLarge size' },
  { id: 'junior',  label: 'Junior',   weightRange: '11-25 kg', description: '11-25 kg – Junior size' },
];

const STICKER_FIELDS = [
  { key: 'productName',  label: 'Product Name',      placeholder: 'e.g. Pampers Premium',    hint: 'Main product name shown on sticker' },
  { key: 'brand',        label: 'Brand',             placeholder: 'e.g. Pampers',            hint: 'Brand name' },
  { key: 'count',        label: 'Count / Quantity',  placeholder: 'e.g. 144',                hint: 'Number of diapers in pack' },
  { key: 'priceText',    label: 'Price Text',        placeholder: 'e.g. ₦12,500',           hint: 'Price to display' },
  { key: 'promoText',    label: 'Promo / Tag Text',  placeholder: 'e.g. Free Gift Inside',  hint: 'Optional promotional label' },
  { key: 'sellerName',   label: 'Seller Name',       placeholder: 'e.g. Pampers Official',  hint: 'Seller / store name' },
];

export default function SingleProductEditor() {
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [selectedSizeId, setSelectedSizeId] = useState('midi');
  const [productImageUrl, setProductImageUrl] = useState('');
  const [customText, setCustomText] = useState<Record<string, string>>({});
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const templatesQuery = trpc.template.list.useQuery();
  const generateMutation = trpc.sticker.generate.useMutation();

  const templates = templatesQuery.data || [];
  const selectedSize = DIAPER_SIZES.find(s => s.id === selectedSizeId);

  const handleGenerate = async () => {
    if (!selectedTemplateId) {
      toast.error('Please select a PSD template first (upload one in the Upload tab)');
      return;
    }
    setIsGenerating(true);
    try {
      const result = await generateMutation.mutateAsync({
        templateId: selectedTemplateId,
        sizeId: selectedSizeId,
        productImageUrl: productImageUrl || undefined,
        customText,
      });
      if (result.imageUrl) {
        setGeneratedImageUrl(result.imageUrl);
        toast.success('Sticker generated!');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Generation failed');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = () => {
    if (generatedImageUrl) {
      const a = document.createElement('a');
      a.href = generatedImageUrl;
      a.download = `sticker-${selectedSizeId}-${Date.now()}.jpg`;
      a.click();
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left: Editor */}
      <div className="space-y-5">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Tag className="w-5 h-5 text-blue-600" />
              Single Product Sticker
            </CardTitle>
            <CardDescription>Configure sticker options for one product</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Template selection */}
            <div className="space-y-2">
              <Label>PSD Template</Label>
              {templates.length === 0 ? (
                <Alert>
                  <Upload className="h-4 w-4" />
                  <AlertDescription>Upload a PSD template in the <strong>Upload</strong> tab first.</AlertDescription>
                </Alert>
              ) : (
                <Select onValueChange={v => setSelectedTemplateId(Number(v))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select template…" />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map(t => (
                      <SelectItem key={t.id} value={String(t.id)}>
                        {t.name} ({t.width}×{t.height})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Diaper size dropdown */}
            <div className="space-y-2">
              <Label>Diaper Size</Label>
              <Select value={selectedSizeId} onValueChange={setSelectedSizeId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DIAPER_SIZES.map(size => (
                    <SelectItem key={size.id} value={size.id}>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="font-mono text-xs">{size.weightRange}</Badge>
                        <span className="font-medium">{size.label}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedSize && (
                <p className="text-xs text-slate-500">{selectedSize.description}</p>
              )}
            </div>

            {/* Product image URL */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-slate-400" />
                Product Image URL
              </Label>
              <Input
                placeholder="https://product-image-url.jpg"
                value={productImageUrl}
                onChange={e => setProductImageUrl(e.target.value)}
              />
              <p className="text-xs text-slate-500">Paste the URL of the product image to overlay on the sticker</p>
            </div>

            {/* Custom text fields */}
            <div className="space-y-3">
              <Label className="text-sm font-semibold">Sticker Text Fields</Label>
              {STICKER_FIELDS.map(field => (
                <div key={field.key} className="space-y-1">
                  <Label className="text-xs text-slate-600">{field.label}</Label>
                  <Input
                    placeholder={field.placeholder}
                    value={customText[field.key] || ''}
                    onChange={e => setCustomText(prev => ({ ...prev, [field.key]: e.target.value }))}
                  />
                  <p className="text-xs text-slate-400">{field.hint}</p>
                </div>
              ))}
            </div>

            <Button onClick={handleGenerate} disabled={isGenerating || !selectedTemplateId} className="w-full">
              {isGenerating ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating…</> : <><Tag className="w-4 h-4 mr-2" /> Generate Sticker</>}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Right: Preview */}
      <div className="space-y-4">
        <Card className="h-fit">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Preview</CardTitle>
            <CardDescription>Generated sticker will appear here</CardDescription>
          </CardHeader>
          <CardContent>
            {generatedImageUrl ? (
              <div className="space-y-4">
                <div className="rounded-lg overflow-hidden border border-slate-200 shadow-sm">
                  <img src={generatedImageUrl} alt="Generated sticker" className="w-full object-contain" />
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleDownload} className="flex-1 bg-green-600 hover:bg-green-700">
                    <Download className="w-4 h-4 mr-2" /> Download JPG
                  </Button>
                  <Button onClick={() => setGeneratedImageUrl(null)} variant="outline">
                    <RefreshCw className="w-4 h-4" />
                  </Button>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <Badge variant="outline">{selectedSize?.label}</Badge>
                  <span>{selectedSize?.weightRange}</span>
                </div>
              </div>
            ) : (
              <div className="aspect-square rounded-lg border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-400 bg-slate-50">
                <Tag className="w-12 h-12 mb-3 opacity-30" />
                <p className="text-sm font-medium">No preview yet</p>
                <p className="text-xs mt-1">Configure options and click Generate</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Size reference card */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Size Reference</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              {DIAPER_SIZES.map(size => (
                <button
                  key={size.id}
                  onClick={() => setSelectedSizeId(size.id)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs flex items-center justify-between transition-colors ${
                    selectedSizeId === size.id
                      ? 'bg-blue-50 border border-blue-200 text-blue-900'
                      : 'hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <span className="font-semibold">{size.label}</span>
                  <span className="text-slate-500">{size.weightRange}</span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
