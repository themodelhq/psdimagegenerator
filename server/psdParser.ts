import fs from 'fs';
import os from 'os';
import path from 'path';

export interface TextLayer {
  name: string;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize?: number;
  fontFamily?: string;
}

export interface PsdInfo {
  width: number;
  height: number;
  textLayers: TextLayer[];
}

/**
 * Parse a PSD file buffer and extract dimensions and text layers.
 * Uses the 'psd' npm package — pure Node.js, no Python required.
 */
export async function parsePsdFile(buffer: Buffer): Promise<PsdInfo> {
  // Dynamically import 'psd' (CommonJS module) to stay ESM-compatible
  const PSD = (await import('psd')).default ?? (await import('psd'));

  const tempFile = path.join(os.tmpdir(), `psd-${Date.now()}-${Math.random().toString(36).slice(2)}.psd`);
  try {
    fs.writeFileSync(tempFile, buffer);
    const psd = await PSD.fromFile(tempFile);
    await psd.parse();

    const tree = psd.tree();
    const width: number = (psd as any).header?.width ?? tree.width ?? 0;
    const height: number = (psd as any).header?.height ?? tree.height ?? 0;

    const textLayers: TextLayer[] = [];

    function walk(node: any) {
      if (!node) return;
      const isText = node.type === 'type'
        || node.layer?.type === 'type'
        || node.get?.('typeTool') !== undefined
        || (node.layer?.adjustments?.typeTool !== undefined);

      if (isText) {
        const layerNode = node.layer ?? node;
        let text = '';
        try { text = node.export?.()?.text?.value ?? ''; } catch {}
        if (!text) {
          try { text = layerNode.adjustments?.typeTool?.data?.descriptor?.data?.Txt?.value ?? ''; } catch {}
        }
        textLayers.push({
          name: node.name ?? layerNode.name ?? 'Text Layer',
          text,
          x: node.left ?? layerNode.left ?? 0,
          y: node.top ?? layerNode.top ?? 0,
          width: node.width ?? layerNode.width ?? 0,
          height: node.height ?? layerNode.height ?? 0,
        });
      }

      const children = node.children?.() ?? node._children ?? [];
      for (const child of children) walk(child);
    }

    walk(tree);

    return { width, height, textLayers };
  } finally {
    try { if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile); } catch {}
  }
}

export async function getPsdTextLayerNames(buffer: Buffer): Promise<string[]> {
  const info = await parsePsdFile(buffer);
  return info.textLayers.map(l => l.name);
}
