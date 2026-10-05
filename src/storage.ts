import type { Asset, ItemType, Pack } from './types';

const KEY_PACKS = 'gerador-pack:packs';
const KEY_CURRENT = 'gerador-pack:current';
const KEY_SIZES = 'gerador-pack:sizes';
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

export const loadPacks = () => read<Pack[]>(KEY_PACKS, []);
export const savePacks = (packs: Pack[]) => write(KEY_PACKS, packs);
export const loadCurrent = () => read<Pack | null>(KEY_CURRENT, null);
export const saveCurrent = (p: Pack) => write(KEY_CURRENT, p);

/** Multiplicador de tamanho padrão por "forma" de produto (ver shapeKey). */
export const loadSizes = () => read<Record<string, number>>(KEY_SIZES, {});
export const saveSizes = (s: Record<string, number>) => write(KEY_SIZES, s);

export interface Prefs {
  formats: string[];
  scale: number;
  quality: number;
  background: string;
}
export const DEFAULT_PREFS: Prefs = { formats: ['ecom', 'prime'], scale: 3, quality: 0.9, background: '#F4F0E9' };
export const loadPrefs = () => ({ ...DEFAULT_PREFS, ...read<Partial<Prefs>>(KEY_PREFS, {}) });
export const savePrefs = (p: Prefs) => write(KEY_PREFS, p);

// ---- Imagens enviadas pelo usuário (IndexedDB) ----

interface StoredUpload {
  id: string;
  label: string;
  kind: 'produto' | 'brinde';
  type: ItemType;
  blob: Blob;
  aspect: number;
  bbox: [number, number, number, number];
}

function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('gerador-pack', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('uploads', { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function toAsset(u: StoredUpload): Asset {
  const url = URL.createObjectURL(u.blob);
  return {
    id: u.id, line: 'Meus uploads', kind: u.kind, type: u.type, props: {}, label: u.label,
    src: url, thumb: url, aspect: u.aspect, crop: [0, 0, 1, 1], bbox: u.bbox, custom: true,
  };
}

export async function loadUploads(): Promise<Asset[]> {
  try {
    const d = await db();
    const all = await new Promise<StoredUpload[]>((resolve, reject) => {
      const req = d.transaction('uploads').objectStore('uploads').getAll();
      req.onsuccess = () => resolve(req.result as StoredUpload[]);
      req.onerror = () => reject(req.error);
    });
    return all.map(toAsset);
  } catch {
    return [];
  }
}

export async function addUpload(file: File, label: string, kind: 'produto' | 'brinde', type: ItemType): Promise<Asset> {
  const bitmap = await createImageBitmap(file);
  const bbox = alphaBBox(bitmap);
  const u: StoredUpload = {
    id: 'upload-' + Date.now().toString(36),
    label, kind, type, blob: file,
    aspect: bitmap.width / bitmap.height,
    bbox,
  };
  try {
    const d = await db();
    await new Promise<void>((resolve, reject) => {
      const tx = d.transaction('uploads', 'readwrite');
      tx.objectStore('uploads').put(u);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* sem IndexedDB: o upload vale só nesta sessão */
  }
  return toAsset(u);
}

export async function removeUpload(id: string) {
  try {
    const d = await db();
    d.transaction('uploads', 'readwrite').objectStore('uploads').delete(id);
  } catch {
    /* ignore */
  }
}

function alphaBBox(img: ImageBitmap): [number, number, number, number] {
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
