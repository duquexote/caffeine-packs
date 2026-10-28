import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Asset, Format, FormatAdjust, ItemAdjust, ItemType, Pack, PackLayout } from './types';
import { BUILTIN_ASSETS, shapeKey, slugify, variantSlug } from './catalog';
import {
  DEFAULT_ADJUST, DEFAULT_LAYOUT, FORMATS, defaultVisualHeight, giftOrder, layoutPack, scaleItems, selectionBase,
} from './layout';
import { downloadBlob, isImageBackground, renderPackBlob, zipFiles } from './render';
import {
  DEFAULT_PREFS, addBackground, addUpload, deleteSavedPack, deleteSize, loadBackgrounds, loadCurrent, loadPacks,
  loadPrefs, loadSizes, loadUploads, removeBackground, removeUpload, saveCurrent, savePacks, savePrefs, saveSizes,
  type BackgroundImage, type Prefs,
} from './storage';
import { usePackHistory } from './usePackHistory';
import { CatalogPanel } from './components/CatalogPanel';
import { PackCanvas } from './components/PackCanvas';
import { PackPanel } from './components/PackPanel';

const uid = () => Math.random().toString(36).slice(2, 10);

function examplePack(): Pack {
  const pick = (nodeId: string) => BUILTIN_ASSETS.find((a) => a.nodeId === nodeId)?.id;
  const ids = ['204:640', '2:43', '204:237', '177:2313', '177:2314'].map(pick).filter(Boolean) as string[];
  return {
    id: uid(), name: 'exemplo-always-on', items: ids.map((assetId) => ({ uid: uid(), assetId })),
    adjust: {}, formatAdjust: {}, updatedAt: Date.now(),
  };
}

const blankPack = (): Pack => ({ id: uid(), name: 'novo-pack', items: [], adjust: {}, formatAdjust: {}, updatedAt: Date.now() });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const kb = (n: number) => `${Math.max(1, Math.round(n / 1024))} KB`;

