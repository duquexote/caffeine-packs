// Renderiza alguns packs com o layout automático (sem navegador) para comparar com o Figma.
// Uso: node scripts/preview-layout.mjs <pasta de saída>
import { readFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { FORMATS, layoutPack } from '../src/layout.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = process.argv[2] ?? join(root, 'preview');
mkdirSync(out, { recursive: true });
const catalog = JSON.parse(readFileSync(join(root, 'src/data/catalog.json'), 'utf8'));
const assets = new Map(catalog.map((a) => [a.id, a]));
const byNode = (n) => catalog.find((a) => a.nodeId === n).id;

const packs = {
  'set-1': ['204:640', '177:2314'],
  'set-2': ['204:640', '204:648', '204:237', '177:2313', '177:2314'],
  'set-3': ['204:640', '2:20', '204:237', '177:2313', '177:2314'],
  'set-4': ['204:640', '2:43', '204:237', '177:2313', '177:2314'],
  'set-6': ['204:640', '14:929', '204:237', '177:2313', '177:2314'],
  'prm-2': ['204:636', '204:653', '177:2313', '177:2314'],
  'tres-produtos': ['204:640', '2:43', '2:20', '204:237', '177:2313', '177:2314'],
};

const SCALE = 3;
for (const [name, nodes] of Object.entries(packs)) {
  const pack = { id: name, name, items: nodes.map((n, i) => ({ uid: 'u' + i, assetId: byNode(n) })), adjust: {}, formatAdjust: {}, updatedAt: 0 };
  for (const f of FORMATS.slice(0, 2)) {
    const { placements } = layoutPack(pack, assets, f);
    const W = f.width * SCALE, H = f.height * SCALE;
    const layers = [];
    for (const p of placements) {
      const [c0, c1, c2, c3] = p.asset.crop;
      const w = Math.round((c2 - c0) * p.w * SCALE), h = Math.round((c3 - c1) * p.h * SCALE);
      let img = await sharp(join(root, 'public', p.asset.src)).resize(w, h).png().toBuffer();
      let left = Math.round((p.x + c0 * p.w) * SCALE), top = Math.round((p.y + c1 * p.h) * SCALE);
      // recorta o que passa do quadro (sharp não aceita camadas fora da imagem)
      const cl = Math.max(0, -left), ct = Math.max(0, -top);
      const cw = Math.min(w - cl, W - left - cl), ch = Math.min(h - ct, H - top - ct);
      if (cw <= 0 || ch <= 0) continue;
      if (cl || ct || cw < w || ch < h) img = await sharp(img).extract({ left: cl, top: ct, width: cw, height: ch }).toBuffer();
      layers.push({ input: img, left: left + cl, top: top + ct });
    }
    await sharp({ create: { width: W, height: H, channels: 4, background: '#F4F0E9' } })
      .composite(layers).png().toFile(join(out, `${name}-${f.id}.png`));
  }
}
console.log('ok', out);
