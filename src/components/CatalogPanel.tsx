import { useMemo, useRef, useState } from 'react';
import type { Asset, ItemType } from '../types';
import { PRODUCT_LINES } from '../catalog';
import { DEFAULT_UPLOAD_GROUP } from '../storage';

interface Props {
  assets: Asset[];
  inPack: Set<string>;
  onAdd: (a: Asset) => void;
  onUpload: (file: File, label: string, kind: 'produto' | 'brinde', type: ItemType, category: string) => Promise<void>;
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
  { value: 'bolsa', label: 'Bolsa / ecobag / necessaire' },
  { value: 'chapeu', label: 'Viseira / boné (vai na frente)' },
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
      // uploads podem criar uma linha nova: vai depois das do Figma
      const lines = [...new Set([...PRODUCT_LINES, ...ofTab.map((a) => a.line)])].filter((l) => ofTab.some((a) => a.line === l));
      return ['Todos', ...lines];
    }
    const objs = [...new Set(ofTab.map((a) => a.props.Objeto))].sort((x, y) => x.localeCompare(y, 'pt'));
    return ['Todos', ...objs];
  }, [ofTab, tab]);

  /** Tipo dos brindes do Figma com esse objeto, para já vir escolhido no upload. */
  const giftType = (objeto: string) =>
    tab === 'brinde' ? ofTab.find((a) => !a.custom && a.props.Objeto === objeto)?.type : undefined;

  const groups = useMemo(() => {
    const q = norm(query.trim());
    const list = ofTab.filter((a) => {
      if (!showBacks && isBack(a)) return false;
      if (filter !== 'Todos' && (tab === 'produto' ? a.line !== filter : a.props.Objeto !== filter)) return false;
      return !q || norm(a.label).includes(q);
    });
    const map = new Map<string, Asset[]>();
    for (const a of list) {
      const g = tab === 'produto' ? `${a.line} ${a.props.Produto ?? a.props.Tamanho ?? ''}`.trim() : a.props.Objeto;
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
                  {/* mesmo modo CORS do canvas, para o cache da miniatura servir à exportação */}
                  <img src={a.thumb} alt="" loading="lazy" crossOrigin="anonymous" />
                  <span>{cardTitle(a)}</span>
                  {a.custom && (
                    <span className="card-remove" role="button" title="Remover upload (para todo o time)"
                      onClick={(e) => { e.stopPropagation(); if (confirm(`Remover "${a.label}"? Ele some do catálogo de todo o time.`)) onRemoveUpload(a); }}>×</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        ))}
        {!groups.length && <p className="muted pad">Nada encontrado.</p>}
      </div>
      <UploadBox tab={tab} file={uploading} setFile={setUploading} onUpload={onUpload}
        groups={chips.slice(1)} initialGroup={filter !== 'Todos' ? filter : tab === 'produto' ? PRODUCT_LINES[0] : ''}
        typeOf={giftType} />
    </aside>
  );
}

function UploadBox({ tab, file, setFile, onUpload, groups, initialGroup, typeOf }: {
  tab: Tab; file: File | null; setFile: (f: File | null) => void;
  onUpload: Props['onUpload'];
  /** objetos (brindes) ou linhas (produtos) já existentes, sugeridos no campo de grupo */
  groups: string[];
  initialGroup: string;
  typeOf: (group: string) => ItemType | undefined;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [label, setLabel] = useState('');
  const [group, setGroup] = useState('');
  const [type, setType] = useState<ItemType>(tab === 'produto' ? 'pote' : 'outro');
  const [busy, setBusy] = useState(false);

  /** "caneca" entra no grupo "Caneca" que já existe, em vez de criar outro */
  const existing = (g: string) => groups.find((x) => norm(x) === norm(g.trim()));
  const pickGroup = (g: string) => {
    setGroup(g);
    const match = existing(g);
    const t = match && typeOf(match);
    if (t) setType(t);
  };

  if (!file) {
    return (
      <div className="upload">
        <input ref={inputRef} type="file" accept="image/png,image/webp" hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) {
              setFile(f);
              setLabel(f.name.replace(/\.[^.]+$/, ''));
              setType(tab === 'produto' ? 'pote' : 'outro');
              pickGroup(initialGroup);
            }
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
      try {
        await onUpload(file, label || file.name, tab, type, existing(group) ?? (group.trim() || DEFAULT_UPLOAD_GROUP));
        setFile(null);
      }
      catch { /* erro já avisado; o formulário fica aberto para tentar de novo */ }
      finally { setBusy(false); }
    }}>
      <p className="muted small">PNG com fundo transparente. Entra no catálogo de todo o time.</p>
      <input className="search" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Nome" />
      <input className="search" list="upload-groups" value={group} onChange={(e) => pickGroup(e.target.value)}
        placeholder={tab === 'produto' ? 'Linha (ex.: SuperCoffee)' : 'Objeto (ex.: Caneca, Garrafa)'}
        title="Escolha um grupo existente ou digite um novo" />
      <datalist id="upload-groups">
        {groups.map((g) => <option key={g} value={g} />)}
      </datalist>
      <select value={type} onChange={(e) => setType(e.target.value as ItemType)}>
        {UPLOAD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
      </select>
      <div className="row">
        <button type="button" className="btn ghost" onClick={() => setFile(null)}>Cancelar</button>
        <button className="btn" disabled={busy}>{busy ? 'Enviando…' : `Adicionar como ${tab === 'produto' ? 'produto' : 'brinde'}`}</button>
      </div>
    </form>
  );
}
