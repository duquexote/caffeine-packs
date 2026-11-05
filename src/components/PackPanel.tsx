import { useEffect, useMemo, useState } from 'react';
import type { Asset, ItemAdjust, Pack, PackLayout } from '../types';
import { FORMATS, DEFAULT_ADJUST, DEFAULT_LAYOUT, triangleFront } from '../layout';
import { PROP_LABEL, batchSiblings, optionsFor, propKeys, slugify, switchVariant } from '../catalog';
import { isImageBackground } from '../render';
import type { BackgroundImage, Prefs } from '../storage';

interface Props {
  pack: Pack;
  assets: Map<string, Asset>;
  allAssets: Asset[];
  /** altura do produto na montagem (com o tamanho padrão do time) */
  productSize: (a: Asset) => number;
  selection: string[];
  onSelect: (uids: string[]) => void;
  onReplace: (uid: string, asset: Asset) => void;
  onMove: (uid: string, dir: -1 | 1) => void;
  onRemove: (uid: string) => void;
  onRemoveSelection: () => void;
  /** aumenta (k > 1) ou diminui os itens selecionados juntos */
  onScaleSelection: (k: number) => void;
  onDuplicate: (uid: string) => void;
  onLayout: (patch: Partial<PackLayout>) => void;
  onAdjust: (uid: string, adj: ItemAdjust, push: boolean) => void;
  onAdjustItems: (adjs: Record<string, ItemAdjust>, push: boolean) => void;
  onCheckpoint: () => void;
  onLayer: (uid: string, dir: -1 | 1) => void;
  onSaveDefaultSize: (uid: string) => void;
  hasDefaultSize: (a: Asset) => boolean;
  onResetDefaultSize: (a: Asset) => void;
  prefs: Prefs;
  setPrefs: (p: Prefs) => void;
  /** fundos em imagem enviados pelo time */
  backgrounds: BackgroundImage[];
  onUploadBackground: (file: File) => Promise<void>;
  onRemoveBackground: (bg: BackgroundImage) => void;
  exporting: string | null;
  onExport: (zip: boolean) => void;
  onExportVariations: (uid: string, assetIds: string[]) => void;
}

const BACKGROUNDS = [
  { value: '#F4F0E9', label: 'Bege' },
  { value: '#FFFFFF', label: 'Branco' },
  { value: 'transparent', label: 'Transparente' },
];

const isAdjusted = (adj: ItemAdjust | undefined) => !!adj && !!(adj.dx || adj.dy || adj.scale !== 1 || adj.rot || adj.flip || adj.z);

