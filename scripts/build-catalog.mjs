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
    if (['Necessaire', 'Bolsa', 'Ecobag', 'Mala', 'Multipack', 'Casaco', 'Boné', 'Viseira', 'Caffeine Army'].includes(o)) return 'acessorio';
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
  let x0 = width, y0 = height, x1 = -1, y1 = -1;
  for (let y = 0; y < height; y++) {
    const row = y * width * channels;
    for (let x = 0; x < width; x++) {
      if (data[row + x * channels + 3] > ALPHA_MIN) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return null;
  return { x0, y0, x1: x1 + 1, y1: y1 + 1, width, height };
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
  return existsSync(p) ? sharp(p) : null;
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