export default function App() {
  const [uploads, setUploads] = useState<Asset[]>([]);
  const [uploadsLoaded, setUploadsLoaded] = useState(false);
  const [backgrounds, setBackgrounds] = useState<BackgroundImage[]>([]);
  const allAssets = useMemo(() => [...BUILTIN_ASSETS, ...uploads], [uploads]);
  const assetMap = useMemo(() => new Map(allAssets.map((a) => [a.id, a])), [allAssets]);

  const { pack, update, checkpoint, replace, undo, redo, canUndo, canRedo } = usePackHistory(() => loadCurrent() ?? examplePack());
  const [selection, setSelection] = useState<string[]>([]);
  // itens selecionados que ainda estão no pack (somem ao remover ou desfazer)
  const selected = useMemo(() => selection.filter((u) => pack.items.some((it) => it.uid === u)), [selection, pack.items]);
  const [saved, setSaved] = useState<Pack[]>([]);
  const [prefs, setPrefsState] = useState<Prefs>(loadPrefs);
  const [sizes, setSizes] = useState<Record<string, number>>({});
  const [exporting, setExporting] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; error?: boolean } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  /** Aviso para falhas do Supabase (uso: `.catch(warn('...'))`). */
  const warn = (msg: string) => () => setToast({ msg, error: true });

  // uploads, packs salvos, tamanhos padrão e fundos são do time inteiro (Supabase)
  useEffect(() => {
    loadUploads().then(setUploads).catch(warn('Não foi possível carregar os uploads do time (Supabase)'))
      .finally(() => setUploadsLoaded(true));
    loadPacks().then(setSaved).catch(warn('Não foi possível carregar os packs salvos (Supabase)'));
    loadSizes().then(setSizes).catch(warn('Não foi possível carregar os tamanhos padrão (Supabase)'));
    loadBackgrounds().then((list) => {
      setBackgrounds(list);
      // o fundo escolhido foi removido por alguém do time: volta para a cor padrão
      const p = loadPrefs();
      if (isImageBackground(p.background) && !list.some((b) => b.url === p.background)) setPrefs({ ...p, background: DEFAULT_PREFS.background });
    }).catch(warn('Não foi possível carregar os fundos do time (Supabase)'));
  }, []);
  useEffect(() => { saveCurrent(pack); }, [pack]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.error ? 6000 : 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const setPrefs = (p: Prefs) => { setPrefsState(p); savePrefs(p); };

  /** Envia uma imagem de fundo para o time e já usa ela. */
  const uploadBackground = async (file: File) => {
    try {
      const bg = await addBackground(file);
      setBackgrounds((b) => [...b, bg]);
      setPrefs({ ...prefs, background: bg.url });
    } catch (e) {
      setToast({ msg: 'Falha ao enviar o fundo: ' + (e instanceof Error ? e.message : 'erro desconhecido'), error: true });
    }
  };
  const deleteBackground = (bg: BackgroundImage) => {
    if (!confirm('Remover este fundo? Ele some para todo o time.')) return;
    removeBackground(bg.name)
      .then(() => {
        setBackgrounds((b) => b.filter((x) => x.name !== bg.name));
        if (prefs.background === bg.url) setPrefs({ ...prefs, background: DEFAULT_PREFS.background });
      })
      .catch(warn('Não foi possível remover o fundo'));
  };
  const sizeOverride = useCallback((a: Asset) => sizes[shapeKey(a)] ?? 1, [sizes]);

  // ---- edição do pack ----

  const addAsset = (asset: Asset) => {
    const item = { uid: uid(), assetId: asset.id };
    update((p) => {
      const items = [...p.items];
      if (asset.kind === 'produto') {
        // como no Figma: o maior produto fica na frente (à esquerda, ou à direita junto aos brindes);
        // os menores vão para trás
        const size = (a: Asset) => defaultVisualHeight(a) * sizeOverride(a);
        const frontRight = p.layout?.depth === 'direita';
        let idx = -1;
        let last = -1;
        items.forEach((it, i) => {
          const a = assetMap.get(it.assetId);
          if (a?.kind !== 'produto') return;
          last = i;
          if (idx < 0 && (frontRight ? size(a) > size(asset) : size(a) < size(asset))) idx = i;
        });
        items.splice(idx >= 0 ? idx : last + 1, 0, item);
      } else {
        let idx = items.length;
        for (let i = 0; i < items.length; i++) {
          const a = assetMap.get(items[i].assetId);
          if (a && a.kind !== 'produto' && giftOrder(a) > giftOrder(asset)) { idx = i; break; }
        }
        items.splice(idx, 0, item);
      }
      return { ...p, items };
    });
    setSelection([item.uid]);
  };

  /** Mais uma unidade do mesmo item, logo ao lado (kits com várias latas). */
  const duplicateItem = (itemUid: string) => {
    const copy = { uid: uid(), assetId: '' };
    update((p) => {
      const i = p.items.findIndex((it) => it.uid === itemUid);
      if (i < 0) return p;
      copy.assetId = p.items[i].assetId;
      const items = [...p.items];
      items.splice(i + 1, 0, copy);
      return { ...p, items };
    });
    setSelection([copy.uid]);
  };

  /** Ao trocar o lado da lata da frente, espelha a ordem dos produtos para a mesma lata continuar na frente. */
  const setLayout = (patch: Partial<PackLayout>) => update((p) => {
    const cur = { ...DEFAULT_LAYOUT, ...p.layout };
    let items = p.items;
    if (patch.depth && patch.depth !== cur.depth) {
      const isProduct = (assetId: string) => assetMap.get(assetId)?.kind === 'produto';
      const reversed = items.filter((it) => isProduct(it.assetId)).reverse();
      let k = 0;
      items = items.map((it) => (isProduct(it.assetId) ? reversed[k++] : it));
    }
    return { ...p, items, layout: { ...cur, ...patch } };
  });

  const replaceAsset = (itemUid: string, asset: Asset) =>
    update((p) => ({ ...p, items: p.items.map((it) => (it.uid === itemUid ? { ...it, assetId: asset.id } : it)) }));

  const removeItems = (uids: string[]) => {
    update((p) => {
      const adjust = { ...p.adjust };
      for (const u of uids) delete adjust[u];
      return { ...p, items: p.items.filter((it) => !uids.includes(it.uid)), adjust };
    });
    setSelection((s) => s.filter((u) => !uids.includes(u)));
  };

  /** Move dentro do próprio grupo (produtos ou brindes), mudando a ordem da montagem. */
  const moveItem = (itemUid: string, dir: -1 | 1) => update((p) => {
    const items = [...p.items];
    const i = items.findIndex((it) => it.uid === itemUid);
    const kind = assetMap.get(items[i].assetId)?.kind;
    let j = i + dir;
    while (j >= 0 && j < items.length && assetMap.get(items[j].assetId)?.kind !== kind) j += dir;
    if (j < 0 || j >= items.length) return p;
    [items[i], items[j]] = [items[j], items[i]];
    return { ...p, items };
  });

  const adjustItems = (adjs: Record<string, ItemAdjust>, push: boolean) =>
    update((p) => ({ ...p, adjust: { ...p.adjust, ...adjs } }), push);
  const adjustItem = (itemUid: string, adj: ItemAdjust, push: boolean) => adjustItems({ [itemUid]: adj }, push);

  /** Aumenta ou diminui os itens selecionados juntos (um só cresce no lugar; vários, a partir da base do conjunto). */
  const scaleSelected = (k: number) => {
    const { placements, t } = layoutPack(pack, assetMap, FORMATS[0], sizeOverride);
    const sel = placements.filter((pl) => selected.includes(pl.uid));
    if (sel.length) adjustItems(scaleItems(pack, sel, selectionBase(sel), k, t.s), true);
  };

  const adjustFormat = (formatId: string) => (fa: FormatAdjust, push: boolean) =>
    update((p) => ({ ...p, formatAdjust: { ...p.formatAdjust, [formatId]: fa } }), push);

  /** Passa o item para frente/trás do vizinho na ordem de camadas. */
  const layer = (itemUid: string, dir: -1 | 1) => {
    const { placements } = layoutPack(pack, assetMap, FORMATS[0], sizeOverride);
    const i = placements.findIndex((pl) => pl.uid === itemUid);
    if (i < 0) return;
    const n1 = placements[i + dir];
    if (!n1) return;
    const n2 = placements[i + 2 * dir];
    const target = n2 ? (n1.z + n2.z) / 2 : n1.z + dir;
    const adj = pack.adjust[itemUid] ?? DEFAULT_ADJUST;
    const base = placements[i].z - adj.z;
    adjustItem(itemUid, { ...adj, z: target - base }, true);
  };

  const saveDefaultSize = (itemUid: string) => {
    const it = pack.items.find((x) => x.uid === itemUid);
    const a = it && assetMap.get(it.assetId);
    if (!it || !a) return;
    const adj = pack.adjust[itemUid] ?? DEFAULT_ADJUST;
    const key = shapeKey(a);
    const value = (sizes[key] ?? 1) * adj.scale;
    setSizes({ ...sizes, [key]: value });
    saveSizes({ [key]: value }).catch(warn('Não foi possível salvar o tamanho padrão'));
    adjustItem(itemUid, { ...adj, scale: 1 }, true);
    setToast({ msg: `Tamanho padrão salvo para ${a.kind === 'produto' && !a.custom ? `${a.line} ${a.props.Tamanho ?? a.props.Produto ?? ''}` : a.label}` });
  };
  const resetDefaultSize = (a: Asset) => {
    const next = { ...sizes };
    delete next[shapeKey(a)];
    setSizes(next);
    deleteSize(shapeKey(a)).catch(warn('Não foi possível restaurar o tamanho padrão'));
  };

  // ---- packs salvos ----

  const savedVersion = saved.find((s) => s.id === pack.id);
  const isSaved = !!savedVersion && savedVersion.updatedAt === pack.updatedAt;
  const savePack = async () => {
    const p = pack;
    try {
      await savePacks([p]);
      setSaved((s) => [p, ...s.filter((x) => x.id !== p.id)]);
      setToast({ msg: `Pack "${p.name}" salvo para o time` });
    } catch {
      setToast({ msg: `Não foi possível salvar "${p.name}"`, error: true });
    }
  };
  const toggleMenu = () => {
    // ao abrir, busca os packs que o time salvou desde que a página carregou
    if (!menuOpen) loadPacks().then(setSaved).catch(warn('Não foi possível atualizar os packs salvos'));
    setMenuOpen(!menuOpen);
  };
  const openPack = (p: Pack) => { replace(p); setSelection([]); setMenuOpen(false); };
  const deletePack = (p: Pack) => {
    if (!confirm(`Excluir o pack "${p.name}"? Ele some para todo o time.`)) return;
    deleteSavedPack(p.id)
      .then(() => setSaved((s) => s.filter((x) => x.id !== p.id)))
      .catch(warn(`Não foi possível excluir "${p.name}"`));
  };
  const duplicatePack = () => {
    replace({ ...pack, id: uid(), name: pack.name + '-copia', updatedAt: Date.now() });
    setToast({ msg: 'Cópia criada (ainda não salva)' });
  };
  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ packs: saved, sizes }, null, 2)], { type: 'application/json' });
    downloadBlob(blob, 'packs.json');
  };
  const importInput = useRef<HTMLInputElement>(null);
  const importJson = async (file: File) => {
    let data: { packs?: Pack[]; sizes?: Record<string, number> };
    try {
      data = JSON.parse(await file.text());
    } catch {
      setToast({ msg: 'Arquivo inválido', error: true });
      return;
    }
    const incoming = data.packs ?? [];
    const importedSizes = data.sizes;
    try {
      if (incoming.length) await savePacks(incoming);
      if (importedSizes) await saveSizes(importedSizes);
    } catch {
      setToast({ msg: 'Não foi possível importar para o Supabase', error: true });
      return;
    }
    setSaved((s) => [...incoming, ...s.filter((x) => !incoming.some((p) => p.id === x.id))]);
    if (importedSizes) setSizes((s) => ({ ...s, ...importedSizes }));
    setToast({ msg: `${incoming.length} pack(s) importado(s) para o time` });
  };

  // ---- exportação ----

  const slug = slugify(pack.name) || 'pack';
  const exportOpts = { scale: prefs.scale, quality: prefs.quality, background: prefs.background, sizeOverride };
  const chosenFormats = FORMATS.filter((f) => prefs.formats.includes(f.id));

  // só depois de carregar os uploads do time (antes disso, os itens enviados ainda não estão no catálogo)
  const missingAssets = uploadsLoaded ? pack.items.filter((it) => !assetMap.has(it.assetId)).length : 0;

  const runExport = async (kind: string, build: () => Promise<{ name: string; blob: Blob }[]>, zipName: string | null) => {
    setExporting(kind);
    try {
      const files = await build();
      if (zipName) {
        const z = await zipFiles(files);
        downloadBlob(z, zipName);
        setToast({ msg: `${zipName} (${files.length} imagens, ${kb(z.size)})` });
      } else {
        for (const f of files) { downloadBlob(f.blob, f.name); await sleep(300); }
        setToast({ msg: files.map((f) => `${f.name} (${kb(f.blob.size)})`).join(' · ') });
      }
    } catch (e) {
      setToast({ msg: e instanceof Error ? e.message : 'Erro ao exportar', error: true });
    } finally {
      setExporting(null);
    }
  };

  const exportPack = (zip: boolean, only?: Format) => {
    const fs = only ? [only] : chosenFormats;
    return runExport(zip ? 'zip' : 'files', async () => {
      const files = [];
      for (const f of fs) files.push({ name: `${slug}${f.suffix}.webp`, blob: await renderPackBlob(pack, assetMap, f, exportOpts) });
      return files;
    }, zip ? `${slug}.zip` : null);
  };

  const exportVariations = (itemUid: string, ids: string[]) => runExport('batch', async () => {
    const files: { name: string; blob: Blob }[] = [];
    const used = new Set<string>();
    for (const id of ids) {
      const a = assetMap.get(id)!;
      let vs = variantSlug(a);
      for (let n = 2; used.has(vs); n++) vs = `${variantSlug(a)}-${n}`;
      used.add(vs);
      const variant: Pack = { ...pack, items: pack.items.map((it) => (it.uid === itemUid ? { ...it, assetId: id } : it)) };
      for (const f of chosenFormats.length ? chosenFormats : [FORMATS[0]]) {
        files.push({ name: `${slug}-${vs}${f.suffix}.webp`, blob: await renderPackBlob(variant, assetMap, f, exportOpts) });
      }
    }
    return files;
  }, `${slug}-variacoes.zip`);

  // ---- atalhos ----

  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  keyRef.current = (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement)?.tagName;
    const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); savePack(); return; }
    if (typing) return;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
    if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
    if (e.key === 'Escape') { setSelection([]); setMenuOpen(false); return; }
    if (mod && e.key.toLowerCase() === 'a') { e.preventDefault(); setSelection(pack.items.map((it) => it.uid)); return; }
    if (!selected.length) return;
    const step = e.shiftKey ? 5 : 1;
    const nudge: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (nudge[e.key]) {
      e.preventDefault();
      const [ndx, ndy] = nudge[e.key];
      adjustItems(Object.fromEntries(selected.map((u) => {
        const adj = pack.adjust[u] ?? DEFAULT_ADJUST;
        return [u, { ...adj, dx: adj.dx + ndx, dy: adj.dy + ndy }];
      })), !e.repeat);
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      removeItems(selected);
    } else if (e.key === ']' && selected.length === 1) layer(selected[0], 1);
    else if (e.key === '[' && selected.length === 1) layer(selected[0], -1);
    else if (e.key === '+' || e.key === '=') scaleSelected(1.04);
    else if (e.key === '-') scaleSelected(1 / 1.04);
  };
  useEffect(() => {
    const fn = (e: KeyboardEvent) => keyRef.current(e);
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, []);

  const inPack = useMemo(() => new Set(pack.items.map((it) => it.assetId)), [pack.items]);
  const visibleFormats = chosenFormats.length ? chosenFormats : [FORMATS[0]];

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">◆</span> Gerador de Packs
        </div>
        <div className="pack-name">
          <input value={pack.name} spellCheck={false}
            onFocus={checkpoint}
            onChange={(e) => update((p) => ({ ...p, name: e.target.value }), false)}
            title="Nome do pack (vira o nome do arquivo)" />
          <span className={'save-state' + (isSaved ? ' ok' : '')}>{isSaved ? 'salvo' : savedVersion ? 'alterado' : 'não salvo'}</span>
        </div>
        <div className="top-actions">
          <button className="icon-btn" onClick={undo} disabled={!canUndo} title="Desfazer (Ctrl+Z)">↶</button>
          <button className="icon-btn" onClick={redo} disabled={!canRedo} title="Refazer (Ctrl+Shift+Z)">↷</button>
          <button className="btn ghost" onClick={() => { replace(blankPack()); setSelection([]); }}>Novo</button>
          <button className="btn ghost" onClick={duplicatePack}>Duplicar</button>
          <button className="btn" onClick={savePack} title="Ctrl+S">Salvar</button>
          <div className="menu-wrap">
            <button className="btn ghost" onClick={toggleMenu}>Packs salvos ({saved.length}) ▾</button>
            {menuOpen && (
              <div className="menu" onMouseLeave={() => setMenuOpen(false)}>
                {!saved.length && <p className="muted small pad">Nenhum pack salvo ainda.</p>}
                {saved.map((s) => (
                  <div key={s.id} className={'menu-item' + (s.id === pack.id ? ' current' : '')}>
                    <button onClick={() => openPack(s)}>
                      <strong>{s.name}</strong>
                      <span className="muted small">{s.items.length} itens · {new Date(s.updatedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span>
                    </button>
                    <button className="icon-btn danger" title="Excluir" onClick={() => deletePack(s)}>×</button>
                  </div>
                ))}
                <div className="menu-foot">
                  <button className="link-btn" onClick={exportJson} disabled={!saved.length}>Exportar .json</button>
                  <button className="link-btn" onClick={() => importInput.current?.click()}>Importar .json</button>
                  <input ref={importInput} type="file" accept="application/json" hidden
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) importJson(f); e.target.value = ''; }} />
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      <CatalogPanel
        assets={allAssets}
        inPack={inPack}
        onAdd={addAsset}
        onUpload={async (file: File, label: string, kind: 'produto' | 'brinde', type: ItemType, category: string) => {
          try {
            const a = await addUpload(file, label, kind, type, category);
            setUploads((u) => [...u, a]);
            addAsset(a);
          } catch (e) {
            setToast({ msg: 'Falha ao enviar: ' + (e instanceof Error ? e.message : 'erro desconhecido'), error: true });
            throw e;
          }
        }}
        onRemoveUpload={(a) => removeUpload(a.id)
          .then(() => setUploads((u) => u.filter((x) => x.id !== a.id)))
          .catch(() => setToast({ msg: `Não foi possível remover "${a.label}"`, error: true }))}
      />

      <main className="stage" onClick={(e) => { if (e.target === e.currentTarget) setSelection([]); }}>
        {missingAssets > 0 && (
          <div className="warning">{missingAssets} item(ns) deste pack não estão no catálogo atual e foram ignorados.</div>
        )}
        {visibleFormats.map((f) => (
          <PackCanvas
            key={f.id}
            format={f}
            pack={pack}
            assets={assetMap}
            sizeOverride={sizeOverride}
            background={prefs.background}
            selection={selected}
            onSelect={setSelection}
            onAdjustItems={adjustItems}
            onAdjustFormat={adjustFormat(f.id)}
            onExport={() => exportPack(false, f)}
            exporting={!!exporting}
            maxHeightFraction={visibleFormats.length > 1 ? 0.36 : 0.7}
          />
        ))}
        <p className="hint muted small">
          Clique num item para selecionar · Shift + clique (ou Shift + arrastar no fundo) seleciona vários · Ctrl + A seleciona todos ·
          arraste para mover · puxe as pontas para redimensionar · arraste o fundo para reposicionar o conjunto neste formato ·
          os ajustes dos itens valem para todos os formatos
        </p>
      </main>

      <PackPanel
        pack={pack}
        assets={assetMap}
        allAssets={allAssets}
        selection={selected}
        onSelect={setSelection}
        onReplace={replaceAsset}
        onMove={moveItem}
        onRemove={(u) => removeItems([u])}
        onRemoveSelection={() => removeItems(selected)}
        onScaleSelection={scaleSelected}
        onDuplicate={duplicateItem}
        onLayout={setLayout}
        onAdjust={adjustItem}
        onAdjustItems={adjustItems}
        onCheckpoint={checkpoint}
        onLayer={layer}
        onSaveDefaultSize={saveDefaultSize}
        hasDefaultSize={(a) => shapeKey(a) in sizes}
        onResetDefaultSize={resetDefaultSize}
        prefs={prefs}
        setPrefs={setPrefs}
        backgrounds={backgrounds}
        onUploadBackground={uploadBackground}
        onRemoveBackground={deleteBackground}
        exporting={exporting}
        onExport={(zip) => exportPack(zip)}
        onExportVariations={exportVariations}
      />

      {toast && <div className={'toast' + (toast.error ? ' error' : '')}>{toast.msg}</div>}
    </div>
  );
}
