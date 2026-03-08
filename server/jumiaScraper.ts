/**
 * Jumia Product Scraper (adapted from testfinder2)
 * Fetches product details by URL or SKU from Jumia catalog pages
 */



const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
];

export const JUMIA_DOMAINS: Record<string, string> = {
  NG: 'https://www.jumia.com.ng',
  KE: 'https://www.jumia.co.ke',
  UG: 'https://www.jumia.ug',
  EG: 'https://www.jumia.com.eg',
  GH: 'https://www.jumia.com.gh',
  CI: 'https://www.jumia.ci',
  MA: 'https://www.jumia.ma',
  TN: 'https://www.jumia.com.tn',
  ZA: 'https://www.zando.co.za',
  SN: 'https://www.jumia.sn',
};

// Human-readable country labels matching all JUMIA_DOMAINS keys
export const COUNTRY_LABELS: Record<string, string> = {
  NG: 'Nigeria',
  KE: 'Kenya',
  UG: 'Uganda',
  EG: 'Egypt',
  GH: 'Ghana',
  CI: 'Côte d\'Ivoire',
  MA: 'Morocco',
  TN: 'Tunisia',
  ZA: 'South Africa (Zando)',
  SN: 'Senegal',
};

export interface JumiaProduct {
  sku: string;
  name: string;
  brand: string;
  category: string;
  price: number;
  oldPrice?: number;
  discount?: string;
  rating?: number;
  totalRatings?: number;
  image: string;
  url: string;
  seller?: string;
  isJumiaExpress: boolean;
  isShopGlobal: boolean;
  stock?: string;
  tags?: string[];
  country: string;
}

function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchPage(url: string, timeout = 30000): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': getRandomUserAgent(),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Cache-Control': 'max-age=0',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      if (response.status === 403 || response.status === 429) {
        console.warn(`[Jumia Scraper] Rate limited (${response.status}) for ${url}`);
        return null;
      }
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.text();
  } catch (error) {
    console.error(`[Jumia Scraper] Error fetching ${url}:`, error);
    return null;
  }
}

async function extractProductsFromHTML(html: string, country: string): Promise<JumiaProduct[]> {
  try {
    const storeMatch = html.match(/window\.__STORE__\s*=\s*({[\s\S]*?});\s*<\/script>/);

    if (!storeMatch) {
      console.warn('[Jumia Scraper] Could not find window.__STORE__ in HTML');
      return [];
    }

    const storeData = JSON.parse(storeMatch[1]);
    const products: JumiaProduct[] = [];

    if (storeData.products && Array.isArray(storeData.products)) {
      for (const product of storeData.products) {
        const extracted = extractProductData(product, country, storeData);
        if (extracted) {
          products.push(extracted);
        }
      }
    }

    return products;
  } catch (error) {
    console.error('[Jumia Scraper] Error parsing HTML:', error);
    return [];
  }
}

function extractProductData(product: any, country: string, storeData?: any): JumiaProduct | null {
  try {
    if (!product.sku || !product.displayName) {
      return null;
    }

    const domain = JUMIA_DOMAINS[country] || JUMIA_DOMAINS.NG;

    let seller: string | null = null;

    if (product.sellerEntity?.name && !['العربية', 'Appliances', 'Sign In'].includes(product.sellerEntity.name)) {
      seller = product.sellerEntity.name;
    } else if (product.sellerName && !['العربية', 'Appliances', 'Sign In'].includes(product.sellerName)) {
      seller = product.sellerName;
    } else if (product.seller && !['العربية', 'Appliances', 'Sign In'].includes(product.seller)) {
      seller = product.seller;
    }

    if ((!seller || ['Jumia', 'العربية'].includes(seller)) && storeData?.googleAds?.targeting?.seller?.[0]) {
      const adsSeller = storeData.googleAds.targeting.seller[0];
      if (adsSeller && !['العربية', 'Appliances', 'Sign In'].includes(adsSeller)) {
        seller = adsSeller;
      }
    }

    if (!seller) seller = 'Jumia';

    return {
      sku: product.sku,
      name: product.displayName || '',
      brand: product.brand || 'Unknown',
      category: product.categories?.join(' > ') || '',
      price: product.prices?.rawPrice || (product.prices?.price ? parseFloat(product.prices.price.toString().replace(/[^0-9.]/g, '')) : 0),
      oldPrice: product.prices?.rawOldPrice || undefined,
      discount: product.prices?.discount || undefined,
      rating: product.rating?.average || 0,
      totalRatings: product.rating?.totalRatings || 0,
      image: product.image || '',
      url: product.url ? `${domain}${product.url}` : '',
      seller: seller,
      isJumiaExpress: !!(product.isJumiaExpress || product.isShopExpress),
      isShopGlobal: !!product.isShopGlobal,
      stock: product.stockInfo?.text || 'In Stock',
      tags: product.tags ? product.tags.split('|') : [],
      country,
    };
  } catch (error) {
    return null;
  }
}

