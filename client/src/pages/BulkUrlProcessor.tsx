import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Loader2, Globe, Search, Download, CheckCircle, XCircle, Upload } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';

const DIAPER_SIZES = [
  { id: 'micro',   label: 'Micro',    weightRange: '>2.5 kg' },
  { id: 'newborn', label: 'New Born', weightRange: '2-5 kg' },
  { id: 'mini',    label: 'Mini',     weightRange: '3-6 kg' },
  { id: 'midi',    label: 'Midi',     weightRange: '4-9 kg' },
  { id: 'maxi',    label: 'Maxi',     weightRange: '7-15 kg' },
  { id: 'xlarge',  label: 'XLarge',   weightRange: '>15 kg' },
  { id: 'junior',  label: 'Junior',   weightRange: '11-25 kg' },
];

interface Product {
  sku: string;
  name: string;
  image: string;
  price?: number;
  brand?: string;
  selected: boolean;
  generatedUrl?: string;
  error?: string;
  status?: 'idle' | 'processing' | 'done' | 'error';
}

export default function BulkUrlProcessor() {
  const [url, setUrl] = useState('');
  const [country, setCountry] = useState('NG');
  const [selectedSizeId, setSelectedSizeId] = useState('midi');
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [isFetching, setIsFetching] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);

  // ── Load countries from server (all 10: NG, KE, UG, EG, GH, CI, MA, TN, ZA, SN)
  const countriesQuery = trpc.jumia.getAvailableCountries.useQuery();
  const countries = countriesQuery.data ?? [];

  const templatesQuery = trpc.template.list.useQuery();
  const templates = templatesQuery.data || [];

  const generateBulkMutation = trpc.bulkUrl.generateBulk.useMutation();

  // Use tRPC utils for proper imperative queries
  const utils = trpc.useUtils();

  const handleFetch = async () => {
    if (!url) { toast.error('Enter a Jumia catalog URL'); return; }
    setIsFetching(true);
    setProducts([]);
    try {
      // searchByUrl auto-detects country from the URL domain;
      // we also pass country explicitly so keyword searches (via URL) use the right domain
      const data = await utils.jumia.searchByUrl.fetch({ url });
      if (data?.products?.length) {
        setProducts(data.products.map((p: any) => ({
          sku: p.sku,
          name: p.name,
          image: p.image,
          price: p.price,
          brand: p.brand,
          selected: true,
          status: 'idle' as const,
        })));
        toast.success(`Found ${data.products.length} products`);
      } else {
        toast.info(
          data?.error ||
          'No products found. Make sure the URL is a valid Jumia catalog page (e.g. .../catalog/?q=diapers)'
        );
      }
    } catch (err) {
      toast.error('Failed to fetch products from this URL');
    } finally {
      setIsFetching(false);
    }
  };

  const selectedProducts = products.filter(p => p.selected);

  const handleToggleAll = (checked: boolean) => {
    setProducts(prev => prev.map(p => ({ ...p, selected: checked })));
  };

  const handleToggle = (sku: string, checked: boolean) => {
    setProducts(prev => prev.map(p => p.sku === sku ? { ...p, selected: checked } : p));
  };

  const handleGenerate = async () => {
    if (!selectedTemplateId) { toast.error('Select a PSD template'); return; }
    if (selectedProducts.length === 0) { toast.error('Select at least one product'); return; }

    setIsGenerating(true);
    setGenerationProgress(0);

    try {
      const result = await generateBulkMutation.mutateAsync({
        templateId: selectedTemplateId,
        sizeId: selectedSizeId,
        products: selectedProducts.map(p => ({
          sku: p.sku,
          name: p.name,
          image: p.image,
          price: p.price,
        })),
      });

      const resultMap = new Map(result.results.map(r => [r.sku, r]));
      setProducts(prev => prev.map(p => {
        const res = resultMap.get(p.sku);
        if (!res) return p;
        return { ...p, generatedUrl: res.imageUrl, error: res.error, status: res.imageUrl ? 'done' : 'error' };
      }));

      const done = result.results.filter(r => r.imageUrl).length;
      const failed = result.results.filter(r => r.error).length;
      toast.success(`Generated ${done} stickers${failed ? `, ${failed} failed` : ''}`);
      setGenerationProgress(100);
    } catch (err) {
      toast.error('Bulk generation failed');
    } finally {
      setIsGenerating(false);
    }
  };

  const doneCount = products.filter(p => p.status === 'done').length;
  const errorCount = products.filter(p => p.status === 'error').length;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="w-5 h-5 text-blue-600" />
            URL Bulk Processor
          </CardTitle>
          <CardDescription>
            Paste any Jumia catalog URL to fetch all products, then generate stickers in bulk
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2 space-y-2">
              <Label>Jumia Catalog URL</Label>
              <Input
                placeholder="https://www.jumia.com.ng/catalog/?q=pampers+diapers"
                value={url}
                onChange={e => setUrl(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleFetch()}
              />
              <p className="text-xs text-slate-500">
                Supports all Jumia markets: .com.ng, .co.ke, .ug, .com.eg, .com.gh, .ci, .ma, .com.tn, .sn, and zando.co.za
              </p>
            </div>
            <div className="space-y-2">
              <Label>Country (for context)</Label>
              <Select value={country} onValueChange={setCountry}>
                <SelectTrigger>
                  <SelectValue placeholder={countriesQuery.isLoading ? 'Loading…' : 'Select country'} />
                </SelectTrigger>
                <SelectContent>
                  {countries.map(c => (
                    <SelectItem key={c.code} value={c.code}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-400">Auto-detected from URL domain</p>
            </div>
          </div>
          <Button onClick={handleFetch} disabled={isFetching} className="w-full md:w-auto">
            {isFetching
              ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Fetching…</>
              : <><Search className="w-4 h-4 mr-2" />Fetch Products</>}
          </Button>
        </CardContent>
      </Card>

      {products.length > 0 && (
        <>
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Products Found ({products.length})</CardTitle>
                  <CardDescription>{selectedProducts.length} selected for sticker generation</CardDescription>
                </div>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={selectedProducts.length === products.length}
                    onCheckedChange={(v) => handleToggleAll(!!v)}
                  />
                  Select All
                </label>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-80 overflow-y-auto pr-2">
                {products.map(product => (
                  <div
                    key={product.sku}
                    className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                      product.selected ? 'border-blue-200 bg-blue-50' : 'border-slate-200'
                    }`}
                  >
                    <Checkbox
                      checked={product.selected}
                      onCheckedChange={(v) => handleToggle(product.sku, !!v)}
                    />
                    {product.image ? (
                      <img
                        src={product.image}
                        alt={product.name}
                        className="w-12 h-12 object-contain rounded bg-white border"
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    ) : (
                      <div className="w-12 h-12 rounded bg-slate-100 flex items-center justify-center">
                        <Globe className="w-5 h-5 text-slate-300" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">{product.name}</p>
                      <p className="text-xs text-slate-500">
                        SKU: {product.sku}{product.price ? ` • ${product.price.toLocaleString()}` : ''}
                      </p>
                    </div>
                    {product.status === 'done' && (
                      <div className="flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-green-500" />
                        <a href={product.generatedUrl} target="_blank" rel="noreferrer">
                          <Button size="sm" variant="outline" className="h-7 text-xs">
                            <Download className="w-3 h-3 mr-1" />Get
                          </Button>
                        </a>
                      </div>
                    )}
                    {product.status === 'error' && (
                      <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" title={product.error} />
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Generate Stickers</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>PSD Template</Label>
                  {templates.length === 0 ? (
                    <Alert>
                      <Upload className="h-4 w-4" />
                      <AlertDescription>Upload a template in the Upload tab.</AlertDescription>
                    </Alert>
                  ) : (
                    <Select onValueChange={v => setSelectedTemplateId(Number(v))}>
                      <SelectTrigger><SelectValue placeholder="Select template…" /></SelectTrigger>
                      <SelectContent>
                        {templates.map(t => (
                          <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Diaper Size</Label>
                  <Select value={selectedSizeId} onValueChange={setSelectedSizeId}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DIAPER_SIZES.map(s => (
                        <SelectItem key={s.id} value={s.id}>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="font-mono text-xs">{s.weightRange}</Badge>
                            <span>{s.label}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {isGenerating && <Progress value={generationProgress} className="h-2" />}

              {(doneCount > 0 || errorCount > 0) && (
                <div className="flex gap-3">
                  <Badge className="bg-green-100 text-green-800 border-green-200">
                    {doneCount} stickers generated
                  </Badge>
                  {errorCount > 0 && (
                    <Badge className="bg-red-100 text-red-800 border-red-200">{errorCount} failed</Badge>
                  )}
                </div>
              )}

              <Button
                onClick={handleGenerate}
                disabled={isGenerating || !selectedTemplateId || selectedProducts.length === 0}
                className="w-full"
              >
                {isGenerating
                  ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Generating {selectedProducts.length} stickers…</>
                  : <><Globe className="w-4 h-4 mr-2" />Generate Stickers for {selectedProducts.length} Products</>}
              </Button>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
