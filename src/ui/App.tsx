/**
 * Casca da aplicação: navegação, mês selecionado e os diálogos globais.
 *
 * A rota vive no hash da URL em vez de num estado interno para que recarregar
 * a página e o botão "voltar" do navegador funcionem — no celular, voltar é o
 * gesto que as pessoas usam sem pensar.
 */

import { useCallback, useEffect, useState } from 'react';

import { addMonthsToKey, currentMonthKey, formatMonthKey } from '../domain/date.ts';
import type { DisplayEntry } from '../domain/types.ts';
import { useFinance } from '../state/store.tsx';
import { EditEntryDialog, NewEntryDialog } from './components/EntryForms.tsx';
import { Dashboard } from './pages/Dashboard.tsx';
import { EntriesPage } from './pages/EntriesPage.tsx';
import { PurchasesPage } from './pages/PurchasesPage.tsx';
import { RecurringPage } from './pages/RecurringPage.tsx';
import { SettingsPage } from './pages/SettingsPage.tsx';
import { useTheme } from './theme.ts';

interface Page {
  id: string;
  label: string;
  short: string;
  icon: string;
  subtitle: string;
  /** O seletor de mês só aparece onde a tela realmente fala de um mês. */
  monthly: boolean;
}

const PAGES: Page[] = [
  { id: 'painel', label: 'Painel', short: 'Painel', icon: '◎', subtitle: 'Como está o mês', monthly: true },
  { id: 'lancamentos', label: 'Lançamentos', short: 'Lanç.', icon: '≡', subtitle: 'Tudo que entrou e saiu', monthly: true },
  { id: 'recorrentes', label: 'Contas recorrentes', short: 'Fixas', icon: '🔁', subtitle: 'O que se repete todo mês', monthly: false },
  { id: 'parceladas', label: 'Compras parceladas', short: 'Parcelas', icon: '🧾', subtitle: 'O que ainda falta pagar', monthly: false },
  { id: 'ajustes', label: 'Ajustes', short: 'Ajustes', icon: '⚙', subtitle: 'Contas, categorias e dados', monthly: false },
];

function pageFromHash(): string {
  const id = window.location.hash.replace(/^#\/?/, '');
  return PAGES.some((page) => page.id === id) ? id : 'painel';
}

export function App() {
  const { loading, storageBlocked } = useFinance();
  const [theme, setTheme] = useTheme();
  const [pageId, setPageId] = useState(pageFromHash);
  const [month, setMonth] = useState(currentMonthKey);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<DisplayEntry | null>(null);

  useEffect(() => {
    const sync = () => setPageId(pageFromHash());
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);

  const navigate = useCallback((id: string) => {
    window.location.hash = `/${id}`;
    setPageId(id);
    window.scrollTo({ top: 0 });
  }, []);

  const page = PAGES.find((candidate) => candidate.id === pageId) ?? PAGES[0]!;

  if (loading) {
    return (
      <div className="empty" style={{ minHeight: '100vh', justifyContent: 'center' }}>
        <span className="emoji" aria-hidden="true">
          💰
        </span>
        <p>Carregando…</p>
      </div>
    );
  }

  const nav = (className: string, labelOf: (p: Page) => string) =>
    PAGES.map((candidate) => (
      <button
        key={candidate.id}
        type="button"
        className={className}
        aria-current={candidate.id === page.id ? 'page' : undefined}
        onClick={() => navigate(candidate.id)}
      >
        <span className="nav-icon" aria-hidden="true">
          {candidate.icon}
        </span>
        <span>{labelOf(candidate)}</span>
      </button>
    ));

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            R$
          </span>
          <span className="brand-text">
            Financeiro
            <small>controle pessoal</small>
          </span>
        </div>
        <nav aria-label="Seções">{nav('nav-link', (p) => p.label)}</nav>
        <span className="nav-spacer" />
        <button type="button" className="btn primary" onClick={() => setCreating(true)}>
          + Novo lançamento
        </button>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="topbar-title">
            <h1>{page.label}</h1>
            <p>{page.subtitle}</p>
          </div>

          {page.monthly && (
            <div className="month-nav">
              <button type="button" onClick={() => setMonth(addMonthsToKey(month, -1))} aria-label="Mês anterior">
                ‹
              </button>
              <span className="label">{formatMonthKey(month)}</span>
              <button type="button" onClick={() => setMonth(addMonthsToKey(month, 1))} aria-label="Próximo mês">
                ›
              </button>
            </div>
          )}
          {page.monthly && month !== currentMonthKey() && (
            <button type="button" className="btn sm ghost" onClick={() => setMonth(currentMonthKey())}>
              Hoje
            </button>
          )}
        </header>

        <main className="content">
          {storageBlocked && (
            <div className="banner warn">
              <span className="emoji" aria-hidden="true">
                ⚠️
              </span>
              <span>
                <strong>Este navegador está bloqueando o salvamento automático</strong>
                <br />
                <span className="dim">
                  O que você digitar se perde ao fechar a aba. Baixe um backup em Ajustes, ou abra o app em uma janela
                  normal (não anônima).
                </span>
              </span>
            </div>
          )}
          {page.id === 'painel' && (
            <Dashboard month={month} onOpenEntry={setEditing} onNew={() => setCreating(true)} onNavigate={navigate} />
          )}
          {page.id === 'lancamentos' && (
            <EntriesPage month={month} onOpenEntry={setEditing} onNew={() => setCreating(true)} />
          )}
          {page.id === 'recorrentes' && <RecurringPage />}
          {page.id === 'parceladas' && <PurchasesPage onNew={() => setCreating(true)} />}
          {page.id === 'ajustes' && <SettingsPage month={month} theme={theme} onThemeChange={setTheme} />}
        </main>
      </div>

      <button type="button" className="fab" onClick={() => setCreating(true)} aria-label="Novo lançamento">
        +
      </button>

      <nav className="mobile-nav" aria-label="Seções">
        {nav('', (p) => p.short)}
      </nav>

      {creating && <NewEntryDialog onClose={() => setCreating(false)} />}
      {editing && <EditEntryDialog entry={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