export async function fetchJumiaByUrl(
  url: string,
  options: { country?: string; delay?: number } = {}
): Promise<{ products: JumiaProduct[]; hasMore: boolean }> {
  const delayMs = options.delay ?? Math.random() * 1500 + 500;
  await delay(delayMs);

  let country = options.country || 'NG';
  for (const [code, domain] of Object.entries(JUMIA_DOMAINS)) {
    if (url.startsWith(domain)) {
      country = code;
      break;
    }
  }

  const html = await fetchPage(url);
  if (!html) return { products: [], hasMore: false };

  const products = await extractProductsFromHTML(html, country);
  const hasMore = html.includes('aria-label="next page"') && products.length > 0;

  return { products, hasMore };
}

export async function fetchJumiaPage(
  query: string,
  page = 1,
  options: { country?: string } = {}
): Promise<{ products: JumiaProduct[]; hasMore: boolean }> {
  const country = options.country || 'NG';
  const domain = JUMIA_DOMAINS[country] || JUMIA_DOMAINS.NG;
  const url = `${domain}/catalog/?q=${encodeURIComponent(query)}&page=${page}`;
  return fetchJumiaByUrl(url, options);
}

export async function fetchProductsBySkuList(
  skus: string[],
  options: { country?: string } = {}
): Promise<JumiaProduct[]> {
  const country = options.country || 'NG';
  const domain = JUMIA_DOMAINS[country] || JUMIA_DOMAINS.NG;
  const products: JumiaProduct[] = [];

  for (const sku of skus) {
    try {
      const searchUrl = `${domain}/catalog/?q=${encodeURIComponent(sku)}`;
      const { products: found } = await fetchJumiaByUrl(searchUrl, { country, delay: 800 });

      if (found.length > 0) {
        const exactMatch = found.find(p => p.sku === sku);
        products.push(exactMatch || found[0]);
      }
    } catch (error) {
      console.error(`[Jumia Scraper] Error fetching SKU ${sku}:`, error);
    }
  }

  return products;
}

export function filterProducts(products: JumiaProduct[], filters: any): JumiaProduct[] {
  return products.filter(product => {
    if (filters.brands?.length && !filters.brands.includes(product.brand)) return false;
    if (filters.sellers?.length && !filters.sellers.includes(product.seller)) return false;
    if (filters.minPrice !== undefined && product.price < filters.minPrice) return false;
    if (filters.maxPrice !== undefined && product.price > filters.maxPrice) return false;
    if (filters.minRating !== undefined && (product.rating || 0) < filters.minRating) return false;
    if (filters.jumiaExpress !== undefined && product.isJumiaExpress !== filters.jumiaExpress) return false;
    return true;
  });
}

export function getFilterOptions(products: JumiaProduct[]) {
  const brands = Array.from(new Set(products.map(p => p.brand))).filter(Boolean).sort();
  const sellers = Array.from(new Set(products.map(p => p.seller))).filter(Boolean).sort();
  const prices = products.map(p => p.price);
  return {
    brands,
    sellers,
    priceRange: {
      min: Math.floor(Math.min(...(prices.length ? prices : [0]))),
      max: Math.ceil(Math.max(...(prices.length ? prices : [0]))),
    },
  };
}
