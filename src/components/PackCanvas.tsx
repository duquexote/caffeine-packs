import { useEffect, useMemo, useRef, useState } from 'react';
import type { Asset, Format, FormatAdjust, ItemAdjust, Pack, Placement } from '../types';
import {
  DEFAULT_ADJUST, DEFAULT_FORMAT_ADJUST, itemCorners, layoutPack, scaleItems, selectionBase, selectionCorners,
} from '../layout';
import { HANDLE_SIZE, SELECTION_PAD, drawPlacements, hitTest, onImageLoad } from '../render';

interface Props {
  format: Format;
  pack: Pack;
  assets: Map<string, Asset>;
  sizeOverride: (a: Asset) => number;
  background: string;
  selection: string[];
  onSelect: (uids: string[]) => void;
  onAdjustItems: (adjs: Record<string, ItemAdjust>, push: boolean) => void;
  onAdjustFormat: (fa: FormatAdjust, push: boolean) => void;
  onExport: () => void;
  exporting: boolean;
  /** fração da altura da janela que o canvas pode ocupar */
  maxHeightFraction: number;
}

type Pt = { x: number; y: number };
type Box = { x0: number; y0: number; x1: number; y1: number };

type Drag =
  | {
    kind: 'move'; x0: number; y0: number; moved: boolean;
    /** ajustes de partida dos itens arrastados (a seleção inteira) */
    start: Record<string, ItemAdjust>; s: number;
    /** clique sem arrastar num item de uma seleção múltipla: a seleção vira só ele */
    only?: string;
  }
  | {
    kind: 'resize'; x0: number; y0: number; moved: boolean;
    /** pack e itens selecionados no início do arraste */
    pack: Pack; sel: Placement[]; s: number;
    /** ponta oposta à puxada: fica parada */
    fixed: Pt;
  }
  | { kind: 'marquee'; x0: number; y0: number; moved: boolean; base: string[] }
  | { kind: 'pan'; x0: number; y0: number; moved: boolean; start: FormatAdjust };

