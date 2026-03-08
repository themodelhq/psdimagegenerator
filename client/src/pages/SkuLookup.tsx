import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2, Search, Star, ExternalLink, Tag, ShoppingCart, Zap } from 'lucide-react';
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

interface FoundProduct {
  sku: string;
  name: string;
  brand: string;
  price: number;
  oldPrice?: number;
  image: string;
  url: string;
  rating?: number;
  totalRatings?: number;
  seller?: string;
  isJumiaExpress: boolean;
  tags?: string[];
  country: string;
  generatedStickerUrl?: string;
}

export default function SkuLookup() {
  const [skuInput, setSkuInput] = useState('');
  const [country, setCountry] = useState('NG');
  const [selectedSizeId, setSelectedSizeId] = useState('midi');
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [products, setProducts] = useState<FoundProduct[]>([]);
  const [isLooking, setIsLooking] = useState(false);
  const [generatingFor, setGeneratingFor] = useState<string | null>(null);

  // ── Load countries from server (includes all 10: NG, KE, UG, EG, GH, CI, MA, TN, ZA, SN)
  const countriesQuery = trpc.jumia.getAvailableCountries.useQuery();
  const countries = countriesQuery.data ?? [];

  const templatesQuery = trpc.template.list.useQuery();
  const generateMutation = trpc.sticker.generate.useMutation();
  const templates = templatesQuery.data || [];

  // Use tRPC utils for proper imperative queries
  const utils = trpc.useUtils();

  const handleLookup = async () => {
    const skus = skuInput.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
    if (skus.length === 0) { toast.error('Enter at least one SKU'); return; }

    setIsLooking(true);
    setProducts([]);

    try {
      const data = await utils.jumia.searchBySkuList.fetch({ skus, country });
      if (data?.products?.length) {
        setProducts(data.products.map((p: any) => ({
          sku: p.sku, name: p.name, brand: p.brand, price: p.price,
          oldPrice: p.oldPrice, image: p.image, url: p.url,
          rating: p.rating, totalRatings: p.totalRatings, seller: p.seller,
          isJumiaExpress: p.isJumiaExpress, tags: p.tags, country: p.country,
        })));
        toast.success(`Found ${data.products.length} of ${skus.length} SKUs`);
      } else {
        toast.info(data?.error || 'No products found for these SKUs');
      }
    } catch (err) {
      toast.error('Lookup failed — check the SKUs or try a different country');
    } finally {
      setIsLooking(false);
    }
  };

  const handleGenerateSticker = async (product: FoundProduct) => {
    if (!selectedTemplateId) { toast.error('Select a PSD template first'); return; }
    setGeneratingFor(product.sku);
    try {
      const result = await generateMutation.mutateAsync({
        templateId: selectedTemplateId,
        sizeId: selectedSizeId,
        productImageUrl: product.image || undefined,
        customText: {
          productName: product.name,
          brand: product.brand,
          priceText: `${product.price?.toLocaleString() || ''}`,
        },
      });
      if (result.imageUrl) {
        setProducts(prev => prev.map(p =>
          p.sku === product.sku ? { ...p, generatedStickerUrl: result.imageUrl } : p
        ));
        toast.success(`Sticker generated for ${product.name}`);
      }
    } catch (err) {
      toast.error('Failed to generate sticker');
    } finally {
      setGeneratingFor(null);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="w-5 h-5 text-blue-600" />
            SKU Lookup
          </CardTitle>
          <CardDescription>
            Enter Jumia SKUs (one per line or comma-separated) to fetch product details and generate stickers
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2 space-y-2">
              <Label>SKUs (one per line or comma-separated)</Label>
              <Textarea
                placeholder={"PD534AB\nPA389CD\nOR123EF"}
                value={skuInput}
                onChange={e => setSkuInput(e.target.value)}
                rows={4}
                className="font-mono text-sm"
              />
            </div>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Jumia Country</Label>
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
              </div>

              <div className="space-y-2">
                <Label>Diaper Size (for sticker)</Label>
                <Select value={selectedSizeId} onValueChange={setSelectedSizeId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DIAPER_SIZES.map(s => (
                      <SelectItem key={s.id} value={s.id}>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs font-mono">{s.weightRange}</Badge>
                          <span>{s.label}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>PSD Template</Label>
                {templates.length === 0 ? (
                  <p className="text-xs text-slate-500">Upload a template first in the Upload tab</p>
                ) : (
                  <Select onValueChange={v => setSelectedTemplateId(Number(v))}>
                    <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                    <SelectContent>
                      {templates.map(t => (
                        <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>
          </div>

          <Button onClick={handleLookup} disabled={isLooking}>
            {isLooking
              ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Looking up…</>
              : <><Search className="w-4 h-4 mr-2" />Lookup SKUs</>}
          </Button>
        </CardContent>
      </Card>

      {products.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {products.map(product => (
            <Card key={product.sku} className="overflow-hidden">
              <div className="aspect-square bg-white border-b flex items-center justify-center p-4 relative">
                {product.generatedStickerUrl ? (
                  <img src={product.generatedStickerUrl} alt="Generated sticker" className="w-full h-full object-contain" />
                ) : product.image ? (
                  <img
                    src={product.image}
                    alt={product.name}
                    className="w-full h-full object-contain"
                    onError={e => { (e.target as HTMLImageElement).style.opacity = '0'; }}
                  />
                ) : (
                  <ShoppingCart className="w-12 h-12 text-slate-200" />
                )}
                {product.isJumiaExpress && (
                  <Badge className="absolute top-2 right-2 bg-orange-500 text-white text-xs">
                    <Zap className="w-3 h-3 mr-1" />Express
                  </Badge>
                )}
              </div>
              <CardContent className="p-3 space-y-2">
                <div>
                  <p className="font-semibold text-sm text-slate-900 line-clamp-2">{product.name}</p>
                  <p className="text-xs text-slate-500">{product.brand} • SKU: {product.sku}</p>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-bold text-slate-900">{product.price?.toLocaleString()}</p>
                    {product.oldPrice && (
                      <p className="text-xs text-slate-400 line-through">{product.oldPrice.toLocaleString()}</p>
                    )}
                  </div>
                  {product.rating ? (
                    <div className="flex items-center gap-1 text-xs text-amber-600">
                      <Star className="w-3 h-3 fill-current" />
                      <span>{product.rating.toFixed(1)}</span>
                      <span className="text-slate-400">({product.totalRatings})</span>
                    </div>
                  ) : null}
                </div>
                {product.seller && <p className="text-xs text-slate-500">Seller: {product.seller}</p>}
                {product.tags && product.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {product.tags.slice(0, 3).map(tag => (
                      <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
                    ))}
                  </div>
                )}
                <div className="flex gap-2 pt-1">
                  <Button
                    size="sm"
                    onClick={() => handleGenerateSticker(product)}
                    disabled={generatingFor === product.sku || !selectedTemplateId}
                    className="flex-1 text-xs"
                  >
                    {generatingFor === product.sku
                      ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" />Generating…</>
                      : <><Tag className="w-3 h-3 mr-1" />{product.generatedStickerUrl ? 'Regenerate' : 'Make Sticker'}</>}
                  </Button>
                  <a href={product.url} target="_blank" rel="noreferrer">
                    <Button size="sm" variant="outline" className="text-xs px-2">
                      <ExternalLink className="w-3 h-3" />
                    </Button>
                  </a>
                </div>
                {product.generatedStickerUrl && (
                  <a
                    href={product.generatedStickerUrl}
                    download={`sticker-${product.sku}.jpg`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Button size="sm" variant="outline" className="w-full text-xs text-green-700 border-green-300">
                      Download Sticker
                    </Button>
                  </a>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
