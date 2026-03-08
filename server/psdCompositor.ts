/**
 * PSD Image Compositor — v3 (new blank PSD)
 *
 * Layer structure per size group (from `identify -verbose Diapers.psd`):
 *   bg         – Sticker background shape (coloured rounded rect, extends above canvas)
 *   ph         – Placeholder frame (the sticker "frame" graphic: transparent top = product zone,
 *                opaque bottom = info bar shape)
 *   line       – Vertical divider between size-digit and weight text
 *   digit      – Size number graphic (0-6)
 *   countBadgeBg / countBadge – Count pill badge
 *   circle1/2  – x-packs circle badge (only shown when packs > 1)
 *   xsym       – "x" symbol in circle badge
 *
 * Compositing order (back → front):
 *   1. White 680×680 canvas
 *   2. Product image  – "cover" fit into 680 × productZoneH, anchored top-left (0,0)
 *   3. Sticker bg layer
 *   4. Placeholder frame layer  (transparent top lets product image show through)
 *   5. Decorative layers (line, digit, count badge)
 *   6. x-packs badge (only if packs > 1)
 *   7. Text overlays (weight/size text + count number)
 */

import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

// ─── Font resolution ─────────────────────────────────────────────────────────
// Comic Sans MS Bold is the font used in the PSD.
// On Render (Ubuntu) it is installed by: apt-get install -y fonts-comic-neue
// which provides Comic Neue Bold — the open-source Comic Sans equivalent.
function resolveComicFont(): string {
  const candidates = [
    // Real Comic Sans (from ttf-mscorefonts-installer)
    '/usr/share/fonts/truetype/msttcorefonts/Comic_Sans_MS_Bold.ttf',
    '/usr/share/fonts/truetype/msttcorefonts/comicbd.ttf',
    // Comic Neue Bold (fonts-comic-neue package)
    '/usr/share/fonts/truetype/comic-neue/ComicNeue-Bold.ttf',
    '/usr/share/fonts/opentype/comic-neue/ComicNeue-Bold.otf',
    // Bundled inside project
    path.join(__dirname, '..', 'fonts', 'ComicNeue-Bold.ttf'),
    path.join(__dirname, 'fonts', 'ComicNeue-Bold.ttf'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return 'Comic-Sans-MS-Bold'; // fallback ImageMagick font name
}
const COMIC_FONT = resolveComicFont();

// ─── Public types ────────────────────────────────────────────────────────────

export interface DiaperSize {
  id: string;
  label: string;
  weightRange: string;
  description: string;
}

export const DIAPER_SIZES: DiaperSize[] = [
  { id: 'micro',   label: 'Micro',    weightRange: '>2.5 kg',  description: '>2.5 kg Micro'   },
  { id: 'newborn', label: 'New Born', weightRange: '2-5 kg',   description: '2-5 kg New Born' },
  { id: 'mini',    label: 'Mini',     weightRange: '3-6 kg',   description: '3-6 kg Mini'     },
  { id: 'midi',    label: 'Midi',     weightRange: '4-9 kg',   description: '4-9 kg Midi'     },
  { id: 'maxi',    label: 'Maxi',     weightRange: '7-15 kg',  description: '7-15 kg Maxi'    },
  { id: 'xlarge',  label: 'XLarge',   weightRange: '>15 kg',   description: '>15 kg XLarge'   },
  { id: 'junior',  label: 'Junior',   weightRange: '11-25 kg', description: '11-25 kg Junior' },
];

export interface CompositeOptions {
  psdPath: string;
  productImageUrl?: string;
  productImageBuffer?: Buffer;
  sizeId: string;
  count?: number;        // diaper count per pack (e.g. 58)
  packs?: number;        // number of packs (1 = hide x2 badge, >1 = show it)
  weightLabel?: string;  // override label e.g. "16+ KG\nExtra Large" (from Excel sheet)
  outputWidth?: number;
  outputHeight?: number;
  quality?: number;
}

export interface CompositeResult {
  success: boolean;
  outputPath?: string;
  outputBuffer?: Buffer;
  error?: string;
}

// ─── Per-size PSD layer config ───────────────────────────────────────────────

interface LayerFrame {
  /** ImageMagick PSD frame index (1-based: IM[0]=merged composite, IM[1]=first layer …) */
  im: number;
  x: number;  // canvas x-offset
  y: number;  // canvas y-offset
}

interface SizeConfig {
  sizeId: string;
  /** Two-line weight+type label drawn over the sticker (e.g. "3-6 kg\nMini") */
  weightLabel: string;
  /** Default count when not provided in row data */
  defaultCount: number;

  bg:          LayerFrame;
  ph:          LayerFrame;   // placeholder / sticker frame
  line:        LayerFrame;
  digit:       LayerFrame;
  countBadgeBg: LayerFrame;
  countBadge:   LayerFrame;
  circle1:     LayerFrame;
  circle2:     LayerFrame;
  xsym:        LayerFrame;

  /** Height (px) of the product image zone – the transparent top of the ph layer */
  productZoneH: number;

  /** Text positions (canvas NW origin) */
  text: {
    weight: { x: number; y: number };   // top-left for first line of weight label
    count:  { x: number; y: number; centerW: number };  // centre-x of count badge
  };
}

// All values derived from:  identify -verbose Diapers.psd  (page geometry)
// IM frame index = identify_row_index + 1  (because IM[0] = the merged composite)
const SIZE_CONFIGS: Record<string, SizeConfig> = {
  micro: {
    sizeId: 'micro', weightLabel: '>2.5 kg\nMicro', defaultCount: 144,
    bg:          { im:  2, x:  -2, y: -169 },
    ph:          { im:  7, x:  57, y:  407 },   // Layer 42, 553×275
    line:        { im:  8, x: 345, y:  487 },
    digit:       { im: 10, x: 128, y:  520 },
    countBadgeBg:{ im: 11, x: 392, y:  517 },
    countBadge:  { im: 12, x: 399, y:  521 },
    circle1:     { im:  3, x: 448, y:  318 },
    circle2:     { im:  5, x: 448, y:  318 },
    xsym:        { im:  6, x: 501, y:  406 },
    productZoneH: 491,
    text: {
      weight: { x: 237, y: 543 },
      count: { x: 415, y: 549, centerW: 92 },
    },
  },
  newborn: {
    sizeId: 'newborn', weightLabel: '2-5 kg\nNew Born', defaultCount: 144,
    bg:          { im: 14, x:  -4, y: -177 },
    ph:          { im: 19, x:  63, y:  408 },   // Layer 36, 548×274
    line:        { im: 20, x: 348, y:  489 },
    digit:       { im: 22, x: 147, y:  522 },
    countBadgeBg:{ im: 23, x: 394, y:  518 },
    countBadge:  { im: 24, x: 400, y:  522 },
    circle1:     { im: 15, x: 453, y:  317 },
    circle2:     { im: 17, x: 453, y:  317 },
    xsym:        { im: 18, x: 507, y:  405 },
    productZoneH: 492,
    text: {
      weight: { x: 233, y: 543 },
      count: { x: 417, y: 549, centerW: 91 },
    },
  },
  mini: {
    sizeId: 'mini', weightLabel: '3-6 kg\nMini', defaultCount: 144,
    bg:          { im: 26, x:   7, y: -164 },
    ph:          { im: 31, x:  72, y:  410 },   // Layer 30, 542×270
    line:        { im: 32, x: 354, y:  489 },
    digit:       { im: 34, x: 148, y:  523 },
    countBadgeBg:{ im: 35, x: 400, y:  519 },
    countBadge:  { im: 36, x: 408, y:  523 },
    circle1:     { im: 27, x: 446, y:  324 },
    circle2:     { im: 29, x: 446, y:  324 },
    xsym:        { im: 30, x: 498, y:  409 },
    productZoneH: 493,
    text: {
      weight: { x: 262, y: 543 },
      count: { x: 424, y: 548, centerW: 89 },
    },
  },
  midi: {
    sizeId: 'midi', weightLabel: '4-9 kg\nMidi', defaultCount: 38,
    bg:          { im: 38, x:  18, y: -163 },
    ph:          { im: 48, x:  65, y:  409 },   // Layer 24, 544×272
    line:        { im: 49, x: 348, y:  489 },
    digit:       { im: 51, x: 142, y:  524 },
    countBadgeBg:{ im: 52, x: 395, y:  518 },
    countBadge:  { im: 53, x: 400, y:  521 },
    circle1:     { im: 44, x: 453, y:  321 },
    circle2:     { im: 46, x: 453, y:  321 },
    xsym:        { im: 47, x: 507, y:  407 },
    productZoneH: 492,
    text: {
      weight: { x: 254, y: 543 },
      count: { x: 431, y: 550, centerW: 62 },
    },
  },
  maxi: {
    sizeId: 'maxi', weightLabel: '7-15 kg\nMaxi', defaultCount: 144,
    bg:          { im: 55, x:   8, y: -146 },
    ph:          { im: 60, x:  65, y:  408 },   // Layer 16, 551×275
    line:        { im: 61, x: 352, y:  488 },
    digit:       { im: 63, x: 135, y:  520 },
    countBadgeBg:{ im: 64, x: 397, y:  518 },
    countBadge:  { im: 65, x: 404, y:  520 },
    circle1:     { im: 56, x: 447, y:  327 },
    circle2:     { im: 58, x: 447, y:  327 },
    xsym:        { im: 59, x: 498, y:  409 },
    productZoneH: 491,
    text: {
      weight: { x: 257, y: 543 },
      count: { x: 422, y: 548, centerW: 90 },
    },
  },
  xlarge: {
    sizeId: 'xlarge', weightLabel: '>15 kg\nXLarge', defaultCount: 144,
    bg:          { im: 67, x:   6, y: -145 },
    ph:          { im: 72, x:  68, y:  409 },   // Layer 4, 544×272
    line:        { im: 73, x: 352, y:  489 },
    digit:       { im: 75, x: 143, y:  521 },
    countBadgeBg:{ im: 76, x: 398, y:  518 },
    countBadge:  { im: 77, x: 405, y:  522 },
    circle1:     { im: 68, x: 464, y:  315 },
    circle2:     { im: 70, x: 464, y:  315 },
    xsym:        { im: 71, x: 518, y:  404 },
    productZoneH: 492,
    text: {
      weight: { x: 236, y: 543 },
      count: { x: 421, y: 549, centerW: 89 },
    },
  },
  junior: {
    sizeId: 'junior', weightLabel: '11-25 kg\nJunior', defaultCount: 74,
    bg:          { im: 79, x:  59, y:  -41 },
    ph:          { im: 85, x:  57, y:  408 },   // Layer 10, 545×273
    line:        { im: 86, x: 341, y:  489 },
    digit:       { im: 88, x: 132, y:  522 },
    countBadgeBg:{ im: 89, x: 387, y:  518 },
    countBadge:  { im: 90, x: 394, y:  521 },
    circle1:     { im: 81, x: 435, y:  344 },
    circle2:     { im: 83, x: 435, y:  344 },
    xsym:        { im: 84, x: 481, y:  418 },
    productZoneH: 492,
    text: {
      weight: { x: 226, y: 543 },
      count: { x: 422, y: 549, centerW: 66 },
    },
  },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function downloadImage(url: string): Promise<string> {
  const p = path.join(os.tmpdir(), `img-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`);
  const res = await fetch(url, { headers: { 'User-Agent': 'PSDGenerator/3.0' } });
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  fs.writeFileSync(p, Buffer.from(await res.arrayBuffer()));
  return p;
}

function extractFrame(psdPath: string, im: number, out: string): boolean {
  return spawnSync('convert', [`${psdPath}[${im}]`, out], { encoding: 'utf-8' }).status === 0;
}

// ─── Main compositor ─────────────────────────────────────────────────────────

export async function compositeProductIntoPSD(opts: CompositeOptions): Promise<CompositeResult> {
  const {
    psdPath, productImageUrl, productImageBuffer,
    sizeId, count, packs = 1, weightLabel,
    outputWidth = 680, outputHeight = 680, quality = 90,
  } = opts;

  const cfg = SIZE_CONFIGS[sizeId] ?? SIZE_CONFIGS.midi;
  const tmpDir = os.tmpdir();
  const sid    = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const files: string[] = [];

  const tmp = (n: string) => {
    const p = path.join(tmpDir, `${sid}_${n}`);
    files.push(p);
    return p;
  };

  try {
    // ── 1. Extract PSD layers ───────────────────────────────────────────────
    const bgPath  = tmp('bg.png');
    const phPath  = tmp('ph.png');
    const linPath = tmp('line.png');
    const digPath = tmp('digit.png');
    const cbgPath = tmp('cbg.png');
    const cbPath  = tmp('cb.png');
    const c1Path  = tmp('c1.png');
    const c2Path  = tmp('c2.png');
    const xsPath  = tmp('xs.png');

    if (!extractFrame(psdPath, cfg.bg.im, bgPath))
      throw new Error(`Failed to extract bg layer for ${sizeId}`);

    extractFrame(psdPath, cfg.ph.im,          phPath);
    extractFrame(psdPath, cfg.line.im,         linPath);
    extractFrame(psdPath, cfg.digit.im,        digPath);
    extractFrame(psdPath, cfg.countBadgeBg.im, cbgPath);
    extractFrame(psdPath, cfg.countBadge.im,   cbPath);
    extractFrame(psdPath, cfg.circle1.im,      c1Path);
    extractFrame(psdPath, cfg.circle2.im,      c2Path);
    extractFrame(psdPath, cfg.xsym.im,         xsPath);

    // ── 2. Prepare product image ────────────────────────────────────────────
    let prodPath: string | null = null;
    if (productImageUrl || productImageBuffer) {
      let srcPath: string;
      if (productImageBuffer) {
        srcPath = tmp('src.jpg');
        fs.writeFileSync(srcPath, productImageBuffer);
      } else {
        srcPath = await downloadImage(productImageUrl!);
        files.push(srcPath);
      }

      prodPath = tmp('product.png');
      // Trim white/near-white background first, then "cover" fit into product zone
      const zW = outputWidth;
      const zH = cfg.productZoneH;
      const trimmedPath = tmp('trimmed.png');
      // Step 1: trim white padding (common on Jumia product images)
      const trimRes = spawnSync('convert', [
        srcPath,
        '-fuzz', '8%',
        '-trim',
        '+repage',
        trimmedPath,
      ], { encoding: 'utf-8' });
      const sourcePath = trimRes.status === 0 ? trimmedPath : srcPath;
      // Step 2: cover-resize into zone dimensions
      const r = spawnSync('convert', [
        sourcePath,
        '-resize', `${zW}x${zH}^`,   // cover: scale to fill, may crop edges
        '-gravity', 'center',
        '-extent', `${zW}x${zH}`,
        prodPath,
      ], { encoding: 'utf-8' });
      if (r.status !== 0) prodPath = null;
    }

    // ── 3. Build composite command ──────────────────────────────────────────
    const args: string[] = ['-size', `${outputWidth}x${outputHeight}`, 'xc:white'];

    // Layer 1: product image (fills top zone from y=0)
    if (prodPath) {
      args.push(prodPath, '-geometry', '+0+0', '-composite');
    }

    // Layer 2: sticker background
    const bgXStr = cfg.bg.x >= 0 ? `+${cfg.bg.x}` : `${cfg.bg.x}`;
    const bgYStr = cfg.bg.y >= 0 ? `+${cfg.bg.y}` : `${cfg.bg.y}`;
    args.push(bgPath, '-geometry', `${bgXStr}${bgYStr}`, '-composite');

    // Layer 3: placeholder sticker frame
    args.push(phPath, '-geometry', `+${cfg.ph.x}+${cfg.ph.y}`, '-composite');

    // Layer 4: vertical divider
    args.push(linPath, '-geometry', `+${cfg.line.x}+${cfg.line.y}`, '-composite');

    // Layer 5: size digit
    args.push(digPath, '-geometry', `+${cfg.digit.x}+${cfg.digit.y}`, '-composite');

    // Layer 6: count badge
    args.push(cbgPath, '-geometry', `+${cfg.countBadgeBg.x}+${cfg.countBadgeBg.y}`, '-composite');
    args.push(cbPath,  '-geometry', `+${cfg.countBadge.x}+${cfg.countBadge.y}`,    '-composite');

    // Layer 7: x-packs badge (only if packs > 1)
    if (packs > 1) {
      args.push(c1Path, '-geometry', `+${cfg.circle1.x}+${cfg.circle1.y}`, '-composite');
      args.push(c2Path, '-geometry', `+${cfg.circle2.x}+${cfg.circle2.y}`, '-composite');
      args.push(xsPath, '-geometry', `+${cfg.xsym.x}+${cfg.xsym.y}`,      '-composite');
    }

    const basePath = tmp('base.jpg');
    args.push('-quality', String(quality), basePath);

    const buildRes = spawnSync('convert', args, { encoding: 'utf-8', maxBuffer: 100 * 1024 * 1024 });
    if (buildRes.status !== 0) throw new Error(`Composite failed: ${buildRes.stderr}`);

    // ── 4. Draw text overlays ───────────────────────────────────────────────
    const txtArgs: string[] = [basePath];

    // Font: ComicSansMS-Bold as used in the PSD (resolved to Comic Neue Bold on server)
    const font = COMIC_FONT;

    // Weight / size label — two lines, WHITE, 20pt Comic Sans Bold
    // Use sheet-provided label if available, otherwise fall back to PSD default
    const labelToRender = weightLabel ?? cfg.weightLabel;
    const [line1, line2] = labelToRender.split('\n');
    const wx = cfg.text.weight.x;
    const wy = cfg.text.weight.y;
    const weightFontSize = 20;
    const lineSpacing = 26; // px gap between baselines at 20pt
    txtArgs.push(
      '-font', font, '-pointsize', String(weightFontSize), '-fill', 'white',
      '-gravity', 'NorthWest', '-annotate', `+${wx}+${wy}`, line1,
    );
    if (line2) {
      txtArgs.push(
        '-font', font, '-pointsize', String(weightFontSize), '-fill', 'white',
        '-gravity', 'NorthWest', '-annotate', `+${wx}+${wy + lineSpacing}`, line2,
      );
    }

    // Count number — DARK BLUE #6381BA on white inner pill, Comic Sans Bold
    // Colour matches the dark blue of the badge outer oval (rgb 99,129,186)
    // Font size: 36pt for ≤2 digits, 28pt for 3 digits — calibrated to the badge layer size (~89x44px)
    const countStr = String(count ?? cfg.defaultCount);
    const countFontSize = countStr.length <= 2 ? 36 : 28;
    const approxCharW = countFontSize * 0.58; // Comic Sans character width ratio
    const countX = cfg.text.count.x + Math.max(0, Math.floor((cfg.text.count.centerW - countStr.length * approxCharW) / 2));
    const countY = cfg.text.count.y + 3; // slight top padding within badge
    txtArgs.push(
      '-font', font, '-pointsize', String(countFontSize), '-fill', 'white',
      '-gravity', 'NorthWest', '-annotate', `+${countX}+${countY}`, countStr,
    );

    // Pack count in circle badge (white Comic Sans, ~22pt) – only if packs > 1
    if (packs > 1) {
      const packsStr = String(packs);
      const pcx = cfg.circle1.x + 21 - Math.floor(packsStr.length * 8);
      const pcy = cfg.circle1.y + 63;
      txtArgs.push(
        '-font', font, '-pointsize', '22', '-fill', 'white',
        '-gravity', 'NorthWest', '-annotate', `+${pcx}+${pcy}`, packsStr,
      );
    }

    const finalPath = tmp('final.jpg');
    txtArgs.push('-quality', String(quality), finalPath);

    const txtRes = spawnSync('convert', txtArgs, { encoding: 'utf-8' });
    if (txtRes.status !== 0) {
      console.warn('Text overlay failed:', txtRes.stderr);
      return { success: true, outputBuffer: fs.readFileSync(basePath) };
    }

    return { success: true, outputBuffer: fs.readFileSync(finalPath) };

  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  } finally {
    for (const f of files) {
      try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch {}
    }
  }
}

// ─── Test image generator ────────────────────────────────────────────────────

export async function generateTestImage(
  width = 680, height = 680, text = 'Test Product', quality = 90,
): Promise<Buffer> {
  const p = path.join(os.tmpdir(), `test-${Date.now()}.jpg`);
  try {
    spawnSync('convert', [
      '-size', `${width}x${height}`, 'gradient:white-lightblue',
      '-font', 'Arial', '-pointsize', '32', '-fill', 'black',
      '-gravity', 'center', '-annotate', '+0+0', text,
      '-quality', String(quality), p,
    ], { encoding: 'utf-8' });
    return fs.readFileSync(p);
  } finally {
    try { fs.unlinkSync(p); } catch {}
  }
}