export function PackPanel(p: Props) {
  // como no canvas, itens fora do catálogo ficam de fora (uploads do time ainda carregando ou removidos)
  const known = p.pack.items.filter((it) => p.assets.has(it.assetId));
  const products = known.filter((it) => p.assets.get(it.assetId)!.kind === 'produto');
  const gifts = known.filter((it) => p.assets.get(it.assetId)!.kind !== 'produto');
  const slug = slugify(p.pack.name) || 'pack';
  const chosenFormats = FORMATS.filter((f) => p.prefs.formats.includes(f.id));
  const [uploadingBg, setUploadingBg] = useState(false);

  const layout = { ...DEFAULT_LAYOUT, ...p.pack.layout };
  const triangle = layout.depth === 'centro';
  const twoRows = !triangle && (layout.rows === 2 || (layout.rows === 'auto' && products.length >= 6));
  const backCount = twoRows ? Math.ceil(products.length / 2) : products.length;
  const inFront = triangle && products.length ? triangleFront(products.map((it) => p.productSize(p.assets.get(it.assetId)!))) : [];

  /** Onde a lata fica na montagem, para orientar a ordem da lista. */
  const productHint = (i: number) => {
    if (triangle) {
      if (inFront[i]) return 'na frente, embaixo';
      const j = inFront.slice(0, i).filter((f) => !f).length, n = inFront.filter((f) => !f).length;
      return Math.abs(j - (n - 1) / 2) <= 0.5 ? 'lata da frente (centro)' : `${j + 1}ª da esquerda`;
    }
    const inBack = i < backCount;
    const n = inBack ? backCount : products.length - backCount;
    const j = inBack ? i : i - backCount;
    const front = layout.depth === 'esquerda' ? j === 0 : j === n - 1;
    const row = twoRows ? (inBack ? 'fileira de trás · ' : 'fileira da frente · ') : '';
    return row + (front ? 'lata da frente' : `${j + 1}ª da esquerda`);
  };

  const renderGroup = (title: string, list: typeof products) => (
    <div className="pack-group">
      <h4>{title} <span className="muted">({list.length})</span></h4>
      {title === 'Produtos' && list.length > 1 && (
        <div className="layout-opts">
          <label>
            <span>Lata da frente</span>
            <div className="segmented">
              <button className={layout.depth === 'esquerda' ? 'active' : ''} onClick={() => p.onLayout({ depth: 'esquerda' })}
                title="Maior lata à esquerda, as outras atrás (banners de campanha)">Esquerda</button>
              <button className={layout.depth === 'direita' ? 'active' : ''} onClick={() => p.onLayout({ depth: 'direita' })}
                title="Latas crescendo até os brindes (kits Black Friday)">Junto aos brindes</button>
              <button className={triangle ? 'active' : ''} onClick={() => p.onLayout({ depth: 'centro' })}
                title="Triângulo: a lata do meio na frente e as outras atrás dos dois lados; produtos menores vão na frente, embaixo">Centro</button>
            </div>
          </label>
          {!triangle && (
            <label>
              <span>Fileiras</span>
              <div className="segmented">
                {(['auto', 1, 2] as const).map((r) => (
                  <button key={r} className={layout.rows === r ? 'active' : ''} onClick={() => p.onLayout({ rows: r })}
                    title={r === 'auto' ? 'Duas fileiras a partir de 6 produtos' : undefined}>{r === 'auto' ? 'Auto' : r}</button>
                ))}
              </div>
            </label>
          )}
        </div>
      )}
      {!list.length && <p className="muted small">Nenhum. Clique no catálogo para adicionar.</p>}
      {list.map((it, i) => {
        const a = p.assets.get(it.assetId)!;
        const sel = p.selection.includes(it.uid);
        // Shift (ou Ctrl/Cmd) + clique põe ou tira o item da seleção
        const select = (e: React.MouseEvent) => p.onSelect(!(e.shiftKey || e.ctrlKey || e.metaKey) ? [it.uid]
          : sel ? p.selection.filter((u) => u !== it.uid) : [...p.selection, it.uid]);
        return (
          <div key={it.uid} className={'pack-item' + (sel ? ' selected' : '')} onClick={select}>
            <div className="pack-item-head">
              <img src={a.thumb} alt="" />
              <div className="pack-item-title">
                <strong>{a.custom ? a.label : a.kind === 'produto' ? a.line : a.props.Objeto}</strong>
                {title === 'Produtos' && list.length > 1 && <span className="muted small">{productHint(i)}</span>}
              </div>
              <div className="pack-item-actions" onClick={(e) => e.stopPropagation()}>
                <button className="icon-btn" title="Mover para a esquerda" disabled={i === 0} onClick={() => p.onMove(it.uid, -1)}>←</button>
                <button className="icon-btn" title="Mover para a direita" disabled={i === list.length - 1} onClick={() => p.onMove(it.uid, 1)}>→</button>
                <button className="icon-btn" title="Duplicar (mais uma unidade)" onClick={() => p.onDuplicate(it.uid)}>⧉</button>
                <button className="icon-btn danger" title="Remover" onClick={() => p.onRemove(it.uid)}>×</button>
              </div>
            </div>
            {!a.custom && (
              <div className="variant-selects" onClick={(e) => e.stopPropagation()}>
                {propKeys(a).map((key) => {
                  const opts = optionsFor(a, key, p.allAssets);
                  if (opts.length < 2) return null;
                  return (
                    <label key={key}>
                      <span>{PROP_LABEL[key]}</span>
                      <select value={a.props[key]} onChange={(e) => {
                        const next = switchVariant(a, key, e.target.value, p.allAssets);
                        if (next) p.onReplace(it.uid, next);
                      }}>
                        {opts.map((o) => (
                          <option key={o.value} value={o.value}>{o.value}{o.exact ? '' : ' *'}</option>
                        ))}
                      </select>
                    </label>
                  );
                })}
              </div>
            )}
            {sel && p.selection.length === 1 && <Inspector {...p} uid={it.uid} asset={a} />}
          </div>
        );
      })}
    </div>
  );

  return (
    <aside className="panel pack-panel">
      <div className="panel-scroll">
        {p.selection.length > 1 && (
          <div className="multi-box">
            <div className="row">
              <strong>{p.selection.length} itens selecionados</strong>
              <button className="link-btn" onClick={() => p.onSelect([])}>limpar</button>
            </div>
            <div className="row wrap">
              <span className="muted small">Tamanho</span>
              <button className="icon-btn" title="Diminuir juntos (atalho: −)" onClick={() => p.onScaleSelection(1 / 1.1)}>−</button>
              <button className="icon-btn" title="Aumentar juntos (atalho: +)" onClick={() => p.onScaleSelection(1.1)}>+</button>
              <button className="btn small ghost" disabled={!p.selection.some((u) => isAdjusted(p.pack.adjust[u]))}
                onClick={() => p.onAdjustItems(Object.fromEntries(p.selection.map((u) => [u, DEFAULT_ADJUST])), true)}>
                Resetar posição
              </button>
              <button className="btn small ghost" onClick={p.onRemoveSelection}>Remover {p.selection.length}</button>
            </div>
            <p className="muted small">
              Arraste no canvas para mover juntos · puxe as pontas ou use Ctrl + roda para redimensionar juntos ·
              Shift + clique põe ou tira itens da seleção
            </p>
          </div>
        )}
        {renderGroup('Produtos', products)}
        {renderGroup('Brindes', gifts)}

        <div className="export-box">
          <h4>Exportar</h4>
          <div className="field">
            <span>Formatos</span>
            <div className="row wrap">
              {FORMATS.map((f) => (
                <label key={f.id} className="check">
                  <input type="checkbox" checked={p.prefs.formats.includes(f.id)} onChange={(e) => {
                    const formats = e.target.checked ? [...p.prefs.formats, f.id] : p.prefs.formats.filter((x) => x !== f.id);
                    p.setPrefs({ ...p.prefs, formats: FORMATS.filter((x) => formats.includes(x.id)).map((x) => x.id) });
                  }} /> {f.label}
                </label>
              ))}
            </div>
          </div>
          <div className="field">
            <span>Fundo</span>
            <div className="row wrap">
              {BACKGROUNDS.map((b) => (
                <button key={b.value} className={'swatch' + (p.prefs.background === b.value ? ' active' : '')}
                  onClick={() => p.setPrefs({ ...p.prefs, background: b.value })} title={b.label}>
                  <i className={b.value === 'transparent' ? 'checker' : ''} style={b.value === 'transparent' ? undefined : { background: b.value }} />
                  {b.label}
                </button>
              ))}
              <label className="swatch" title="Outra cor">
                <input type="color" value={p.prefs.background.startsWith('#') ? p.prefs.background : '#F4F0E9'}
                  onChange={(e) => p.setPrefs({ ...p.prefs, background: e.target.value.toUpperCase() })} />
                Outra
              </label>
              {p.backgrounds.map((b) => (
                <span key={b.name} className="bg-swatch">
                  <button className={'swatch' + (p.prefs.background === b.url ? ' active' : '')} title="Usar esta imagem de fundo"
                    onClick={() => p.setPrefs({ ...p.prefs, background: b.url })}>
                    <img src={b.url} alt="" crossOrigin="anonymous" />
                  </button>
                  <button className="bg-remove" title="Remover (some para todo o time)" onClick={() => p.onRemoveBackground(b)}>×</button>
                </span>
              ))}
              <label className={'swatch' + (uploadingBg ? ' busy' : '')} title="Enviar uma imagem de fundo (JPG, PNG ou WebP); fica disponível para todo o time">
                <input type="file" accept="image/png,image/jpeg,image/webp" hidden disabled={uploadingBg} onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (!file) return;
                  setUploadingBg(true);
                  p.onUploadBackground(file).finally(() => setUploadingBg(false));
                }} />
                {uploadingBg ? 'Enviando…' : '+ Imagem'}
              </label>
            </div>
            {isImageBackground(p.prefs.background) && (
              <span className="muted small">A imagem cobre o quadro inteiro de cada formato, centralizada.</span>
            )}
          </div>
          <div className="field">
            <span>Resolução</span>
            <div className="segmented">
              {[1, 2, 3, 4].map((s) => (
                <button key={s} className={p.prefs.scale === s ? 'active' : ''} onClick={() => p.setPrefs({ ...p.prefs, scale: s })}>{s}x</button>
              ))}
            </div>
            <span className="muted small">
              {chosenFormats.map((f) => `${f.width * p.prefs.scale}×${f.height * p.prefs.scale}`).join(' · ') || 'nenhum formato'}
            </span>
          </div>
          <div className="field">
            <span>Qualidade WebP: {p.prefs.quality === 1 ? '100 (sem perda)' : Math.round(p.prefs.quality * 100)}</span>
            <input type="range" min={0.6} max={1} step={0.01} value={p.prefs.quality}
              onChange={(e) => p.setPrefs({ ...p.prefs, quality: +e.target.value })} />
          </div>
          <div className="filenames">
            {chosenFormats.map((f) => <code key={f.id}>{slug}{f.suffix}.webp</code>)}
          </div>
          <div className="row">
            <button className="btn primary grow" disabled={!!p.exporting || !p.pack.items.length || !chosenFormats.length} onClick={() => p.onExport(false)}>
              {p.exporting === 'files' ? 'Gerando…' : `Baixar ${chosenFormats.length > 1 ? `${chosenFormats.length} WebPs` : 'WebP'}`}
            </button>
            <button className="btn ghost" disabled={!!p.exporting || !p.pack.items.length || !chosenFormats.length} onClick={() => p.onExport(true)}>
              {p.exporting === 'zip' ? '…' : '.zip'}
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}

