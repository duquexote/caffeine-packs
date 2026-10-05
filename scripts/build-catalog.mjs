// Converte os PNGs exportados do Figma (figma/raw) em WebP recortados + miniaturas
// e gera src/data/catalog.json com a caixa visível (bbox) de cada item.
//
// Cada variante do Figma é um quadro 1600x1600 com o produto dentro. Guardamos só a área
// visível (recortada) e a posição dela dentro do quadro (bbox normalizado 0..1), assim o app
// continua posicionando os itens pelo quadro, exatamente como as instâncias no Figma.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(root, 'figma/manifest.json'), 'utf8'));
const outItems = join(root, 'public/assets/items');
const outThumbs = join(root, 'public/assets/thumbs');
mkdirSync(outItems, { recursive: true });
mkdirSync(outThumbs, { recursive: true });
mkdirSync(join(root, 'src/data'), { recursive: true });

const ITEM_SCALE = 0.75; // quadro 1600 -> 1200px: suficiente para exportar até 4x
const ALPHA_MIN = 10;

const slugify = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/\+/g, '-plus').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function itemType(line, props) {
  if (line.startsWith('Brinde')) {
    const o = props.Objeto;
    if (o === 'Sachês' && props.Modelo === 'Always On Leque') return 'leque';
    if (o === 'Caneca') return 'caneca';
    if (o === 'Mixer') return 'mixer';
    if (['Sachês', 'Samplings', 'Kopenhagen'].includes(o)) return 'saches';
    if (['Copo', 'Copo Termico', 'Garrafa', 'Coqueteleira'].includes(o)) return 'copo';
    if (['Boné', 'Viseira'].includes(o)) return 'chapeu';
    if (['Necessaire', 'Bolsa', 'Ecobag', 'Mala', 'Multipack', 'Casaco'].includes(o)) return 'bolsa';
    return 'outro';
  }
  const t = props.Tamanho;
  if (t === 'To go' || t === 'Travel Size') return 'togo';
  if (t === 'Sachê' || t === '60g') return 'sache';
  return 'pote';
}

function label(line, props) {
  if (line.startsWith('Brinde')) {
    const pos = props.Position && props.Position !== 'Default' ? ` · ${props.Position}` : '';
    return `${props.Objeto} ${props.Modelo}${pos}`;
  }
  const parts = [line];
  if (props.Produto) parts.push(props.Produto);
  if (props.Tamanho) parts.push(props.Tamanho);
  if (props.Sabor && props.Sabor !== 'Sem sabor') parts.push(props.Sabor);
  const pos = props['Posição'] && props['Posição'] !== 'Frontal' ? ` · ${props['Posição']}` : '';
  return parts.join(' ') + pos;
}

async function alphaBBox(img) {
  const { data, info } = await img.clone().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  // conta pixels visíveis por coluna/linha e ignora pixels soltos (artefatos nas bordas de alguns PNGs)
  const cols = new Uint32Array(width), rows = new Uint32Array(height);
  for (let y = 0; y < height; y++) {
    const row = y * width * channels;
    for (let x = 0; x < width; x++) {
      if (data[row + x * channels + 3] > ALPHA_MIN) { cols[x]++; rows[y]++; }
    }
  }
  const MIN_PX = 3;
  const first = (arr) => arr.findIndex((c) => c >= MIN_PX);
  const last = (arr) => arr.length - 1 - [...arr].reverse().findIndex((c) => c >= MIN_PX);
  const x0 = first(cols), y0 = first(rows);
  if (x0 < 0 || y0 < 0) return null;
  return { x0, y0, x1: last(cols) + 1, y1: last(rows) + 1, width, height };
}

/**
 * Alguns componentes (ex.: do DS Army UI) vêm com fundo branco sólido. Remove o branco
 * conectado às bordas e "buracos" grandes de branco puro (ex.: dentro da alça da ecobag),
 * suavizando a borda para não deixar halo branco.
 */
