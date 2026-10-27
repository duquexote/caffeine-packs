import { useEffect, useMemo, useRef, useState } from 'react';
import type { Asset, Format, FormatAdjust, ItemAdjust, Pack } from '../types';
import { DEFAULT_ADJUST, DEFAULT_FORMAT_ADJUST, layoutPack } from '../layout';
import { HANDLE_SIZE, SELECTION_PAD, drawPlacements, hitTest, itemCorners, onImageLoad } from '../render';

interface Props {
  format: Format;
  pack: Pack;
  assets: Map<string, Asset>;
  sizeOverride: (a: Asset) => number;
  background: string;
  selected: string | null;
  onSelect: (uid: string | null) => void;
  onAdjustItem: (uid: string, adj: ItemAdjust, push: boolean) => void;
  onAdjustFormat: (fa: FormatAdjust, push: boolean) => void;
  onExport: () => void;
  exporting: boolean;
  /** fração da altura da janela que o canvas pode ocupar */
  maxHeightFraction: number;
}

type Pt = { x: number; y: number };

type Drag =
  | { kind: 'item'; uid: string; x0: number; y0: number; start: ItemAdjust; s: number; moved: boolean }
  | {
    kind: 'resize'; uid: string; x0: number; y0: number; start: ItemAdjust; s: number; moved: boolean;
    /** ponta oposta à puxada: fica parada */
    fixed: Pt;
    /** quanto a ponta parada se afasta da âncora da escala por unidade de escala (frame) */
    perScale: Pt;
  }
  | { kind: 'pan'; x0: number; y0: number; start: FormatAdjust; moved: boolean };

const MIN_SCALE = 0.2;
const MAX_SCALE = 4;
const clampScale = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));

export function PackCanvas(p: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(600);
  const [hover, setHover] = useState<string | null>(null);
  const [handleCursor, setHandleCursor] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const drag = useRef<Drag | null>(null);

  const { placements, t } = useMemo(
    () => layoutPack(p.pack, p.assets, p.format, p.sizeOverride),
    [p.pack, p.assets, p.format, p.sizeOverride],
  );
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
    drawPlacements(ctx, p.format, placements, { scale: k * dpr, background: p.background, selected: p.selected, hovered: hover });
  }, [placements, width, height, k, p.background, p.selected, hover, tick, p.format]);

  const toFrame = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / k, y: (e.clientY - r.top) / k };
  };

  /** Alça de redimensionar do item selecionado sob o ponteiro. */
  const handleAt = (pt: Pt) => {
    const pl = placements.find((x) => x.uid === p.selected);
    if (!pl) return null;
    const corners = itemCorners(pl, SELECTION_PAD);
    const i = corners.findIndex((c) => Math.hypot(c.x - pt.x, c.y - pt.y) * k <= HANDLE_SIZE);
    if (i < 0) return null;
    const opp = corners[(i + 2) % 4];
    // cursor na diagonal em que a ponta está de fato (considera giro e espelhamento)
    const cursor = (corners[i].x - opp.x) * (corners[i].y - opp.y) > 0 ? 'nwse-resize' : 'nesw-resize';
    return { pl, i, cursor };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const pt = toFrame(e);
    (e.target as Element).setPointerCapture(e.pointerId);
    const handle = handleAt(pt);
    if (handle) {
      const { pl, i } = handle;
      const start = p.pack.adjust[pl.uid] ?? DEFAULT_ADJUST;
      // layoutPack escala o item em torno da base central visível (sem giro): ela é a âncora
      const [b0, , b2, b3] = pl.asset.bbox;
      const anchor = { x: pl.x + ((b0 + b2) / 2) * pl.w, y: pl.y + b3 * pl.h };
      const fixed = itemCorners(pl)[(i + 2) % 4];
      drag.current = {
        kind: 'resize', uid: pl.uid, x0: pt.x, y0: pt.y, start, s: t.s, moved: false, fixed,
        perScale: { x: (fixed.x - anchor.x) / start.scale, y: (fixed.y - anchor.y) / start.scale },
      };
      return;
    }
    const hit = hitTest(placements, pt.x, pt.y);
    if (hit) {
      p.onSelect(hit.uid);
      drag.current = { kind: 'item', uid: hit.uid, x0: pt.x, y0: pt.y, start: p.pack.adjust[hit.uid] ?? DEFAULT_ADJUST, s: t.s, moved: false };
    } else {
      p.onSelect(null);
      drag.current = { kind: 'pan', x0: pt.x, y0: pt.y, start: fa, moved: false };
    }
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
    if (d.kind === 'item') {
      // o deslocamento manual é guardado em unidades de referência (vale para todos os formatos)
      p.onAdjustItem(d.uid, { ...d.start, dx: d.start.dx + dx / d.s, dy: d.start.dy + dy / d.s }, push);
    } else if (d.kind === 'resize') {
      // nova escala: projeção do ponteiro na diagonal (ponta parada → ponto onde a alça foi pega)
      const ax = d.x0 - d.fixed.x, ay = d.y0 - d.fixed.y;
      const f = ((pt.x - d.fixed.x) * ax + (pt.y - d.fixed.y) * ay) / (ax * ax + ay * ay);
      const scale = clampScale(d.start.scale * f);
      // desloca o item para a ponta oposta continuar no mesmo lugar
      const back = (d.start.scale - scale) / d.s;
      p.onAdjustItem(d.uid, {
        ...d.start, scale, dx: d.start.dx + back * d.perScale.x, dy: d.start.dy + back * d.perScale.y,
      }, push);
    } else {
      p.onAdjustFormat({ ...d.start, dx: d.start.dx + dx / p.format.width, dy: d.start.dy + dy / p.format.height }, push);
    }
  };

  const onPointerUp = () => { drag.current = null; };

  // Ctrl/Alt + roda do mouse redimensiona o item selecionado (listener nativo para poder usar preventDefault)
  const wheelRef = useRef<(e: WheelEvent) => void>(() => {});
  wheelRef.current = (e: WheelEvent) => {
    if (!(e.ctrlKey || e.altKey) || !p.selected) return;
    e.preventDefault();
    const cur = p.pack.adjust[p.selected] ?? DEFAULT_ADJUST;
    const scale = clampScale(cur.scale * (e.deltaY < 0 ? 1.04 : 1 / 1.04));
    p.onAdjustItem(p.selected, { ...cur, scale }, true);
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
