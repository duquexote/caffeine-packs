import { useCallback, useState } from 'react';
import type { Pack } from './types';

interface History {
  pack: Pack;
  past: Pack[];
  future: Pack[];
}

const LIMIT = 100;

/** Estado do pack com desfazer/refazer. `push=false` altera sem criar ponto de histórico (ex.: durante um arraste). */
export function usePackHistory(initial: () => Pack) {
  const [h, setH] = useState<History>(() => ({ pack: initial(), past: [], future: [] }));

  const update = useCallback((fn: (p: Pack) => Pack, push = true) => {
    setH((s) => {
      const next = { ...fn(s.pack), updatedAt: Date.now() };
      return push
        ? { pack: next, past: [...s.past, s.pack].slice(-LIMIT), future: [] }
        : { ...s, pack: next };
    });
  }, []);

  /** Cria um ponto de histórico com o estado atual (chamar no início de um arraste). */
  const checkpoint = useCallback(() => {
    setH((s) => ({ ...s, past: [...s.past, s.pack].slice(-LIMIT), future: [] }));
  }, []);

  const replace = useCallback((pack: Pack) => setH({ pack, past: [], future: [] }), []);

  const undo = useCallback(() => {
    setH((s) => (s.past.length ? { pack: s.past[s.past.length - 1], past: s.past.slice(0, -1), future: [s.pack, ...s.future] } : s));
  }, []);
  const redo = useCallback(() => {
    setH((s) => (s.future.length ? { pack: s.future[0], past: [...s.past, s.pack], future: s.future.slice(1) } : s));
  }, []);

  return { pack: h.pack, update, checkpoint, replace, undo, redo, canUndo: h.past.length > 0, canRedo: h.future.length > 0 };
}
