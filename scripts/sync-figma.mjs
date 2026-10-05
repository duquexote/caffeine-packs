// Baixa do Figma (API REST) as variantes que ainda não estão em figma/raw.
//
// Uso:
//   FIGMA_TOKEN=xxxx npm run sync:figma            -> baixa só as que faltam
//   FIGMA_TOKEN=xxxx npm run sync:figma -- --all   -> baixa tudo de novo
// Depois rode "npm run catalog" para gerar os WebPs e o catálogo.
//
// O token é pessoal: Figma > Settings > Security > Personal access tokens (escopo "File content: read").
// Para adicionar produtos novos, inclua as variantes em scripts/make-manifest.mjs e rode "node scripts/make-manifest.mjs".
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const FILE_KEY = 'mzNzzSXRny3O1kxJYZmVg3'; // Packs-de-Campanha
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const token = process.env.FIGMA_TOKEN;
if (!token) {
  console.error('Defina FIGMA_TOKEN com um token pessoal do Figma (Settings > Security > Personal access tokens).');
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(join(root, 'figma/manifest.json'), 'utf8'));
const rawDir = join(root, 'figma/raw');
mkdirSync(rawDir, { recursive: true });
const all = process.argv.includes('--all');
const fileFor = (id) => join(rawDir, id.replace(':', '-') + '.png');
// 204:237 é o leque (retângulo com imagem), tratado à parte em build-catalog
const todo = manifest.filter((m) => m.nodeId !== '204:237' && (all || !existsSync(fileFor(m.nodeId))));
console.log(`${todo.length} variantes para baixar`);

const api = async (path) => {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch('https://api.figma.com/v1' + path, { headers: { 'X-Figma-Token': token } });
    if (res.status === 429) {
      const wait = Number(res.headers.get('retry-after') ?? 30);
      console.log(`limite da API, aguardando ${wait}s…`);
      await new Promise((r) => setTimeout(r, wait * 1000));
      continue;
    }
    if (!res.ok) throw new Error(`Figma API ${res.status}: ${await res.text()}`);
    return res.json();
  }
  throw new Error('Figma API: muitas tentativas');
};

const failed = [];
for (let i = 0; i < todo.length; i += 10) {
  const batch = todo.slice(i, i + 10);
  const ids = batch.map((m) => m.nodeId).join(',');
  const { images = {}, err } = await api(`/images/${FILE_KEY}?ids=${encodeURIComponent(ids)}&format=png&scale=1`);
  if (err) console.warn('aviso:', err);
  for (const m of batch) {
    const url = images[m.nodeId];
    if (!url) { failed.push(m.nodeId); continue; }
    const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
    if (buf.length < 15000) { failed.push(m.nodeId + ' (vazio no Figma)'); continue; }
    writeFileSync(fileFor(m.nodeId), buf);
    process.stdout.write('.');
  }
}
console.log(`\nok. ${todo.length - failed.length} baixadas.`);
if (failed.length) console.log('sem imagem:', failed.join(', '));
console.log('Agora rode: npm run catalog');
