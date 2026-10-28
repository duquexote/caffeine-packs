import JSZip from 'jszip';
import type { Asset, Format, Pack, Placement } from './types';
import { layoutPack, selectionCorners } from './layout';

// ---- Cache de imagens ----

const images = new Map<string, HTMLImageElement>();
const listeners = new Set<() => void>();

export function onImageLoad(fn: () => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function getImage(src: string): HTMLImageElement {
  let img = images.get(src);
  if (!img) {
    img = new Image();
    // uploads do time vêm do Supabase: sem CORS o canvas fica "sujo" e não exporta
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => listeners.forEach((fn) => fn());
    img.src = src;
    images.set(src, img);
  }
  return img;
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  const img = getImage(src);
  if (img.complete && img.naturalWidth) return Promise.resolve(img);
  return new Promise((resolve, reject) => {
    img.addEventListener('load', () => resolve(img), { once: true });
    img.addEventListener('error', () => reject(new Error('Falha ao carregar ' + src)), { once: true });
  });
}

// ---- Desenho ----

/** O fundo é 'transparent', uma cor (#hex) ou a URL de uma imagem enviada. */
export const isImageBackground = (bg: string) => /^(https?:|blob:|data:)/.test(bg);

export interface DrawOptions {
  /** pixels por unidade do frame */
  scale: number;
  background: string; // 'transparent', cor ou URL de imagem
  selected?: string[];
  hovered?: string | null;
}

/** Aplica a transformação do item (rotação e espelhamento em torno do centro do quadro). */
function withItemTransform(ctx: CanvasRenderingContext2D, p: Placement, fn: () => void) {
  ctx.save();
  ctx.translate(p.x + p.w / 2, p.y + p.h / 2);
  if (p.rot) ctx.rotate((p.rot * Math.PI) / 180);
  if (p.flip) ctx.scale(-1, 1);
  ctx.translate(-p.w / 2, -p.h / 2);
  fn();
  ctx.restore();
}

export function drawPlacements(ctx: CanvasRenderingContext2D, f: Format, placements: Placement[], o: DrawOptions) {
  ctx.save();
  ctx.setTransform(o.scale, 0, 0, o.scale, 0, 0);
  ctx.clearRect(0, 0, f.width, f.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  if (isImageBackground(o.background)) {
    const img = getImage(o.background);
    if (img.complete && img.naturalWidth) {
      // cobre o quadro inteiro, centralizada (como background-size: cover)
      const k = Math.max(f.width / img.naturalWidth, f.height / img.naturalHeight);
      const w = img.naturalWidth * k, h = img.naturalHeight * k;
      ctx.drawImage(img, (f.width - w) / 2, (f.height - h) / 2, w, h);
    }
  } else if (o.background !== 'transparent') {
    ctx.fillStyle = o.background;
    ctx.fillRect(0, 0, f.width, f.height);
  }
  for (const p of placements) {
    const img = getImage(p.asset.src);
    if (!img.complete || !img.naturalWidth) continue;
    const [c0, c1, c2, c3] = p.asset.crop;
    withItemTransform(ctx, p, () => {
      ctx.drawImage(img, c0 * p.w, c1 * p.h, (c2 - c0) * p.w, (c3 - c1) * p.h);
    });
  }
  // contorno de seleção (só na tela)
  const selected = o.selected ?? [];
  for (const p of placements) {
    const sel = selected.includes(p.uid);
    if (!sel && p.uid !== o.hovered) continue;
    const [b0, b1, b2, b3] = p.asset.bbox;
    withItemTransform(ctx, p, () => {
      ctx.lineWidth = (sel ? 1.5 : 1) / o.scale;
      ctx.setLineDash(sel ? [] : [4 / o.scale, 3 / o.scale]);
      ctx.strokeStyle = sel ? '#C2410C' : 'rgba(194,65,12,0.6)';
      const pad = SELECTION_PAD;
      ctx.strokeRect(b0 * p.w - pad, b1 * p.h - pad, (b2 - b0) * p.w + 2 * pad, (b3 - b1) * p.h + 2 * pad);
    });
  }
  const sel = placements.filter((p) => selected.includes(p.uid));
  if (sel.length) {
    const corners = selectionCorners(sel, SELECTION_PAD);
    ctx.setLineDash([]);
    ctx.strokeStyle = '#C2410C';
    if (sel.length > 1) {
      // caixa do conjunto: é ela que as alças redimensionam
      ctx.lineWidth = 1 / o.scale;
      ctx.strokeRect(corners[0].x, corners[0].y, corners[2].x - corners[0].x, corners[2].y - corners[0].y);
    }
    // alças de redimensionar nas 4 pontas (HANDLE_SIZE px de tela)
    const hs = (HANDLE_SIZE / 2) * (window.devicePixelRatio || 1) / o.scale;
    ctx.lineWidth = 1.5 / o.scale;
    ctx.fillStyle = '#fff';
    for (const c of corners) {
      ctx.fillRect(c.x - hs, c.y - hs, 2 * hs, 2 * hs);
      ctx.strokeRect(c.x - hs, c.y - hs, 2 * hs, 2 * hs);
    }
  }
  ctx.restore();
}

/** folga entre a imagem e o contorno de seleção, em unidades do frame */
export const SELECTION_PAD = 2;
/** lado das alças de redimensionar, em px de tela */
export const HANDLE_SIZE = 8;

// ---- Seleção por clique (respeita a transparência do PNG) ----

const alphaMaps = new Map<string, { w: number; h: number; data: Uint8ClampedArray }>();

function alphaAt(asset: Asset, u: number, v: number): number {
  let m = alphaMaps.get(asset.src);
  if (!m) {
    const img = getImage(asset.src);
    if (!img.complete || !img.naturalWidth) return 255;
    const k = Math.min(1, 256 / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k));
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0, w, h);
    m = { w, h, data: ctx.getImageData(0, 0, w, h).data };
    alphaMaps.set(asset.src, m);
  }
  const x = Math.min(m.w - 1, Math.max(0, Math.floor(u * m.w)));
  const y = Math.min(m.h - 1, Math.max(0, Math.floor(v * m.h)));
  return m.data[(y * m.w + x) * 4 + 3];
}

