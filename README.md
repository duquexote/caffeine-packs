# Gerador de Packs

Monta as imagens de packs (produtos + brindes) no mesmo padrão dos packs do Figma
[Packs-de-Campanha](https://www.figma.com/design/mzNzzSXRny3O1kxJYZmVg3/Packs-de-Campanha) e exporta em WebP pronto para subir na Shopify.

## Rodar

```bash
npm install
npm run dev        # abre em http://localhost:5173
```

Deploy: importe o repositório na Vercel. As configurações já estão em `vercel.json` (Vite, `npm ci`,
`npm run build`, saída em `dist`; Node ≥ 22.12). Não há variáveis de ambiente.

Não há servidor próprio nem login. O que é do time inteiro fica no Supabase (SQL em `supabase/schema.sql`; URL e chave
pública em `src/storage.ts`):

- **Packs salvos** (tabela `packs`): **Salvar** deixa o pack disponível para todo mundo em **Packs salvos**;
  excluir remove para todos.
- **Tamanhos padrão** (tabela `pack_sizes`): **Salvar tamanho como padrão** vale para o time inteiro.
- **PNGs enviados** (tabela `pack_uploads` + bucket público `pack-uploads`): entram no catálogo normal, no objeto
  (brindes) ou na linha (produtos) escolhidos no envio.
- **Fundos em imagem** (pasta `fundos/` do mesmo bucket): **Exportar → Fundo → + Imagem** aceita JPG, PNG ou WebP;
  a imagem é reduzida (até 2560 px) e convertida para WebP antes de subir.

O que estava salvo só no navegador antes da integração sobe sozinho na primeira abertura. O pack em edição e as
preferências de exportação continuam no navegador de cada um. **Packs salvos → Exportar .json** serve de backup.

## Como usar

1. **Catálogo (esquerda):** clique em um produto ou brinde para adicionar. O pack se monta sozinho:
   - produtos à esquerda: o maior na frente, os outros atrás, sobrepostos;
   - brindes à direita: leque de sachês atrás, caneca na frente dele, mixer ao lado.
2. **Ajuste fino (canvas):** clique para selecionar, arraste para mover; para redimensionar, puxe uma das 4 pontas do
   item selecionado (a ponta oposta fica parada) ou use Ctrl + roda do mouse.
   Arrastar o fundo reposiciona o conjunto só naquele formato. Os ajustes de item valem para todos os formatos.
   - **Vários itens:** Shift (ou Ctrl) + clique põe ou tira um item da seleção, no canvas ou na lista à direita;
     Shift + arrastar no fundo seleciona em área; `Ctrl+A` seleciona todos. Os selecionados se movem juntos e as
     pontas da caixa do conjunto (ou Ctrl + roda, `+` `-`) aumentam e diminuem todos na mesma proporção.
3. **Pack (direita):** troque sabor/tamanho/modelo pelos seletores (o item mantém a posição), reordene com ← →,
   duplique (⧉) para kits com várias latas, gire, espelhe e mude a camada. **Salvar tamanho como padrão** passa a
   valer para todos os sabores daquele produto.
   - **Lata da frente:** *Esquerda* (padrão dos banners de campanha), *Junto aos brindes* (latas crescendo até os
     brindes, como nos kits Black Friday do DS Army UI) ou *Centro* (triângulo: a lata do meio na frente e as outras
     atrás dos dois lados; produtos bem menores, como o Morning Shot, vão na frente, embaixo, ao lado da do meio).
     Produtos ficam sempre à esquerda e brindes à direita.
   - **Fileiras:** *Auto* usa duas fileiras a partir de 6 produtos (a de trás mais alta, a da frente mais baixa).
4. **Exportar:** escolha formatos (Ecommerce 360×180, Prime 386×257, Prime 380×270, Quadrado 1:1 360×360), fundo
   (cor, transparente ou uma imagem enviada, que cobre o quadro inteiro de cada formato), resolução (1x–4x) e qualidade.
   Na exportação cada item é reduzido com Lanczos3 (como o Figma) e a qualidade 100 grava WebP sem perda, igual ao
   PNG do Figma; abaixo de 100 o arquivo fica bem menor, mas o WebP borra um pouco texto e bordas coloridas. O nome do arquivo vem do nome do pack (`nome.webp`, `nome-PRM.webp`, `nome-1x1.webp`).
5. **Variações em lote:** selecione um item e abra *Gerar variações deste item em lote*. Sai um .zip com o pack em
   cada sabor escolhido, em todos os formatos marcados.

Atalhos: `Ctrl+Z` / `Ctrl+Shift+Z` desfazer/refazer · `Ctrl+S` salvar · `Ctrl+A` seleciona todos ·
setas movem (Shift = 5x) · `[` `]` camada · `+` `-` tamanho · `Delete` remove · `Esc` limpa a seleção.
Com vários itens selecionados, setas, `+` `-` e `Delete` valem para todos.

## Catálogo de imagens

As imagens vêm dos componentes do Figma (`SuperCoffee_PNGs`, `MorningShot_PNGs`, `Koala_PNGs`,
`SuperCoffee_Protein+_PNGs`, `CaffeineLabs_PNGs`, `Brinde_CAFF_PNGs`, `Brindes_CaffeineLabs_PNGs`) e do leque de
sachês dos packs Always On.

- `figma/manifest.json`: lista de todas as variantes (gerada por `scripts/make-manifest.mjs`).
- `figma/raw/`: PNGs 1600×1600 exportados do Figma (fora do git).
- `npm run catalog`: recorta, converte para WebP e gera `public/assets/` + `src/data/catalog.json`.

**Situação atual:** 117 itens no catálogo. 42 variantes ainda não foram baixadas (estão em `figma/missing.json`, junto
com as 8 vazias citadas abaixo): alguns tamanhos de Koala e Morning Shot, Protein+ de lado/verso e brindes menos usados
(bonés, ecobags, multipacks, Haoma, Natal etc.).
Para completar:

```bash
FIGMA_TOKEN=seu_token npm run sync:figma   # token: Figma > Settings > Security > Personal access tokens
npm run catalog
```

Também dá para enviar qualquer PNG transparente pelo botão **+ Enviar PNG próprio** no catálogo (fica disponível
para todo o time).

Variantes que estão vazias no próprio Figma (220g Verso de Original/Choconilla/Paçoca/Beijinho, Caneca ProductPic,
Coqueteleira ProductPic, Copo ProductPic, Necessaire Be Ready) são ignoradas automaticamente.

## Ajustar o layout automático

As regras ficam em `src/layout.ts`:

- `defaultVisualHeight`: altura de cada produto/brinde (SuperCoffee 380g = 124);
- `DEPTH_SCALE`, `DEPTH_LIFT`, `PRODUCT_OVERLAP`: perspectiva e sobreposição dos produtos;
- `FORMATS`: tamanhos e margens de cada formato.

`node scripts/preview-layout.mjs <pasta>` renderiza alguns packs de referência (sem navegador) para comparar com o Figma.
