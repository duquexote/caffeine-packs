// Montagem automática do pack, calibrada a partir dos packs do Figma (Always On / Semana do Cliente).
//
// Tudo é calculado primeiro em "unidades de referência" (≈ unidades do frame Ecommerce 360x180)
// e depois enquadrado em cada formato. Regras observadas no Figma:
//  - Produtos: o primeiro fica na frente, à esquerda. Cada produto seguinte vai para a direita,
//    atrás, sobrepondo ~25% da largura, um pouco menor (perspectiva) e um pouco mais alto.
//  - Brindes: à direita dos produtos e por cima deles. Leque de sachês atrás; caneca na frente
//    do leque (alinhada à direita dele); mixer em pé ao lado da caneca.
import type { Asset, Format, FormatAdjust, ItemAdjust, ItemType, Pack, Placement } from './types';

export const FORMATS: Format[] = [
  { id: 'ecom', label: 'Ecommerce', width: 360, height: 180, suffix: '', margin: { x: 0.12, top: 0.13, bottom: 0.09 } },
  { id: 'prime', label: 'Prime', width: 386, height: 257, suffix: '-PRM', margin: { x: 0.09, top: 0.18, bottom: 0.14 } },
  { id: 'prime-270', label: 'Prime 380×270', width: 380, height: 270, suffix: '-PRM-380x270', margin: { x: 0.09, top: 0.18, bottom: 0.14 } },
];

export const DEFAULT_ADJUST: ItemAdjust = { dx: 0, dy: 0, scale: 1, rot: 0, flip: false, z: 0 };
export const DEFAULT_FORMAT_ADJUST: FormatAdjust = { zoom: 1, dx: 0, dy: 0 };

const DEPTH_SCALE = 0.92; // cada produto atrás fica 8% menor
const DEPTH_LIFT = 6; // e sobe 6 unidades
const PRODUCT_OVERLAP = 0.25; // fração da largura do produto de trás escondida pelo da frente

/** Altura visível padrão de cada item (SuperCoffee 380g de frente = 124). */
export function defaultVisualHeight(a: Asset): number {
  const p = a.props;
  switch (a.line) {
    case 'SuperCoffee':
      if (p.Tamanho === '220g') return 105;
      if (p.Tamanho === 'PPB') return 120;
      if (p.Tamanho === 'To go') return 80;
      if (p.Tamanho === 'Sachê') return 90;
      return 124;
    case 'Morning Shot':
      if (p.Tamanho === 'Classic') return 96;
      return p.Tamanho === 'Travel Size' ? 85 : 80;
    case 'Koala':
      if (p.Tamanho === '456g') return 105;
      if (p.Tamanho === 'To go') return 85;
      if (p.Tamanho === '60g') return 70;
      return p.Tamanho === 'Sachê' ? 75 : 85;
    case 'SuperCoffee Protein+':
      return 114;
    case 'Caffeine Labs':
      return p.Produto === 'Creatina' ? 100 : 109;
  }
  switch (a.type) {
    case 'caneca': return 76;
    case 'mixer': return 128;
    case 'leque': return 113;
    case 'saches': return p.Objeto === 'Kopenhagen' ? 40 : p.Objeto === 'Samplings' ? 90 : 100;
    case 'copo':
      if (p.Objeto === 'Garrafa') return 115;
      if (p.Objeto === 'Coqueteleira') return 110;
      return p.Objeto === 'Copo Termico' ? 105 : 95;
    case 'acessorio':
      return p.Objeto === 'Boné' || p.Objeto === 'Viseira' ? 70 : 95;
    default:
      return a.kind === 'produto' ? 110 : 80;
  }
}

/** Ordem dos brindes da esquerda para a direita. */
const GIFT_ORDER: Record<ItemType, number> = {
  leque: 0, saches: 1, acessorio: 2, caneca: 3, copo: 4, mixer: 5, outro: 6,
  pote: 7, togo: 7, sache: 7,
};
/** Camada dos brindes (maior = mais à frente). */
const GIFT_LAYER: Record<ItemType, number> = {
  leque: 0, saches: 0, acessorio: 1, mixer: 2, copo: 2, outro: 2, caneca: 3,
  pote: 2, togo: 2, sache: 2,
};

export function giftOrder(a: Asset): number {
  return GIFT_ORDER[a.type] ?? 6;
}

interface RefBox {
  uid: string;
  asset: Asset;
  x: number; // canto superior esquerdo do quadro
  y: number;
  h: number; // altura do quadro (largura = h * aspect)
  z: number;
}

const visual = (b: RefBox) => {
  const w = b.h * b.asset.aspect;
  const [x0, y0, x1, y1] = b.asset.bbox;
  return { x0: b.x + x0 * w, y0: b.y + y0 * b.h, x1: b.x + x1 * w, y1: b.y + y1 * b.h };
};

/**
 * Posiciona os itens em unidades de referência. O chão (base do produto da frente) fica em y = 0.
 * `sizeOverride` permite um tamanho padrão salvo pelo usuário (multiplicador por asset).
 */
