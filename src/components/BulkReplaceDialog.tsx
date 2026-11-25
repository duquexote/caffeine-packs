import { useEffect, useMemo, useState } from 'react';
import type { Asset, Pack } from '../types';
import { Thumb } from './SavedGallery';

interface Props {
  /** packs salvos pelo time (lista buscada ao abrir) */
  packs: Pack[];
  assets: Map<string, Asset>;
  allAssets: Asset[];
  sizeOverride: (a: Asset) => number;
  background: string;
  /** grava os packs trocados; devolve como ficaram */
  onApply: (changed: Pack[]) => Promise<Pack[]>;
  /** volta os packs para como estavam antes da troca */
  onUndo: (previous: Pack[]) => Promise<void>;
  onClose: () => void;
}

const byLabel = (a: Asset, b: Asset) => a.label.localeCompare(b.label, 'pt-BR');
/** Grupo no seletor: objeto do brinde (Caneca, Mixer…) ou linha do produto. */
const groupOf = (a: Asset) => (a.kind === 'brinde' ? a.props.Objeto ?? 'Outros' : a.line);

function grouped(list: Asset[]) {
  const groups = new Map<string, Asset[]>();
  for (const a of [...list].sort(byLabel)) groups.set(groupOf(a), [...(groups.get(groupOf(a)) ?? []), a]);
  return [...groups.entries()].sort(([x], [y]) => x.localeCompare(y, 'pt-BR'));
}

const swap = (p: Pack, from: string, to: string): Pack =>
  ({ ...p, items: p.items.map((it) => (it.assetId === from ? { ...it, assetId: to } : it)) });

