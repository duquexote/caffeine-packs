import { useMemo, useRef, useState } from 'react';
import type { Asset, ItemType } from '../types';
import { PRODUCT_LINES } from '../catalog';

interface Props {
  assets: Asset[];
  inPack: Set<string>;
  onAdd: (a: Asset) => void;
  onUpload: (file: File, label: string, kind: 'produto' | 'brinde', type: ItemType) => Promise<void>;
  onRemoveUpload: (a: Asset) => void;
}

type Tab = 'produto' | 'brinde';

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const isBack = (a: Asset) => ['Verso', 'Lado'].includes(a.props['Posição']);

const UPLOAD_TYPES: { value: ItemType; label: string }[] = [
  { value: 'pote', label: 'Pote / lata' },
  { value: 'togo', label: 'To go / pequeno' },
  { value: 'caneca', label: 'Caneca' },
  { value: 'mixer', label: 'Mixer (em pé, fino)' },
  { value: 'copo', label: 'Copo / garrafa' },
  { value: 'leque', label: 'Leque de sachês' },
  { value: 'acessorio', label: 'Bolsa / necessaire / boné' },
  { value: 'outro', label: 'Outro' },
];

export function CatalogPanel({ assets, inPack, onAdd, onUpload, onRemoveUpload }: Props) {
  const [tab, setTab] = useState<Tab>('produto');
  const [filter, setFilter] = useState<string>('Todos');
  const [query, setQuery] = useState('');
  const [showBacks, setShowBacks] = useState(false);
  const [uploading, setUploading] = useState<File | null>(null);

  const ofTab = useMemo(() => assets.filter((a) => a.kind === tab), [assets, tab]);

  const chips = useMemo(() => {
    if (tab === 'produto') {
      const lines = PRODUCT_LINES.filter((l) => ofTab.some((a) => a.line === l));
      if (ofTab.some((a) => a.custom)) lines.push('Meus uploads');
      return ['Todos', ...lines];
    }
    const objs = [...new Set(ofTab.filter((a) => !a.custom).map((a) => a.props.Objeto))].sort((x, y) => x.localeCompare(y, 'pt'));
    if (ofTab.some((a) => a.custom)) objs.push('Meus uploads');
    return ['Todos', ...objs];
  }, [ofTab, tab]);

  const groups = useMemo(() => {
    const q = norm(query.trim());
    const list = ofTab.filter((a) => {
      if (!showBacks && isBack(a)) return false;
      if (filter !== 'Todos') {
        if (filter === 'Meus uploads') { if (!a.custom) return false; }
        else if (tab === 'produto' ? a.line !== filter : a.props.Objeto !== filter) return false;
      }
      return !q || norm(a.label).includes(q);
    });
    const map = new Map<string, Asset[]>();
    for (const a of list) {
      const g = a.custom ? 'Meus uploads'
        : tab === 'produto' ? `${a.line} ${a.props.Produto ?? a.props.Tamanho ?? ''}`.trim()
        : a.props.Objeto;
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(a);
    }
    return [...map.entries()];
  }, [ofTab, filter, query, showBacks, tab]);

  const cardTitle = (a: Asset) => {
    if (a.custom) return a.label;
    if (a.kind === 'brinde') return a.props.Modelo + (a.props.Position !== 'Default' ? ` · ${a.props.Position}` : '');
    return (a.props.Sabor && a.props.Sabor !== 'Sem sabor' ? a.props.Sabor : a.props.Produto ?? a.label)
      + (isBack(a) ? ` · ${a.props['Posição']}` : '');
  };

  return (
    <aside className="panel catalog">
      <div className="tabs">
        <button className={tab === 'produto' ? 'active' : ''} onClick={() => { setTab('produto'); setFilter('Todos'); }}>Produtos</button>
        <button className={tab === 'brinde' ? 'active' : ''} onClick={() => { setTab('brinde'); setFilter('Todos'); }}>Brindes</button>
      </div>
      <div className="catalog-tools">
        <input className="search" placeholder="Buscar sabor, modelo…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="chips">
          {chips.map((c) => (
            <button key={c} className={'chip' + (filter === c ? ' active' : '')} onClick={() => setFilter(c)}>{c}</button>
          ))}
        </div>
        {tab === 'produto' && (
          <label className="check">
            <input type="checkbox" checked={showBacks} onChange={(e) => setShowBacks(e.target.checked)} /> Mostrar verso/lado
          </label>
        )}
      </div>
      <div className="catalog-list">
        {groups.map(([g, list]) => (
          <div key={g} className="group">
            <h4>{g}</h4>
            <div className="grid">
              {list.map((a) => (
                <button key={a.id} className={'card' + (inPack.has(a.id) ? ' in-pack' : '')} onClick={() => onAdd(a)} title={`Adicionar ${a.label}`}>
                  <img src={a.thumb} alt="" loading="lazy" />
                  <span>{cardTitle(a)}</span>
                  {a.custom && (
                    <span className="card-remove" role="button" title="Remover upload"
                      onClick={(e) => { e.stopPropagation(); if (confirm(`Remover "${a.label}" dos uploads?`)) onRemoveUpload(a); }}>×</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        ))}
        {!groups.length && <p className="muted pad">Nada encontrado.</p>}
      </div>
      <UploadBox tab={tab} file={uploading} setFile={setUploading} onUpload={onUpload} />
    </aside>
  );
}

function UploadBox({ tab, file, setFile, onUpload }: {
  tab: Tab; file: File | null; setFile: (f: File | null) => void;
  onUpload: Props['onUpload'];
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [label, setLabel] = useState('');
  const [type, setType] = useState<ItemType>(tab === 'produto' ? 'pote' : 'outro');
  const [busy, setBusy] = useState(false);

  if (!file) {
    return (
      <div className="upload">
        <input ref={inputRef} type="file" accept="image/png,image/webp" hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) { setFile(f); setLabel(f.name.replace(/\.[^.]+$/, '')); setType(tab === 'produto' ? 'pote' : 'outro'); }
            e.target.value = '';
          }} />
        <button className="btn ghost full" onClick={() => inputRef.current?.click()}>+ Enviar PNG próprio</button>
      </div>
    );
  }
  return (
    <form className="upload form" onSubmit={async (e) => {
      e.preventDefault();
      setBusy(true);
      try { await onUpload(file, label || file.name, tab, type); setFile(null); } finally { setBusy(false); }
    }}>
      <p className="muted small">PNG com fundo transparente. Fica salvo neste navegador.</p>
      <input className="search" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Nome" />
      <select value={type} onChange={(e) => setType(e.target.value as ItemType)}>
        {UPLOAD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
      </select>
      <div className="row">
        <button type="button" className="btn ghost" onClick={() => setFile(null)}>Cancelar</button>
        <button className="btn" disabled={busy}>Adicionar como {tab === 'produto' ? 'produto' : 'brinde'}</button>
      </div>
    </form>
  );
}