export function PackCanvas(p: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(600);
  const [hover, setHover] = useState<string | null>(null);
  const [handleCursor, setHandleCursor] = useState<string | null>(null);
  const [marquee, setMarquee] = useState<Box | null>(null);
  const [tick, setTick] = useState(0);
  const drag = useRef<Drag | null>(null);

  const { placements, t } = useMemo(
    () => layoutPack(p.pack, p.assets, p.format, p.sizeOverride),
    [p.pack, p.assets, p.format, p.sizeOverride],
  );
  const selPl = useMemo(() => placements.filter((pl) => p.selection.includes(pl.uid)), [placements, p.selection]);
  const fa = p.pack.formatAdjust[p.format.id] ?? DEFAULT_FORMAT_ADJUST;

  useEffect(() => onImageLoad(() => setTick((n) => n + 1)), []);

  // largura disponível, limitada pela altura da janela para os formatos caberem juntos na tela
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      const maxH = Math.max(220, (window.innerHeight - 56) * p.maxHeightFraction);
      setWidth(Math.max(200, Math.min(el.clientWidth, maxH * (p.format.width / p.format.height))));
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('resize', measure);
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); };
  }, [p.format, p.maxHeightFraction]);

  const k = width / p.format.width; // px de tela por unidade do frame
  const height = p.format.height * k;

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(width * dpr);
    c.height = Math.round(height * dpr);
    const ctx = c.getContext('2d')!;
    drawPlacements(ctx, p.format, placements, { scale: k * dpr, background: p.background, selected: p.selection, hovered: hover });
    if (marquee) {
      // retângulo de seleção (Shift + arrastar no fundo)
      ctx.setTransform(k * dpr, 0, 0, k * dpr, 0, 0);
      ctx.lineWidth = 1 / (k * dpr);
      ctx.strokeStyle = '#C2410C';
      ctx.fillStyle = 'rgba(194,65,12,0.08)';
      ctx.fillRect(marquee.x0, marquee.y0, marquee.x1 - marquee.x0, marquee.y1 - marquee.y0);
      ctx.strokeRect(marquee.x0, marquee.y0, marquee.x1 - marquee.x0, marquee.y1 - marquee.y0);
    }
  }, [placements, width, height, k, p.background, p.selection, hover, marquee, tick, p.format]);

  const toFrame = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / k, y: (e.clientY - r.top) / k };
  };

  /** Alça de redimensionar da seleção sob o ponteiro. */
  const handleAt = (pt: Pt) => {
    if (!selPl.length) return null;
    const corners = selectionCorners(selPl, SELECTION_PAD);
    const i = corners.findIndex((c) => Math.hypot(c.x - pt.x, c.y - pt.y) * k <= HANDLE_SIZE);
    if (i < 0) return null;
    const opp = corners[(i + 2) % 4];
    // cursor na diagonal em que a ponta está de fato (considera giro e espelhamento)
    const cursor = (corners[i].x - opp.x) * (corners[i].y - opp.y) > 0 ? 'nwse-resize' : 'nesw-resize';
    return { i, cursor };
  };

  /** Ponto dentro da caixa de uma seleção múltipla (dá para arrastar o conjunto pelos vãos entre os itens). */
  const inSelectionBox = (pt: Pt) => {
    if (selPl.length < 2) return false;
    const [a, , c] = selectionCorners(selPl, SELECTION_PAD);
    return pt.x >= a.x && pt.x <= c.x && pt.y >= a.y && pt.y <= c.y;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const pt = toFrame(e);
    (e.target as Element).setPointerCapture(e.pointerId);
    const base = { x0: pt.x, y0: pt.y, moved: false };
    const handle = handleAt(pt);
    if (handle) {
      // a ponta oposta (sem a folga do contorno) fica parada
      const fixed = selectionCorners(selPl)[(handle.i + 2) % 4];
      drag.current = { kind: 'resize', ...base, pack: p.pack, sel: selPl, s: t.s, fixed };
      return;
    }
    // Shift (ou Ctrl/Cmd) + clique põe ou tira o item da seleção; no fundo, Shift + arrastar seleciona em área
    const toggle = e.shiftKey || e.ctrlKey || e.metaKey;
    const hit = hitTest(placements, pt.x, pt.y);
    let ids: string[];
    let only: string | undefined;
    if (hit && toggle) {
      if (p.selection.includes(hit.uid)) {
        p.onSelect(p.selection.filter((u) => u !== hit.uid));
        return;
      }
      ids = [...p.selection, hit.uid];
    } else if (hit) {
      ids = p.selection.includes(hit.uid) ? p.selection : [hit.uid];
      if (ids.length > 1) only = hit.uid;
    } else if (toggle) {
      drag.current = { kind: 'marquee', ...base, base: p.selection };
      return;
    } else if (inSelectionBox(pt)) {
      ids = p.selection;
    } else {
      p.onSelect([]);
      drag.current = { kind: 'pan', ...base, start: fa };
      return;
    }
    if (ids !== p.selection) p.onSelect(ids);
    const start = Object.fromEntries(ids.map((u) => [u, p.pack.adjust[u] ?? DEFAULT_ADJUST]));
    drag.current = { kind: 'move', ...base, start, s: t.s, only };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const pt = toFrame(e);
    const d = drag.current;
    if (!d) {
      setHandleCursor(handleAt(pt)?.cursor ?? null);
      const hit = hitTest(placements, pt.x, pt.y);
      setHover(hit?.uid ?? null);
      return;
    }
    const dx = pt.x - d.x0, dy = pt.y - d.y0;
    if (!d.moved && Math.hypot(dx, dy) * k < 3) return;
    const push = !d.moved;
    d.moved = true;
    if (d.kind === 'move') {
      // o deslocamento manual é guardado em unidades de referência (vale para todos os formatos)
      p.onAdjustItems(Object.fromEntries(Object.entries(d.start).map(
        ([u, a]) => [u, { ...a, dx: a.dx + dx / d.s, dy: a.dy + dy / d.s }],
      )), push);
    } else if (d.kind === 'resize') {
      // fator: projeção do ponteiro na diagonal (ponta parada → ponto onde a alça foi pega)
      const ax = d.x0 - d.fixed.x, ay = d.y0 - d.fixed.y;
      const f = ((pt.x - d.fixed.x) * ax + (pt.y - d.fixed.y) * ay) / (ax * ax + ay * ay);
      p.onAdjustItems(scaleItems(d.pack, d.sel, d.fixed, f, d.s), push);
    } else if (d.kind === 'marquee') {
      const box = { x0: Math.min(d.x0, pt.x), y0: Math.min(d.y0, pt.y), x1: Math.max(d.x0, pt.x), y1: Math.max(d.y0, pt.y) };
      setMarquee(box);
      // entra todo item que encosta no retângulo
      const hits = placements.filter((pl) => {
        const c = itemCorners(pl);
        const xs = c.map((q) => q.x), ys = c.map((q) => q.y);
        return Math.max(...xs) >= box.x0 && Math.min(...xs) <= box.x1 && Math.max(...ys) >= box.y0 && Math.min(...ys) <= box.y1;
      });
      p.onSelect([...d.base, ...hits.map((pl) => pl.uid).filter((u) => !d.base.includes(u))]);
    } else {
      p.onAdjustFormat({ ...d.start, dx: d.start.dx + dx / p.format.width, dy: d.start.dy + dy / p.format.height }, push);
    }
  };

  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    setMarquee(null);
    if (d?.kind === 'move' && !d.moved && d.only) p.onSelect([d.only]);
  };

  // Ctrl/Alt + roda do mouse redimensiona a seleção (listener nativo para poder usar preventDefault)
  const wheelRef = useRef<(e: WheelEvent) => void>(() => {});
  wheelRef.current = (e: WheelEvent) => {
    if (!(e.ctrlKey || e.altKey) || !selPl.length) return;
    e.preventDefault();
    p.onAdjustItems(scaleItems(p.pack, selPl, selectionBase(selPl), e.deltaY < 0 ? 1.04 : 1 / 1.04, t.s), true);
  };
  useEffect(() => {
    const c = canvasRef.current!;
    const fn = (e: WheelEvent) => wheelRef.current(e);
    c.addEventListener('wheel', fn, { passive: false });
    return () => c.removeEventListener('wheel', fn);
  }, []);

  const setZoom = (zoom: number) => p.onAdjustFormat({ ...fa, zoom }, true);
  const moved = fa.zoom !== 1 || fa.dx !== 0 || fa.dy !== 0;

  return (
    <section className="canvas-card">
      <header className="canvas-head">
        <div>
          <strong>{p.format.label}</strong>
          <span className="muted"> {p.format.width}×{p.format.height}</span>
        </div>
        <div className="canvas-tools">
          <button className="icon-btn" title="Diminuir composição" onClick={() => setZoom(Math.max(0.5, +(fa.zoom - 0.05).toFixed(2)))}>−</button>
          <span className="zoom-label">{Math.round(fa.zoom * 100)}%</span>
          <button className="icon-btn" title="Aumentar composição" onClick={() => setZoom(Math.min(2, +(fa.zoom + 0.05).toFixed(2)))}>+</button>
          {moved && (
            <button className="link-btn" onClick={() => p.onAdjustFormat(DEFAULT_FORMAT_ADJUST, true)}>Recentralizar</button>
          )}
          <button className="btn small" onClick={p.onExport} disabled={p.exporting || !p.pack.items.length}>Baixar WebP</button>
        </div>
      </header>
      <div ref={wrapRef} className="canvas-area">
      <div className={'canvas-wrap' + (p.background === 'transparent' ? ' checker' : '')} style={{ width, height }}>
        <canvas
          ref={canvasRef}
          style={{ width, height, cursor: handleCursor ?? (hover ? 'grab' : 'default') }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={() => { setHover(null); setHandleCursor(null); }}
        />
        {!p.pack.items.length && <div className="canvas-empty">Escolha produtos e brindes no catálogo ao lado</div>}
      </div>
      </div>
    </section>
  );
}
