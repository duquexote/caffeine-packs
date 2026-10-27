import { createClient } from '@supabase/supabase-js';
import type { Asset, ItemType, Pack, Rect4 } from './types';

// Ferramenta interna, sem conteúdo sensível: a chave pública fica no código de propósito.
const supabase = createClient(
  'https://xklugwiabtdqziumwjsn.supabase.co',
  'sb_publishable_YQS_RrzX9QDwqmUVXD0CBQ_JJzque47',
  { auth: { persistSession: false } },
);

/** packs e tamanhos ficavam aqui antes do Supabase; só lidos para a migração */
const KEY_PACKS = 'gerador-pack:packs';
const KEY_SIZES = 'gerador-pack:sizes';
const KEY_CURRENT = 'gerador-pack:current';
const KEY_PREFS = 'gerador-pack:prefs';

function read<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* sem armazenamento: segue sem persistir */
  }
}
function forget(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/** Rascunho em edição: é de cada pessoa, fica no navegador. */
export const loadCurrent = () => read<Pack | null>(KEY_CURRENT, null);
export const saveCurrent = (p: Pack) => write(KEY_CURRENT, p);

// ---- Packs salvos e tamanhos padrão (Supabase: tabelas packs e pack_sizes, compartilhadas com o time) ----

const packRow = (p: Pack) => ({ id: p.id, name: p.name, data: p, updated_at: new Date(p.updatedAt).toISOString() });
const sizeRows = (s: Record<string, number>) => Object.entries(s).map(([key, scale]) => ({ key, scale }));

/** O que estava salvo só no navegador sobe para o time na primeira abertura (sem sobrescrever o que já existe). */
async function migrate(key: string, table: string, rows: object[]) {
  if (!rows.length) return;
  const { error } = await supabase.from(table).upsert(rows, { ignoreDuplicates: true });
  if (!error) forget(key);
}

export async function loadPacks(): Promise<Pack[]> {
  await migrate(KEY_PACKS, 'packs', read<Pack[]>(KEY_PACKS, []).map(packRow));
  const { data, error } = await supabase.from('packs').select('data').order('updated_at', { ascending: false });
  if (error) throw error;
  return (data as { data: Pack }[]).map((r) => r.data);
}

export async function savePacks(packs: Pack[]) {
  const { error } = await supabase.from('packs').upsert(packs.map(packRow));
  if (error) throw error;
}

export async function deleteSavedPack(id: string) {
  const { error } = await supabase.from('packs').delete().eq('id', id);
  if (error) throw error;
}

/** Multiplicador de tamanho padrão por "forma" de produto (ver shapeKey). */
export async function loadSizes(): Promise<Record<string, number>> {
  await migrate(KEY_SIZES, 'pack_sizes', sizeRows(read<Record<string, number>>(KEY_SIZES, {})));
  const { data, error } = await supabase.from('pack_sizes').select('key, scale');
  if (error) throw error;
  return Object.fromEntries((data as { key: string; scale: number }[]).map((r) => [r.key, r.scale]));
}

export async function saveSizes(s: Record<string, number>) {
  const { error } = await supabase.from('pack_sizes').upsert(sizeRows(s));
  if (error) throw error;
}

export async function deleteSize(key: string) {
  const { error } = await supabase.from('pack_sizes').delete().eq('key', key);
  if (error) throw error;
}

/** Preferências de exportação: de cada pessoa, ficam no navegador. */
export interface Prefs {
  formats: string[];
  scale: number;
  quality: number;
  background: string;
}
export const DEFAULT_PREFS: Prefs = { formats: ['ecom', 'prime'], scale: 3, quality: 0.9, background: '#F4F0E9' };
export const loadPrefs = () => ({ ...DEFAULT_PREFS, ...read<Partial<Prefs>>(KEY_PREFS, {}) });
export const savePrefs = (p: Prefs) => write(KEY_PREFS, p);

// ---- Imagens enviadas pelo time (Supabase: tabela pack_uploads + bucket pack-uploads) ----

const TABLE = 'pack_uploads';
const BUCKET = 'pack-uploads';

/** Grupo de quem não escolheu um (uploads antigos). */
export const DEFAULT_UPLOAD_GROUP = 'Outros';

interface UploadRow {
  id: string;
  label: string;
  kind: 'produto' | 'brinde';
  type: ItemType;
  aspect: number;
  bbox: Rect4;
  path: string;
  /** objeto do brinde (Caneca, Mixer…) ou linha do produto (SuperCoffee…) */
  category?: string | null;
}

function toAsset(r: UploadRow, src = supabase.storage.from(BUCKET).getPublicUrl(r.path).data.publicUrl): Asset {
  const group = r.category || DEFAULT_UPLOAD_GROUP;
  return {
    // entra no catálogo junto dos itens do Figma: brinde no grupo do objeto, produto na linha
    id: r.id, line: r.kind === 'brinde' ? 'Brinde' : group, kind: r.kind, type: r.type,
    props: r.kind === 'brinde' ? { Objeto: group, Modelo: r.label } : {}, label: r.label,
    src, thumb: src, aspect: r.aspect, crop: [0, 0, 1, 1], bbox: r.bbox, custom: true,
  };
}

/** Envia o arquivo e registra o item. Idempotente pelo id (a migração dos uploads antigos pode rodar duas vezes). */
async function insertUpload(row: Omit<UploadRow, 'path'>, blob: Blob): Promise<UploadRow> {
  const full = { ...row, path: `${row.id}.${blob.type === 'image/webp' ? 'webp' : 'png'}` };
  const up = await supabase.storage.from(BUCKET).upload(full.path, blob, { contentType: blob.type || 'image/png', upsert: true });
  if (up.error) throw up.error;
  const { error } = await supabase.from(TABLE).upsert(full, { ignoreDuplicates: true });
  if (error) throw error;
  return full;
}

export async function loadUploads(): Promise<Asset[]> {
  const { data, error } = await supabase.from(TABLE).select('id, label, kind, type, aspect, bbox, path, category').order('created_at');
  if (error) throw error;
  const rows = data as UploadRow[];
  // uploads feitos antes da integração ficavam só no navegador: sobem para o time na primeira abertura
  const pending: Asset[] = [];
  for (const u of await loadLegacyUploads()) {
    if (!rows.some((r) => r.id === u.id)) {
      try {
        const { blob, ...row } = u;
        rows.push(await insertUpload(row, blob));
      } catch {
        pending.push(toAsset({ ...u, path: '' }, URL.createObjectURL(u.blob)));
        continue;
      }
    }
    await deleteLegacyUpload(u.id);
  }
  return [...rows.map((r) => toAsset(r)), ...pending];
}

export async function addUpload(file: File, label: string, kind: 'produto' | 'brinde', type: ItemType, category: string): Promise<Asset> {
  const bitmap = await createImageBitmap(file);
  const row = await insertUpload({
    id: 'upload-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    label, kind, type, category,
    aspect: bitmap.width / bitmap.height,
    bbox: alphaBBox(bitmap),
  }, file);
  return toAsset(row);
}

/** Remove para todo o time. */
export async function removeUpload(id: string) {
  const { data, error } = await supabase.from(TABLE).delete().eq('id', id).select('path');
  if (error) throw error;
  const paths = (data as { path: string }[]).map((r) => r.path);
  if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
}

// ---- Uploads antigos (IndexedDB), só para a migração acima ----

interface LegacyUpload extends Omit<UploadRow, 'path'> {
  blob: Blob;
}

function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('gerador-pack', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('uploads', { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function loadLegacyUploads(): Promise<LegacyUpload[]> {
  try {
    const d = await db();
    return await new Promise<LegacyUpload[]>((resolve, reject) => {
      const req = d.transaction('uploads').objectStore('uploads').getAll();
      req.onsuccess = () => resolve(req.result as LegacyUpload[]);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

async function deleteLegacyUpload(id: string) {
  try {
    const d = await db();
    d.transaction('uploads', 'readwrite').objectStore('uploads').delete(id);
  } catch {
    /* ignore */
  }
}

function alphaBBox(img: ImageBitmap): Rect4 {
  const max = 400;
  const k = Math.min(1, max / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * k)), h = Math.max(1, Math.round(img.height * k));
  const c = new OffscreenCanvas(w, h);
  const ctx = c.getContext('2d')!;
  ctx.drawImage(img, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (d[(y * w + x) * 4 + 3] > 10) {
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return [0, 0, 1, 1];
  return [x0 / w, y0 / h, (x1 + 1) / w, (y1 + 1) / h];
}
