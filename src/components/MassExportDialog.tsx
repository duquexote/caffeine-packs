import { useEffect, useMemo, useRef, useState } from 'react';
import type { Asset, Pack } from '../types';
import { Thumb } from './SavedGallery';

interface Props {
  packs: Pack[];
  assets: Map<string, Asset>;
  sizeOverride: (a: Asset) => number;
  background: string;
  /** resumo das configurações de exportação usadas (formatos, resolução, arquivo, fundo) */
  settings: string;
  /** quantos formatos estão marcados (0 = nada para exportar) */
  formatCount: number;
  /** gera e baixa o .zip; devolve false se parou ou deu erro */
  onExport: (packs: Pack[], folders: boolean, onProgress: (done: number, total: number) => void, cancelled: () => boolean) => Promise<boolean>;
  onClose: () => void;
}

/** Exportar vários packs salvos de uma vez, num .zip só. */
export function MassExportDialog(p: Props) {
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<Set<string>>(() => new Set(p.packs.map((pk) => pk.id)));
  const [folders, setFolders] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const cancel = useRef(false);
  const busy = !!progress;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) p.onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? p.packs.filter((pk) => pk.name.toLowerCase().includes(q)) : p.packs;
  }, [p.packs, query]);
  const chosen = p.packs.filter((pk) => picked.has(pk.id));
  const images = chosen.length * p.formatCount;

  const setAll = (on: boolean) => {
    const n = new Set(picked);
    for (const pk of shown) if (on) n.add(pk.id); else n.delete(pk.id);
    setPicked(n);
  };
  const run = async () => {
    if (busy || !images) return;
    cancel.current = false;
    setProgress({ done: 0, total: images });
    const ok = await p.onExport(chosen, folders, (done, total) => setProgress({ done, total }), () => cancel.current);
    setProgress(null);
    if (ok) p.onClose();
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) p.onClose(); }}>
      <div className="modal wide" role="dialog" aria-modal="true" aria-labelledby="mass-title">
        <h3 id="mass-title">Exportar packs salvos em massa</h3>
        <p className="muted small">
          Um .zip com cada pack escolhido em todos os formatos marcados em Exportar: {p.settings}.
        </p>
        {!p.formatCount && <p className="warning">Marque ao menos um formato em Exportar (painel da direita).</p>}

        <div className="row wrap">
          <input className="saved-search" type="search" placeholder="Buscar pack…" value={query} disabled={busy}
            onChange={(e) => setQuery(e.target.value)} />
          <button className="link-btn" onClick={() => setAll(true)} disabled={busy}>marcar {query ? 'os encontrados' : 'todos'}</button>
          <button className="link-btn" onClick={() => setAll(false)} disabled={busy}>desmarcar {query ? 'os encontrados' : 'todos'}</button>
          <label className="check small"><input type="checkbox" checked={folders} disabled={busy} onChange={(e) => setFolders(e.target.checked)} /> uma pasta por pack</label>
        </div>
        <div className="bulk-list">
          {!shown.length && <p className="muted small">Nenhum pack com esse nome.</p>}
          {shown.map((pk) => (
            <label key={pk.id} className={'bulk-item' + (picked.has(pk.id) ? '' : ' off')}>
              <input type="checkbox" checked={picked.has(pk.id)} disabled={busy} onChange={(e) => {
                const n = new Set(picked);
                if (e.target.checked) n.add(pk.id); else n.delete(pk.id);
                setPicked(n);
              }} />
              <Thumb pack={pk} assets={p.assets} sizeOverride={p.sizeOverride} background={p.background} />
              <span className="small">{pk.name}</span>
            </label>
          ))}
        </div>

        {progress && (
          <div className="progress">
            <div style={{ width: `${(100 * progress.done) / Math.max(1, progress.total)}%` }} />
            <span className="small">Gerando {progress.done} de {progress.total} imagens…</span>
          </div>
        )}
        <div className="modal-actions">
          {busy ? (
            <button className="btn ghost" onClick={() => { cancel.current = true; }}>Parar</button>
          ) : (
            <button className="btn ghost" onClick={p.onClose}>Cancelar</button>
          )}
          <button className="btn primary" onClick={run} disabled={busy || !images}>
            {busy ? 'Gerando…' : `Baixar .zip (${chosen.length} pack${chosen.length === 1 ? '' : 's'} · ${images} imagens)`}
          </button>
        </div>
      </div>
    </div>
  );
}
