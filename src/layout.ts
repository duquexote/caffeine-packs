// Montagem automática do pack, calibrada a partir dos packs do Figma:
//  - Packs-de-Campanha (banners Ecommerce/Prime: Always On, Semana do Cliente)
//  - DS Army UI > Fotos Packs (kits com várias latas: Black Friday, SDC, Summer)
//
// Tudo é calculado primeiro em "unidades de referência" (≈ unidades do frame Ecommerce 360x180)
// e depois enquadrado em cada formato. Regras:
//  - Produtos sempre à esquerda, brindes sempre à direita (e por cima dos produtos).
//  - Produtos em escadinha: cada lata mais ao fundo fica ~8% menor e um pouco mais alta.
//    A lata da frente pode ficar à esquerda (banners de campanha) ou à direita, junto dos brindes
//    (kits do DS). A sobreposição cresce com a quantidade de latas (25% com 2, ~40% com 5+).
//  - Muitos produtos (6+): duas fileiras; a de trás mais alta, a da frente mais baixa e por cima.
//  - Brindes: leque de sachês atrás; caneca na frente do leque; copo/copo térmico encostado na
//    última lata; mixer ao lado; bolsas à direita sobrepondo as latas; viseira/boné na frente,
//    embaixo, cobrindo a base das latas.
import type { Asset, Format, FormatAdjust, ItemAdjust, ItemType, Pack, PackLayout, Placement } from './types';

export const FORMATS: Format[] = [
  { id: 'ecom', label: 'Ecommerce', width: 360, height: 180, suffix: '', margin: { x: 0.12, top: 0.13, bottom: 0.09 } },
  { id: 'prime', label: 'Prime', width: 386, height: 257, suffix: '-PRM', margin: { x: 0.09, top: 0.18, bottom: 0.14 } },
  { id: 'prime-270', label: 'Prime 380×270', width: 380, height: 270, suffix: '-PRM-380x270', margin: { x: 0.09, top: 0.18, bottom: 0.14 } },
  // 3x = 1080×1080; o pack fica centralizado, limitado pela largura
  { id: 'square', label: 'Quadrado 1:1', width: 360, height: 360, suffix: '-1x1', margin: { x: 0.08, top: 0.12, bottom: 0.12 } },
];

export const DEFAULT_ADJUST: ItemAdjust = { dx: 0, dy: 0, scale: 1, rot: 0, flip: false, z: 0 };
export const DEFAULT_FORMAT_ADJUST: FormatAdjust = { zoom: 1, dx: 0, dy: 0 };
export const DEFAULT_LAYOUT: PackLayout = { depth: 'esquerda', rows: 'auto' };

const DEPTH_SCALE = 0.92; // cada produto mais ao fundo fica 8% menor
const DEPTH_LIFT = 6; // e sobe 6 unidades
const TWO_ROWS_FROM = 6; // a partir de quantos produtos o modo 'auto' usa duas fileiras
const FRONT_ROW_DROP = 0.45; // a fileira da frente desce 45% da altura da maior lata
const FRONT_ROW_SHIFT = 0.15; // e começa 15% da largura da lata mais para a direita

/** Fração da largura da lata de trás escondida pela da frente, conforme a quantidade de latas na fileira. */
function productOverlap(n: number) {
  return Math.min(0.42, 0.25 + 0.05 * Math.max(0, n - 2));
}

/** Altura visível padrão de cada item (SuperCoffee 380g de frente = 124). */
export function defaultVisualHeight(a: Asset): number {
  const p = a.props;
  // uploads não têm Tamanho: mesmo na linha de um produto, o tamanho vem do tipo
  if (!a.custom) switch (a.line) {
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
      return p.Objeto === 'Copo Termico' ? 88 : 95;
    case 'bolsa':
    case 'acessorio':
      if (p.Objeto === 'Ecobag') return 105;
      if (p.Objeto === 'Mala' || p.Objeto === 'Necessaire') return 70;
      return 85;
    case 'chapeu':
      return p.Objeto === 'Boné' ? 55 : 50;
    default:
      return a.kind === 'produto' ? 110 : 80;
  }
}

