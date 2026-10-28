import { Component, StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { discardCurrent } from './storage';
import './styles.css';

/** Se algo quebrar, mostra o erro em vez de uma tela branca e deixa descartar o pack em edição (fica no navegador). */
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="crash">
        <h2>Algo deu errado ao abrir o gerador</h2>
        <code>{this.state.error.message}</code>
        <div className="row wrap">
          <button className="btn" onClick={() => location.reload()}>Recarregar</button>
          <button className="btn ghost" onClick={() => { discardCurrent(); location.reload(); }}>
            Descartar o pack em edição e recarregar
          </button>
        </div>
        <p className="muted small">Packs salvos, uploads e fundos ficam no Supabase e não são afetados.</p>
      </div>
    );
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