function Inspector(p: Props & { uid: string; asset: Asset }) {
  const adj = p.pack.adjust[p.uid] ?? DEFAULT_ADJUST;
  const set = (patch: Partial<ItemAdjust>, push = true) => p.onAdjust(p.uid, { ...adj, ...patch }, push);
  const siblings = useMemo(() => batchSiblings(p.asset, p.allAssets), [p.asset, p.allAssets]);
  const [batch, setBatch] = useState<Set<string>>(new Set());
  const [showBatch, setShowBatch] = useState(false);
  useEffect(() => { setBatch(new Set([p.asset.id])); }, [p.uid, p.asset.id]);
  const changed = isAdjusted(adj);

  // sliders: ponto de histórico ao começar a arrastar, depois atualiza sem empilhar
  const slider = (key: 'scale' | 'rot', min: number, max: number, step: number, fmt: (v: number) => string) => (
    <label className="slider">
      <span>{key === 'scale' ? 'Tamanho' : 'Rotação'} <b>{fmt(adj[key])}</b></span>
      <input type="range" min={min} max={max} step={step} value={adj[key]}
        onPointerDown={p.onCheckpoint}
        onKeyDown={p.onCheckpoint}
        onChange={(e) => set({ [key]: +e.target.value }, false)}
        onDoubleClick={() => set({ [key]: key === 'scale' ? 1 : 0 })} />
    </label>
  );

  return (
    <div className="inspector" onClick={(e) => e.stopPropagation()}>
      {slider('scale', 0.3, 2.5, 0.01, (v) => `${Math.round(v * 100)}%`)}
      {slider('rot', -45, 45, 0.5, (v) => `${v.toFixed(1)}°`)}
      <div className="row wrap">
        <label className="check"><input type="checkbox" checked={adj.flip} onChange={(e) => set({ flip: e.target.checked })} /> Espelhar</label>
        <button className="btn small ghost" onClick={() => p.onLayer(p.uid, -1)} title="Atalho: [">Para trás</button>
        <button className="btn small ghost" onClick={() => p.onLayer(p.uid, 1)} title="Atalho: ]">Para frente</button>
      </div>
      <div className="row wrap">
        <button className="btn small ghost" disabled={!changed} onClick={() => p.onAdjust(p.uid, DEFAULT_ADJUST, true)}>Resetar posição</button>
        <button className="btn small ghost" disabled={adj.scale === 1} onClick={() => p.onSaveDefaultSize(p.uid)}
          title="Usa este tamanho sempre que este produto for adicionado (todos os sabores)">Salvar tamanho como padrão</button>
        {p.hasDefaultSize(p.asset) && (
          <button className="link-btn" onClick={() => p.onResetDefaultSize(p.asset)}>voltar ao tamanho original</button>
        )}
      </div>
      <p className="muted small">Arraste no canvas para mover · Ctrl + roda para redimensionar · setas ajustam fino · Shift + clique seleciona mais itens</p>

      {siblings.length > 1 && (
        <div className="batch">
          <button className="link-btn" onClick={() => setShowBatch(!showBatch)}>
            {showBatch ? '▾' : '▸'} Gerar variações deste item em lote ({siblings.length})
          </button>
          {showBatch && (
            <>
              <div className="row">
                <button className="link-btn" onClick={() => setBatch(new Set(siblings.map((s) => s.id)))}>todos</button>
                <button className="link-btn" onClick={() => setBatch(new Set())}>nenhum</button>
              </div>
              <div className="batch-list">
                {siblings.map((s) => (
                  <label key={s.id} className="batch-item">
                    <input type="checkbox" checked={batch.has(s.id)} onChange={(e) => {
                      const n = new Set(batch);
                      if (e.target.checked) n.add(s.id); else n.delete(s.id);
                      setBatch(n);
                    }} />
                    <img src={s.thumb} alt="" />
                    <span>{s.kind === 'brinde' ? s.props.Modelo : s.props.Sabor ?? s.props.Produto}</span>
                  </label>
                ))}
              </div>
              <button className="btn small primary" disabled={!batch.size || !!p.exporting}
                onClick={() => p.onExportVariations(p.uid, siblings.filter((s) => batch.has(s.id)).map((s) => s.id))}>
                {p.exporting === 'batch' ? 'Gerando…' : `Exportar ${batch.size} variações (.zip)`}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
