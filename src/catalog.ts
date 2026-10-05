import rawCatalog from './data/catalog.json';
import type { Asset } from './types';

export const BUILTIN_ASSETS: Asset[] = (rawCatalog as unknown as Asset[]).map((a) => ({ ...a, src: assetUrl(a.src), thumb: assetUrl(a.thumb) }));

function assetUrl(p: string) {
  return import.meta.env.BASE_URL + p;
}

export const PRODUCT_LINES = ['SuperCoffee', 'Morning Shot', 'Koala', 'SuperCoffee Protein+', 'Caffeine Labs'];

/** Propriedade que define o "tamanho/forma" do item (variações dela mudam o layout). */
export function shapeKey(a: Asset): string {
  if (a.kind === 'produto') return `${a.line}|${a.props.Tamanho ?? a.props.Produto ?? ''}`;
  return a.custom ? a.id : `${a.props.Objeto}|${a.props.Modelo}`;
}

/** Ordem de exibição das propriedades de cada linha. */
export function propKeys(a: Asset): string[] {
  if (a.custom) return [];
  if (a.kind === 'brinde') return ['Objeto', 'Modelo', 'Position'];
  if (a.line === 'Caffeine Labs') return ['Produto', 'Sabor'];
  return ['Tamanho', 'Sabor', 'Posição'].filter((k) => k in a.props);
}

export const PROP_LABEL: Record<string, string> = {
  Tamanho: 'Tamanho', Sabor: 'Sabor', 'Posição': 'Posição', Produto: 'Produto',
  Objeto: 'Objeto', Modelo: 'Modelo', Position: 'Posição',
};

const sameGroup = (a: Asset, b: Asset) => !a.custom && !b.custom && a.kind === b.kind && (a.kind === 'brinde' || a.line === b.line);

/** Valores possíveis de uma propriedade, mantendo as demais iguais (ou todos, se nenhum combinar). */
export function optionsFor(asset: Asset, key: string, all: Asset[]): { value: string; exact: boolean }[] {
  const group = all.filter((b) => sameGroup(asset, b));
  const others = propKeys(asset).filter((k) => k !== key);
  const values = new Map<string, boolean>();
  for (const b of group) {
    const v = b.props[key];
    if (v == null) continue;
    const exact = others.every((k) => b.props[k] === asset.props[k]);
    values.set(v, (values.get(v) ?? false) || exact);
  }
  return [...values.entries()]
    .map(([value, exact]) => ({ value, exact }))
    .sort((x, y) => Number(y.exact) - Number(x.exact) || x.value.localeCompare(y.value, 'pt'));
}

/** Troca uma propriedade e devolve a variante que mais se parece com a atual. */
export function switchVariant(asset: Asset, key: string, value: string, all: Asset[]): Asset | undefined {
  const keys = propKeys(asset);
  let best: Asset | undefined;
  let bestScore = -1;
  for (const b of all) {
    if (!sameGroup(asset, b) || b.props[key] !== value) continue;
    // prioriza manter as primeiras propriedades (ex.: tamanho antes de sabor)
    const score = keys.reduce((s, k, i) => s + (k !== key && b.props[k] === asset.props[k] ? 10 - i : 0), 0);
    if (score > bestScore) { best = b; bestScore = score; }
  }
  return best;
}

/** Variantes "irmãs" para gerar em lote (mesma linha e tamanho; ou mesmo objeto no caso de brindes). */
export function batchSiblings(asset: Asset, all: Asset[]): Asset[] {
  if (asset.custom) return [asset];
  return all.filter((b) => {
    if (!sameGroup(asset, b)) return false;
    if (asset.kind === 'brinde') return b.props.Objeto === asset.props.Objeto;
    if (asset.line === 'Caffeine Labs') return true;
    return b.props.Tamanho === asset.props.Tamanho && b.props['Posição'] === asset.props['Posição'];
  });
}

export function slugify(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/\+/g, '-plus').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function variantSlug(a: Asset) {
  if (a.kind === 'brinde') return slugify(`${a.props.Objeto ?? a.label} ${a.props.Modelo ?? ''}`);
  return slugify(a.props.Sabor ?? a.props.Produto ?? a.label);
}