/** Item no ponto (unidades do frame), do mais à frente para o mais atrás. */
export function hitTest(placements: Placement[], x: number, y: number): Placement | null {
  for (let i = placements.length - 1; i >= 0; i--) {
    const p = placements[i];
    // ponto -> coordenadas locais do quadro
    let lx = x - (p.x + p.w / 2), ly = y - (p.y + p.h / 2);
    if (p.rot) {
      const r = (-p.rot * Math.PI) / 180;
      [lx, ly] = [lx * Math.cos(r) - ly * Math.sin(r), lx * Math.sin(r) + ly * Math.cos(r)];
    }
    if (p.flip) lx = -lx;
    const u = (lx + p.w / 2) / p.w, v = (ly + p.h / 2) / p.h;
    const [c0, c1, c2, c3] = p.asset.crop;
    if (u < c0 || u > c2 || v < c1 || v > c3) continue;
    if (alphaAt(p.asset, (u - c0) / (c2 - c0), (v - c1) / (c3 - c1)) > 24) return p;
  }
  return null;
}

// ---- Exportação ----

export interface ExportOptions {
  scale: number;
  quality: number;
  background: string;
  sizeOverride?: (a: Asset) => number;
}

export async function renderPackBlob(pack: Pack, assets: Map<string, Asset>, f: Format, o: ExportOptions): Promise<Blob> {
  const { placements } = layoutPack(pack, assets, f, o.sizeOverride);
  const srcs = placements.map((p) => p.asset.src);
  if (isImageBackground(o.background)) srcs.push(o.background);
  await Promise.all(srcs.map(loadImage));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(f.width * o.scale);
  canvas.height = Math.round(f.height * o.scale);
  const ctx = canvas.getContext('2d')!;
  drawPlacements(ctx, f, placements, { scale: o.scale, background: o.background });
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', o.quality));
  if (!blob) throw new Error('O navegador não conseguiu gerar o WebP.');
  return blob;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export async function zipFiles(files: { name: string; blob: Blob }[]): Promise<Blob> {
  const zip = new JSZip();
  for (const f of files) zip.file(f.name, f.blob);
  return zip.generateAsync({ type: 'blob' });
}
