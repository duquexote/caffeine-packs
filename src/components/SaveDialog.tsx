import { useEffect, useRef, useState } from 'react';
import type { Pack } from '../types';

interface Props {
  pack: Pack;
  /** versão salva agora no Supabase: undefined enquanto confere, null se não existe mais */
  remote: Pack | null | undefined;
  /** nomes dos packs salvos pelo time (para sugerir um nome livre e avisar repetido) */
  takenNames: string[];
  onUpdate: () => Promise<void>;
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

/** Salvar um pack que já está na lista do time: atualizar o existente ou salvar como novo. */
export function SaveDialog(p: Props) {
  const checking = p.remote === undefined;
  const deleted = p.remote === null;
  // alguém do time salvou depois da versão em que este rascunho se baseia
  const newer = !!p.remote && !!p.pack.savedAt && p.remote.updatedAt > p.pack.savedAt;
  const [mode, setMode] = useState<'update' | 'new'>('update');
  const [name, setName] = useState(() => nextName(p.pack.name, p.takenNames));
  const [busy, setBusy] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);

  // com versão mais nova do time, o padrão seguro é não sobrescrever
  useEffect(() => { if (newer) setMode('new'); }, [newer]);
  useEffect(() => {
    if (checking) return;
    if (mode === 'new') nameRef.current?.select();
    else submitRef.current?.focus();
  }, [checking, mode]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) p.onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const nameTaken = p.takenNames.some((n) => norm(n) === norm(name));
  const blocked = busy || checking || (mode === 'new' && !name.trim());
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (blocked) return;
    setBusy(true);
    try {
      await (mode === 'update' ? p.onUpdate() : p.onSaveAsNew(name.trim()));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) p.onClose(); }}>
      <form className="modal" role="dialog" aria-modal="true" aria-labelledby="save-title" onSubmit={submit}>
        <h3 id="save-title">Salvar “{p.pack.name}”</h3>
        {checking ? (
          <p className="muted">Conferindo a versão salva pelo time…</p>
        ) : deleted ? (
          <p className="warning">Este pack foi excluído da lista do time. Você pode salvá-lo de novo ou como um pack novo.</p>
        ) : newer ? (
          <p className="warning">
            Alguém do time salvou uma versão mais nova em {when(p.remote!.updatedAt)}, depois que você abriu este pack.
            Atualizar substitui essa versão pela sua.
          </p>
        ) : (
          <p className="muted">Este pack já está salvo para o time (última versão em {when(p.remote!.updatedAt)}).</p>
        )}

        <label className={'save-option' + (mode === 'update' ? ' active' : '')}>
          <input type="radio" name="save-mode" checked={mode === 'update'} onChange={() => setMode('update')} />
          <span>
            <strong>{deleted ? 'Salvar de novo' : 'Atualizar o pack salvo'}</strong>
            <span className="muted small">
              {deleted ? 'Volta para a lista do time com estas alterações.' : 'Substitui a versão salva: todo o time passa a ver estas alterações.'}
            </span>
          </span>
        </label>
        <label className={'save-option' + (mode === 'new' ? ' active' : '')}>
          <input type="radio" name="save-mode" checked={mode === 'new'} onChange={() => setMode('new')} />
          <span>
            <strong>Salvar como novo pack</strong>
            <span className="muted small">
              {deleted ? 'Cria outro pack com o nome abaixo.' : `“${p.pack.name}” continua como está e você passa a editar o novo.`}
            </span>
            <input ref={nameRef} type="text" value={name} spellCheck={false} aria-label="Nome do novo pack"
              onFocus={() => setMode('new')} onChange={(e) => setName(e.target.value)} />
            {mode === 'new' && nameTaken && <span className="small warn-text">Já existe um pack do time com esse nome.</span>}
          </span>
        </label>

        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={p.onClose} disabled={busy}>Cancelar</button>
          <button ref={submitRef} type="submit" className="btn primary" disabled={blocked}>
            {busy ? 'Salvando…' : mode === 'new' ? 'Salvar como novo' : deleted ? 'Salvar de novo' : 'Atualizar'}
          </button>
        </div>
      </form>
    </div>
  );
}