export function autoLayout(
  items: { uid: string; asset: Asset }[],
  sizeOverride: (a: Asset) => number = () => 1,
): RefBox[] {
  const products = items.filter((i) => i.asset.kind === 'produto');
  const gifts = items.filter((i) => i.asset.kind !== 'produto');
  const out: RefBox[] = [];
  let rightEdge = -Infinity;

  const place = (uid: string, asset: Asset, visH: number, left: number, bottom: number, z: number) => {
    const [bx0, by0, , by1] = asset.bbox;
    const h = visH / (by1 - by0);
    const w = h * asset.aspect;
    const box: RefBox = { uid, asset, x: left - bx0 * w, y: bottom - by1 * h, h, z };
    out.push(box);
    rightEdge = Math.max(rightEdge, visual(box).x1);
    return box;
  };
  const visW = (asset: Asset, visH: number) => {
    const [bx0, by0, bx1, by1] = asset.bbox;
    return (visH / (by1 - by0)) * asset.aspect * (bx1 - bx0);
  };

  products.forEach((it, i) => {
    const visH = defaultVisualHeight(it.asset) * sizeOverride(it.asset) * DEPTH_SCALE ** i;
    const w = visW(it.asset, visH);
    const left = i === 0 ? 0 : rightEdge - PRODUCT_OVERLAP * w;
    place(it.uid, it.asset, visH, left, -i * DEPTH_LIFT, 100 - i);
  });

  let prev: RefBox | undefined = out[out.length - 1];
  gifts.forEach((it, i) => {
    const a = it.asset;
    const visH = defaultVisualHeight(a) * sizeOverride(a);
    const w = visW(a, visH);
    const has = Number.isFinite(rightEdge);
    let left: number;
    let bottom: number;
    switch (a.type) {
      case 'leque':
      case 'saches':
        left = has ? rightEdge + 4 : 0;
        bottom = a.type === 'leque' ? -16 : -10;
        break;
      case 'caneca':
        if (prev && (prev.asset.type === 'leque' || prev.asset.type === 'saches')) {
          // caneca na frente do leque, alinhada à borda direita dele
          const pv = visual(prev);
          left = pv.x1 - 0.02 * (pv.x1 - pv.x0) - w;
        } else {
          left = has ? rightEdge - 0.12 * w : 0;
        }
        bottom = 7;
        break;
      case 'mixer':
        left = has ? rightEdge + (prev?.asset.type === 'caneca' ? 1 : -0.1 * w) : 0;
        bottom = 2;
        break;
      case 'copo':
        left = has ? rightEdge - 0.1 * w : 0;
        bottom = 4;
        break;
      case 'acessorio':
        left = has ? rightEdge - 0.15 * w : 0;
        bottom = -2;
        break;
      default:
        left = has ? rightEdge - 0.1 * w : 0;
        bottom = 0;
    }
    prev = place(it.uid, a, visH, left, bottom, 200 + (GIFT_LAYER[a.type] ?? 2) * 10 + i);
  });
  return out;
}

function bounds(boxes: RefBox[]) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const b of boxes) {
    const v = visual(b);
    x0 = Math.min(x0, v.x0); y0 = Math.min(y0, v.y0);
    x1 = Math.max(x1, v.x1); y1 = Math.max(y1, v.y1);
  }
  return { x0, y0, x1, y1 };
}

export interface FrameTransform {
  /** escala ref -> frame */
  s: number;
  ox: number;
  oy: number;
}

/** Enquadramento automático da composição (sem ajustes manuais) no formato. */
export function fitTransform(boxes: RefBox[], f: Format, fa: FormatAdjust = DEFAULT_FORMAT_ADJUST): FrameTransform {
  if (!boxes.length) return { s: 1, ox: 0, oy: 0 };
  const b = bounds(boxes);
  const bw = b.x1 - b.x0, bh = b.y1 - b.y0;
  const availW = f.width * (1 - 2 * f.margin.x);
  const availH = f.height * (1 - f.margin.top - f.margin.bottom);
  const s = Math.min(availW / bw, availH / bh) * fa.zoom;
  const cx = f.width / 2 + fa.dx * f.width;
  const cy = f.height * f.margin.top + availH / 2 + fa.dy * f.height;
  return { s, ox: cx - ((b.x0 + b.x1) / 2) * s, oy: cy - ((b.y0 + b.y1) / 2) * s };
}

/** Posições finais de um pack em um formato, já com ajustes manuais. */
export function layoutPack(
  pack: Pack,
  assets: Map<string, Asset>,
  f: Format,
  sizeOverride?: (a: Asset) => number,
): { placements: Placement[]; t: FrameTransform } {
  const items = pack.items
    .map((it) => ({ uid: it.uid, asset: assets.get(it.assetId) }))
    .filter((it): it is { uid: string; asset: Asset } => !!it.asset);
  const boxes = autoLayout(items, sizeOverride);
  const t = fitTransform(boxes, f, pack.formatAdjust[f.id]);
  const placements = boxes.map((b): Placement => {
    const adj = pack.adjust[b.uid] ?? DEFAULT_ADJUST;
    // escala manual em torno da base central visível (o item continua "apoiado" no chão)
    const v = visual(b);
    const ax = (v.x0 + v.x1) / 2, ay = v.y1;
    const h = b.h * adj.scale;
    const x = ax + (b.x - ax) * adj.scale + adj.dx;
    const y = ay + (b.y - ay) * adj.scale + adj.dy;
    return {
      uid: b.uid,
      asset: b.asset,
      x: t.ox + x * t.s,
      y: t.oy + y * t.s,
      w: h * b.asset.aspect * t.s,
      h: h * t.s,
      rot: adj.rot,
      flip: adj.flip,
      z: b.z + adj.z,
    };
  });
  placements.sort((a, b) => a.z - b.z);
  return { placements, t };
}