async function removeWhiteBackground(img) {
  const { data, info } = await img.clone().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;
  const minC = (i) => Math.min(data[i], data[i + 1], data[i + 2]);
  const bg = new Uint8Array(W * H);
  const fill = (seeds, test) => {
    const stack = [...seeds];
    for (const s of seeds) bg[s] = 1;
    while (stack.length) {
      const p = stack.pop();
      const x = p % W, y = (p / W) | 0;
      for (const q of [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, y > 0 ? p - W : -1, y < H - 1 ? p + W : -1]) {
        if (q >= 0 && !bg[q] && test(q * 4)) { bg[q] = 1; stack.push(q); }
      }
    }
  };
  const nearWhite = (i) => minC(i) >= 245;
  const seeds = [];
  for (let x = 0; x < W; x++) for (const y of [0, H - 1]) if (nearWhite((y * W + x) * 4)) seeds.push(y * W + x);
  for (let y = 0; y < H; y++) for (const x of [0, W - 1]) if (nearWhite((y * W + x) * 4)) seeds.push(y * W + x);
  fill(seeds, nearWhite);
  // regiões fechadas de branco puro com área grande também são fundo
  const seen = new Uint8Array(W * H);
  for (let p = 0; p < W * H; p++) {
    if (bg[p] || seen[p] || minC(p * 4) < 253) continue;
    const region = [p];
    seen[p] = 1;
    for (let k = 0; k < region.length; k++) {
      const r = region[k], x = r % W, y = (r / W) | 0;
      for (const q of [x > 0 ? r - 1 : -1, x < W - 1 ? r + 1 : -1, y > 0 ? r - W : -1, y < H - 1 ? r + W : -1]) {
        if (q >= 0 && !seen[q] && !bg[q] && minC(q * 4) >= 253) { seen[q] = 1; region.push(q); }
      }
    }
    if (region.length > 1500) for (const r of region) bg[r] = 1;
  }
  for (let p = 0; p < W * H; p++) {
    const i = p * 4;
    if (bg[p]) { data[i + 3] = 0; continue; }
    // borda: pixel encostado no fundo e claro -> converte o branco em transparência
    const x = p % W, y = (p / W) | 0;
    const edge = (x > 0 && bg[p - 1]) || (x < W - 1 && bg[p + 1]) || (y > 0 && bg[p - W]) || (y < H - 1 && bg[p + W]);
    if (!edge) continue;
    const m = minC(i);
    if (m < 200) continue;
    const a = Math.max(0.15, 1 - (m - 200) / 55);
    for (let c = 0; c < 3; c++) data[i + c] = Math.max(0, Math.min(255, Math.round((data[i + c] - 255 * (1 - a)) / a)));
    data[i + 3] = Math.round(255 * a);
  }
  return sharp(data, { raw: { width: W, height: H, channels: 4 } }).png();
}

async function hasOpaqueWhiteCorners(img) {
  const { data, info } = await img.clone().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;
  return [0, W - 1, (H - 1) * W, H * W - 1].every((p) => data[p * 4 + 3] === 255 && Math.min(data[p * 4], data[p * 4 + 1], data[p * 4 + 2]) >= 250);
}

async function sourceFor(entry) {
  if (entry.nodeId === '204:237') {
    // Leque de sachês: imagem original girada 22.8° (rotação do Figma é anti-horária)
    const p = join(root, 'figma/leque/raw1');
    if (!existsSync(p)) return null;
    const buf = await sharp(p).rotate(-22.8, { background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    return sharp(buf);
  }
  const p = join(root, 'figma/raw', entry.nodeId.replace(':', '-') + '.png');
  if (!existsSync(p)) return null;
  const img = sharp(p);
  if (await hasOpaqueWhiteCorners(img)) {
    console.log('\nfundo branco removido:', entry.nodeId, label(entry.line, entry.props));
    return sharp(await (await removeWhiteBackground(img)).toBuffer());
  }
  return img;
}

const catalog = [];
const missing = [];
for (const entry of manifest) {
  const img = await sourceFor(entry);
  if (!img) { missing.push(entry); continue; }
  const bb = await alphaBBox(img);
  if (!bb) { console.warn('vazio, ignorado:', entry.nodeId, label(entry.line, entry.props)); continue; }

  const id = slugify(`${entry.line} ${Object.values(entry.props).join(' ')}`);
  const pad = 2;
  const left = Math.max(0, bb.x0 - pad), top = Math.max(0, bb.y0 - pad);
  const cw = Math.min(bb.width, bb.x1 + pad) - left, ch = Math.min(bb.height, bb.y1 + pad) - top;
  // Itens que não são quadros 1600 (leque) usam escala proporcional ao tamanho original
  const scale = bb.width >= 1600 ? ITEM_SCALE : 1;
  const cropped = img.clone().extract({ left, top, width: cw, height: ch });

  await cropped.clone()
    .resize(Math.round(cw * scale), Math.round(ch * scale), { kernel: 'lanczos3' })
    .webp({ quality: 90, alphaQuality: 100, effort: 5 })
    .toFile(join(outItems, id + '.webp'));
  await cropped.clone()
    .resize(220, 220, { fit: 'inside' })
    .webp({ quality: 80, alphaQuality: 90 })
    .toFile(join(outThumbs, id + '.webp'));

  catalog.push({
    id,
    nodeId: entry.nodeId,
    line: entry.line,
    kind: entry.kind,
    type: itemType(entry.line, entry.props),
    props: entry.props,
    label: label(entry.line, entry.props),
    src: `assets/items/${id}.webp`,
    thumb: `assets/thumbs/${id}.webp`,
    // proporção do quadro (largura/altura) e área recortada dentro dele, normalizada 0..1
    aspect: +(bb.width / bb.height).toFixed(5),
    crop: [left / bb.width, top / bb.height, (left + cw) / bb.width, (top + ch) / bb.height].map((v) => +v.toFixed(5)),
    bbox: [bb.x0 / bb.width, bb.y0 / bb.height, bb.x1 / bb.width, bb.y1 / bb.height].map((v) => +v.toFixed(5)),
  });
  process.stdout.write('.');
}

writeFileSync(join(root, 'src/data/catalog.json'), JSON.stringify(catalog, null, 1));
console.log(`\n${catalog.length} itens no catálogo, ${missing.length} sem imagem (rode "npm run sync:figma" para baixar).`);
if (missing.length) writeFileSync(join(root, 'figma/missing.json'), JSON.stringify(missing.map((m) => m.nodeId), null, 1));