/** Troca em massa: nos packs salvos que têm o item X, troca por Y (mantendo posição e ajustes de cada um). */
export function BulkReplaceDialog(p: Props) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [skip, setSkip] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  /** packs como estavam antes da troca (para desfazer) */
  const [done, setDone] = useState<{ previous: Pack[]; label: string } | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) p.onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // itens que aparecem nos packs salvos, com em quantos packs cada um está
  const usage = useMemo(() => {
    const n = new Map<string, number>();
    for (const pk of p.packs) for (const id of new Set(pk.items.map((it) => it.assetId))) n.set(id, (n.get(id) ?? 0) + 1);
    return n;
  }, [p.packs]);
  const used = useMemo(() => [...usage.keys()].map((id) => p.assets.get(id)).filter((a): a is Asset => !!a), [usage, p.assets]);
  const fromAsset = p.assets.get(from);
  const toAsset = p.assets.get(to);
  const targets = useMemo(() => (fromAsset ? p.allAssets.filter((a) => a.kind === fromAsset.kind && a.id !== fromAsset.id) : []), [fromAsset, p.allAssets]);
  const affected = useMemo(() => p.packs.filter((pk) => pk.items.some((it) => it.assetId === from)), [p.packs, from]);
  const chosen = affected.filter((pk) => !skip.has(pk.id));

  const pickFrom = (id: string) => {
    setFrom(id);
    setSkip(new Set());
    // o destino precisa ser do mesmo tipo (brinde por brinde, produto por produto)
    if (p.assets.get(to)?.kind !== p.assets.get(id)?.kind || to === id) setTo('');
  };

  const apply = async () => {
    if (!fromAsset || !toAsset || !chosen.length || busy) return;
    setBusy(true);
    try {
      await p.onApply(chosen.map((pk) => swap(pk, from, to)));
      setDone({ previous: chosen, label: `${fromAsset.label} → ${toAsset.label} em ${chosen.length} pack${chosen.length > 1 ? 's' : ''}` });
    } finally {
      setBusy(false);
    }
  };
  const undo = async () => {
    if (!done || busy) return;
    setBusy(true);
    try {
      await p.onUndo(done.previous);
      p.onClose();
    } finally {
      setBusy(false);
    }
  };

  const option = (a: Asset, count?: number) => (
    <option key={a.id} value={a.id}>{a.label}{count ? ` (${count} pack${count > 1 ? 's' : ''})` : ''}</option>
  );

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) p.onClose(); }}>
      <div className="modal wide" role="dialog" aria-modal="true" aria-labelledby="bulk-title">
        <h3 id="bulk-title">Trocar item em massa</h3>
        {done ? (
          <>
            <p>Pronto: {done.label}. Os packs já estão atualizados para o time.</p>
            <div className="modal-actions">
              <button className="btn ghost" onClick={undo} disabled={busy}>{busy ? 'Desfazendo…' : 'Desfazer troca'}</button>
              <button className="btn primary" onClick={p.onClose} disabled={busy}>Fechar</button>
            </div>
          </>
        ) : (
          <>
            <p className="muted">Nos packs salvos que têm o item escolhido, ele é trocado pelo outro, no mesmo lugar e com os mesmos ajustes.</p>
            <div className="bulk-pick">
              <label>
                <span>Trocar</span>
                <div className="bulk-select">
                  {fromAsset && <img src={fromAsset.thumb} alt="" crossOrigin="anonymous" />}
                  <select value={from} onChange={(e) => pickFrom(e.target.value)}>
                    <option value="">Escolha o item…</option>
                    {(['brinde', 'produto'] as const).map((kind) => grouped(used.filter((a) => a.kind === kind)).map(([g, list]) => (
                      <optgroup key={kind + g} label={`${kind === 'brinde' ? 'Brinde' : 'Produto'} · ${g}`}>
                        {list.map((a) => option(a, usage.get(a.id)))}
                      </optgroup>
                    )))}
                  </select>
                </div>
              </label>
              <span className="bulk-arrow">→</span>
              <label>
                <span>Por</span>
                <div className="bulk-select">
                  {toAsset && <img src={toAsset.thumb} alt="" crossOrigin="anonymous" />}
                  <select value={to} onChange={(e) => setTo(e.target.value)} disabled={!fromAsset}>
                    <option value="">{fromAsset ? `Escolha o ${fromAsset.kind === 'brinde' ? 'brinde' : 'produto'} novo…` : 'Escolha primeiro o item a trocar'}</option>
                    {grouped(targets).map(([g, list]) => (
                      <optgroup key={g} label={g}>{list.map((a) => option(a))}</optgroup>
                    ))}
                  </select>
                </div>
              </label>
            </div>

            {fromAsset && (
              <>
                <div className="row">
                  <strong className="small">{affected.length} pack{affected.length === 1 ? '' : 's'} com “{fromAsset.label}”</strong>
                  {affected.length > 1 && (
                    <>
                      <button className="link-btn" onClick={() => setSkip(new Set())}>todos</button>
                      <button className="link-btn" onClick={() => setSkip(new Set(affected.map((pk) => pk.id)))}>nenhum</button>
                    </>
                  )}
                </div>
                <div className="bulk-list">
                  {affected.map((pk) => (
                    <label key={pk.id} className={'bulk-item' + (skip.has(pk.id) ? ' off' : '')}>
                      <input type="checkbox" checked={!skip.has(pk.id)} onChange={(e) => {
                        const n = new Set(skip);
                        if (e.target.checked) n.delete(pk.id); else n.add(pk.id);
                        setSkip(n);
                      }} />
                      {/* com o destino escolhido, a miniatura já mostra como o pack vai ficar */}
                      <Thumb pack={toAsset && !skip.has(pk.id) ? swap(pk, from, to) : pk} assets={p.assets} sizeOverride={p.sizeOverride} background={p.background} />
                      <span className="small">{pk.name}</span>
                    </label>
                  ))}
                </div>
              </>
            )}

            <p className="muted small">Os packs salvos são do time: a troca vale para todo mundo (dá para desfazer logo depois).</p>
            <div className="modal-actions">
              <button className="btn ghost" onClick={p.onClose} disabled={busy}>Cancelar</button>
              <button className="btn primary" onClick={apply} disabled={busy || !toAsset || !chosen.length}>
                {busy ? 'Trocando…' : `Trocar em ${chosen.length} pack${chosen.length === 1 ? '' : 's'}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
