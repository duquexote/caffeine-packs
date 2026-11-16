import { useEffect, useMemo, useRef, useState } from 'react';
import type { Asset, Pack } from '../types';
import { FORMATS, layoutPack } from '../layout';
import { drawPlacements, onImageLoad } from '../render';

interface Props {
  packs: Pack[];
  assets: Map<string, Asset>;
  sizeOverride: (a: Asset) => number;
  background: string;
  /** pack em edição (destacado) */
  currentId: string;
  open: boolean;
  onToggle: () => void;
  onOpen: (p: Pack) => void;
  onRefresh: () => void;
}

const THUMB_W = 200;
const when = (t: number) => new Date(t).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

/** Faixa no rodapé com as miniaturas dos packs salvos pelo time. */
export function SavedGallery(p: Props) {
  const [query, setQuery] = useState('');
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? p.packs.filter((s) => s.name.toLowerCase().includes(q)) : p.packs;
  }, [p.packs, query]);

  return (
    <section className={'saved-gallery' + (p.open ? '' : ' closed')}>
      <header className="saved-head">
        <button className="link-btn saved-toggle" onClick={p.onToggle} aria-expanded={p.open}>
          {p.open ? '▾' : '▸'} Packs salvos <span className="muted">({p.packs.length})</span>
        </button>
        {p.open && (
          <>
            <input className="saved-search" type="search" placeholder="Buscar pack…" value={query} onChange={(e) => setQuery(e.target.value)} />
            <button className="link-btn" onClick={p.onRefresh} title="Buscar os packs que o time salvou agora">Atualizar</button>
          </>
        )}
      </header>
      {p.open && (
        <div className="saved-strip">
          {!list.length && <p className="muted small">{p.packs.length ? 'Nenhum pack com esse nome.' : 'Nenhum pack salvo ainda.'}</p>}
          {list.map((s) => (
            <button key={s.id} className={'saved-card' + (s.id === p.currentId ? ' current' : '')} onClick={() => p.onOpen(s)}
              title={s.id === p.currentId ? 'Pack em edição' : `Abrir "${s.name}"`}>
              <Thumb pack={s} assets={p.assets} sizeOverride={p.sizeOverride} background={p.background} />
              <strong>{s.name}</strong>
              <span className="muted small">{s.items.length} itens · {when(s.updatedAt)}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

/** Miniatura do pack no formato Ecommerce (mesmo cálculo do canvas). */
function Thumb(p: { pack: Pack; assets: Map<string, Asset>; sizeOverride: (a: Asset) => number; background: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [tick, setTick] = useState(0);
  const f = FORMATS[0];
  const h = Math.round((THUMB_W * f.height) / f.width);
  useEffect(() => onImageLoad(() => setTick((n) => n + 1)), []);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(THUMB_W * dpr);
    c.height = Math.round(h * dpr);
    const { placements } = layoutPack(p.pack, p.assets, f, p.sizeOverride);
    drawPlacements(c.getContext('2d')!, f, placements, { scale: (THUMB_W / f.width) * dpr, background: p.background });
  }, [p.pack, p.assets, p.sizeOverride, p.background, tick, f, h]);
  return <canvas ref={ref} className={p.background === 'transparent' ? 'checker' : ''} style={{ width: THUMB_W, height: h }} />;
}
