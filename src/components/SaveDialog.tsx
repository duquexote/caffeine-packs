import { useEffect, useRef, useState } from 'react';
import type { Pack } from '../types';

interface Props {
  pack: Pack;
  /** o nome é do próprio pack já salvo ('own') ou de outro pack do time ('other') */
  kind: 'own' | 'other';
  /** o pack do time com esse nome, como está no Supabase agora */
  remote: Pack;
  /** nomes dos packs salvos pelo time (para sugerir um nome livre e não repetir) */
  takenNames: string[];
  onReplace: () => Promise<void>;
  onSaveAsNew: (name: string) => Promise<void>;
  onClose: () => void;
}

const when = (t: number) => new Date(t).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
const norm = (s: string) => s.trim().toLowerCase();

/** Próximo nome livre: pack -> pack-2, pack-2 -> pack-3… */
function nextName(name: string, taken: string[]) {
  const used = new Set(taken.map(norm));
  const base = name.trim().replace(/-\d+$/, '') || 'pack';
  for (let n = 2; ; n++) if (!used.has(norm(`${base}-${n}`))) return `${base}-${n}`;
}

/** Salvar com o nome de um pack que já está na lista do time: substituir esse pack ou salvar como novo. */
export function SaveDialog(p: Props) {
  const own = p.kind === 'own';
  // alguém do time salvou este pack depois da versão em que o rascunho se baseia
  const newer = own && !!p.pack.savedAt && p.remote.updatedAt > p.pack.savedAt;
  // sobrescrever só é o padrão quando é o próprio pack e ninguém mexeu nele no meio do caminho
  const [mode, setMode] = useState<'replace' | 'new'>(own && !newer ? 'replace' : 'new');
  const [name, setName] = useState(() => nextName(p.pack.name, p.takenNames));
  const [busy, setBusy] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (mode === 'new') nameRef.current?.select();
    else submitRef.current?.focus();
  }, [mode]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) p.onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const nameTaken = p.takenNames.some((n) => norm(n) === norm(name));
  const blocked = busy || (mode === 'new' && (!name.trim() || nameTaken));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (blocked) return;
    setBusy(true);
    try {
      await (mode === 'replace' ? p.onReplace() : p.onSaveAsNew(name.trim()));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) p.onClose(); }}>
      <form className="modal" role="dialog" aria-modal="true" aria-labelledby="save-title" onSubmit={submit}>
        <h3 id="save-title">Salvar “{p.pack.name}”</h3>
        {!own ? (
          <p className="warning">
            Já existe outro pack do time chamado “{p.remote.name}” (salvo em {when(p.remote.updatedAt)}).
          </p>
        ) : newer ? (
          <p className="warning">
            Alguém do time salvou uma versão mais nova em {when(p.remote.updatedAt)}, depois que você abriu este pack.
            Atualizar substitui essa versão pela sua.
          </p>
        ) : (
          <p className="muted">Este pack já está salvo para o time (última versão em {when(p.remote.updatedAt)}).</p>
        )}

        <label className={'save-option' + (mode === 'replace' ? ' active' : '')}>
          <input type="radio" name="save-mode" checked={mode === 'replace'} onChange={() => setMode('replace')} />
          <span>
            <strong>{own ? 'Atualizar o pack salvo' : `Substituir o “${p.remote.name}” existente`}</strong>
            <span className="muted small">
              {own ? 'Substitui a versão salva: todo o time passa a ver estas alterações.'
                : 'O pack do time com esse nome passa a ter este conteúdo.'}
            </span>
          </span>
        </label>
        <label className={'save-option' + (mode === 'new' ? ' active' : '')}>
          <input type="radio" name="save-mode" checked={mode === 'new'} onChange={() => setMode('new')} />
          <span>
            <strong>Salvar como novo pack</strong>
            <span className="muted small">
              {own ? `“${p.remote.name}” continua como está e você passa a editar o novo.` : `O “${p.remote.name}” existente continua como está.`}
            </span>
            <input ref={nameRef} type="text" value={name} spellCheck={false} aria-label="Nome do novo pack"
              onFocus={() => setMode('new')} onChange={(e) => setName(e.target.value)} />
            {mode === 'new' && nameTaken && <span className="small warn-text">Já existe um pack do time com esse nome. Escolha outro.</span>}
          </span>
        </label>

        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={p.onClose} disabled={busy}>Cancelar</button>
          <button ref={submitRef} type="submit" className="btn primary" disabled={blocked}>
            {busy ? 'Salvando…' : mode === 'new' ? 'Salvar como novo' : own ? 'Atualizar' : 'Substituir'}
          </button>
        </div>
      </form>
    </div>
  );
}
