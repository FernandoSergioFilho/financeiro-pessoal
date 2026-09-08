/** Lista do período aberto na barra, com busca e filtros. */

import { useEffect, useMemo, useState } from 'react';

import { formatMoney } from '../../domain/money.ts';
import { rotuloDoPeriodo, type Periodo } from '../../domain/period.ts';
import { periodTotals } from '../../domain/summary.ts';
import type { DisplayEntry, EntryKind } from '../../domain/types.ts';
import { useLookups, usePeriodEntries } from '../../state/selectors.ts';
import { EntryList } from '../components/EntryList.tsx';
import { Card } from '../components/primitives.tsx';

type Filter = 'all' | EntryKind | 'pending';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'Tudo' },
  { value: 'expense', label: 'Saídas' },
  { value: 'income', label: 'Entradas' },
  { value: 'transfer', label: 'Transferências' },
  { value: 'pending', label: 'Previstos' },
];

export function EntriesPage({
  periodo,
  foco,
  onOpenEntry,
  onNew,
}: {
  periodo: Periodo;
  /** Conta que outra tela mandou abrir aqui — "ver os lançamentos desta conta". */
  foco: { conta: string; token: number } | null;
  onOpenEntry: (entry: DisplayEntry) => void;
  onNew: () => void;
}) {
  const entries = usePeriodEntries(periodo);
  const { accounts, categories } = useLookups();
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [accountId, setAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');

  // O `token` muda a cada pedido, para que clicar de novo no mesmo botão
  // volte a aplicar o filtro depois de o usuário tê-lo limpado à mão.
  useEffect(() => {
    if (!foco) return;
    setAccountId(foco.conta);
    setFilter('all');
    setSearch('');
    setCategoryId('');
  }, [foco]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return entries.filter((entry) => {
      if (filter === 'pending' ? entry.status !== 'pending' : filter !== 'all' && entry.kind !== filter) return false;
      if (accountId && entry.accountId !== accountId && entry.toAccountId !== accountId) return false;
      if (categoryId && entry.categoryId !== categoryId) return false;
      if (term && !entry.description.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [entries, filter, search, accountId, categoryId]);

  const totals = periodTotals(filtered);

  return (
    <>
      <div className="row wrap">
        <input
          className="input"
          type="search"
          placeholder="Buscar por descrição…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ maxWidth: 260 }}
          aria-label="Buscar lançamentos"
        />
        <select
          className="input select"
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          style={{ maxWidth: 190 }}
          aria-label="Filtrar por conta"
        >
          <option value="">Todas as contas</option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </select>
        <select
          className="input select"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          style={{ maxWidth: 190 }}
          aria-label="Filtrar por categoria"
        >
          <option value="">Todas as categorias</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.emoji} {category.name}
            </option>
          ))}
        </select>
        <span className="spacer" />
      </div>

      <div className="row wrap">
        <div className="segmented scroll-x">
          {FILTERS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={filter === option.value}
              onClick={() => setFilter(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <span className="spacer" />
        <span className="dim num" style={{ fontSize: '0.82rem' }}>
          {filtered.length} {filtered.length === 1 ? 'lançamento' : 'lançamentos'} em {rotuloDoPeriodo(periodo)} ·{' '}
          <span className="good">{formatMoney(totals.income)}</span> ·{' '}
          <span className="bad">{formatMoney(totals.expense)}</span>
        </span>
      </div>

      <Card tight>
        <EntryList
          entries={filtered}
          onOpen={onOpenEntry}
          emptyAction={
            <button type="button" className="btn primary" onClick={onNew}>
              Novo lançamento
            </button>
          }
        />
      </Card>
    </>
  );
}