/** Ordem dos brindes da esquerda para a direita. */
const GIFT_ORDER: Record<ItemType, number> = {
  leque: 0, saches: 1, bolsa: 2, acessorio: 2, caneca: 3, copo: 4, mixer: 5, outro: 6, chapeu: 7,
  pote: 6, togo: 6, sache: 6,
};
/** Camada dos brindes (maior = mais à frente). */
const GIFT_LAYER: Record<ItemType, number> = {
  leque: 0, saches: 0, bolsa: 1, acessorio: 1, mixer: 2, outro: 2, copo: 3, caneca: 3, chapeu: 4,
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

type Item = { uid: string; asset: Asset };

/**
 * Posiciona os itens em unidades de referência. O chão (base da fileira de trás) fica em y = 0.
 * `sizeOverride` permite um tamanho padrão salvo pelo usuário (multiplicador por asset).
 */
export function autoLayout(
  items: Item[],
  sizeOverride: (a: Asset) => number = () => 1,
  opts: PackLayout = DEFAULT_LAYOUT,
): RefBox[] {
  const products = items.filter((i) => i.asset.kind === 'produto');
  const gifts = items.filter((i) => i.asset.kind !== 'produto');
  const out: RefBox[] = [];

  const sizeOf = (a: Asset) => defaultVisualHeight(a) * sizeOverride(a);
  const frameFor = (asset: Asset, visH: number) => {
    const [bx0, by0, bx1, by1] = asset.bbox;
    const h = visH / (by1 - by0);
    return { h, visW: h * asset.aspect * (bx1 - bx0) };
  };
  const place = (uid: string, asset: Asset, visH: number, left: number, bottom: number, z: number) => {
    const [bx0, , , by1] = asset.bbox;
    const { h } = frameFor(asset, visH);
    const box: RefBox = { uid, asset, x: left - bx0 * h * asset.aspect, y: bottom - by1 * h, h, z };
    out.push(box);
    return box;
  };

  // ---- produtos: uma ou duas fileiras em escadinha ----
  /** `depthOffset`: degraus extras de profundidade (a fileira da frente repete os tamanhos da de trás). */
  const placeRow = (row: Item[], startLeft: number, floor: number, zBase: number, depthOffset = 0) => {
    const n = row.length;
    const overlap = productOverlap(n);
    let right = -Infinity;
    let prevW = 0;
    const boxes: RefBox[] = [];
    row.forEach((it, i) => {
      // posição de profundidade: 0 = lata da frente
      const depth = (opts.depth === 'esquerda' ? i : n - 1 - i) + depthOffset;
      const visH = sizeOf(it.asset) * DEPTH_SCALE ** depth;
      const { visW } = frameFor(it.asset, visH);
      // a sobreposição é medida na lata que está atrás
      const behindW = opts.depth === 'esquerda' ? visW : prevW;
      const left = i === 0 ? startLeft : right - overlap * behindW;
      const z = zBase + (opts.depth === 'esquerda' ? -i : i);
      const box = place(it.uid, it.asset, visH, left, floor - depth * DEPTH_LIFT, z);
      boxes.push(box);
      right = Math.max(right, visual(box).x1);
      prevW = visW;
    });
    return boxes;
  };

  const rows = opts.rows === 'auto' ? (products.length >= TWO_ROWS_FROM ? 2 : 1) : opts.rows;
  if (rows === 2 && products.length >= 2) {
    const back = products.slice(0, Math.ceil(products.length / 2));
    const front = products.slice(back.length);
    const backBoxes = placeRow(back, 0, 0, 100);
    const tallest = Math.max(...backBoxes.map((b) => visual(b).y1 - visual(b).y0));
    const first = visual(backBoxes[0]);
    // no DS a fileira da frente usa os tamanhos das latas de trás alinhadas pela esquerda
    const offset = opts.depth === 'direita' ? back.length - front.length : 0;
    placeRow(front, first.x0 + FRONT_ROW_SHIFT * (first.x1 - first.x0), FRONT_ROW_DROP * tallest, 150, offset);
  } else {
    placeRow(products, 0, 0, 100);
  }

  // ---- brindes, sempre à direita ----
  const productBoxes = [...out];
  const productsRight = productBoxes.length ? Math.max(...productBoxes.map((b) => visual(b).x1)) : 0;
  let rightEdge = productBoxes.length ? productsRight : -Infinity;
  // o brinde "anterior" do primeiro é a lata mais à direita
  let prev: RefBox | undefined = productBoxes.sort((a, b) => visual(b).x1 - visual(a).x1)[0];

  const front = gifts.filter((g) => g.asset.type === 'chapeu');
  const side = gifts.filter((g) => g.asset.type !== 'chapeu');
  side.forEach((it, i) => {
    const a = it.asset;
    const visH = sizeOf(a);
    const { visW: w } = frameFor(a, visH);
    const has = Number.isFinite(rightEdge);
    const pv = prev ? visual(prev) : null;
    let left: number;
    let bottom: number;
    switch (a.type) {
      case 'leque':
      case 'saches':
        left = has ? rightEdge + 4 : 0;
        bottom = a.type === 'leque' ? -16 : -10;
        break;
      case 'caneca':
        if (pv && (prev!.asset.type === 'leque' || prev!.asset.type === 'saches')) {
          // caneca na frente do leque, alinhada à borda direita dele
          left = pv.x1 - 0.02 * (pv.x1 - pv.x0) - w;
        } else {
          left = has ? rightEdge - 0.12 * w : 0;
        }
        bottom = 7;
        break;
      case 'copo':
        // copo / copo térmico encostado na última lata, um pouco mais à frente
        left = has ? rightEdge - 0.1 * w : 0;
        bottom = 9;
        break;
      case 'mixer':
        if (pv && prev!.asset.type === 'caneca') left = rightEdge + 1;
        else if (pv && prev!.asset.type === 'copo') left = pv.x1 + 4; // em pé ao lado do copo, como nos kits Black Friday
        else left = has ? rightEdge - 0.1 * w : 0;
        bottom = prev?.asset.type === 'copo' ? 3 : 2;
        break;
      case 'bolsa':
      case 'acessorio':
        // ecobag / mala / necessaire à direita, sobrepondo ~1/3 da última lata
        left = has ? rightEdge - 0.32 * w : 0;
        bottom = -2;
        break;
      default:
        left = has ? rightEdge - 0.1 * w : 0;
        bottom = 0;
    }
    prev = place(it.uid, a, visH, left, bottom, 200 + (GIFT_LAYER[a.type] ?? 2) * 10 + i);
    rightEdge = Math.max(rightEdge, visual(prev).x1);
  });

  // viseira / boné: na frente, embaixo, cobrindo a base da lata mais à direita
  front.forEach((it, i) => {
    const a = it.asset;
    const visH = sizeOf(a);
    const { visW: w } = frameFor(a, visH);
    const anchor = productBoxes.length ? productsRight : Number.isFinite(rightEdge) ? rightEdge / 2 + w / 2 : w / 2;
    // com outros brindes ao lado, a viseira cobre a lata inteira; sozinha, avança mais para a direita
    const k = side.length ? 0.72 : 0.53;
    place(it.uid, a, visH, anchor - k * w + i * 0.3 * w, 10 + i * 4, 240 + i);
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
  const boxes = autoLayout(items, sizeOverride, { ...DEFAULT_LAYOUT, ...pack.layout });
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
