/** Leituras derivadas do estado, memoizadas para a UI. */

import { useMemo } from 'react';

import { addDays, monthEnd, monthStart, today } from '../domain/date.ts';
import { projectAll } from '../domain/recurrence.ts';
import type { Account, Category, DisplayEntry, FinanceData } from '../domain/types.ts';
import { useFinance } from './store.tsx';

/** Lançamentos gravados e ocorrências previstas de uma janela, em ordem. */
export function entriesInRange(data: FinanceData, from: string, to: string): DisplayEntry[] {
  const stored: DisplayEntry[] = data.entries.filter((entry) => entry.date >= from && entry.date <= to);
  const projected = projectAll(data.recurring, data.entries, from, to);
  return [...stored, ...projected].sort(
    (a, b) => a.date.localeCompare(b.date) || a.description.localeCompare(b.description),
  );
}

export function useEntriesInRange(from: string, to: string): DisplayEntry[] {
  const { data } = useFinance();
  return useMemo(() => entriesInRange(data, from, to), [data, from, to]);
}

export function useMonthEntries(month: string): DisplayEntry[] {
  return useEntriesInRange(monthStart(month), monthEnd(month));
}

export interface Lookups {
  accounts: Account[];
  categories: Category[];
  accountById: (id: string | null | undefined) => Account | undefined;
  categoryById: (id: string | null | undefined) => Category | undefined;
  accountName: (id: string | null | undefined) => string;
  categoryName: (id: string | null | undefined) => string;
}

export function useLookups(): Lookups {
  const { data } = useFinance();
  return useMemo(() => {
    const accountMap = new Map(data.accounts.map((a) => [a.id, a]));
    const categoryMap = new Map(data.categories.map((c) => [c.id, c]));
    return {
      accounts: data.accounts,
      categories: data.categories,
      accountById: (id) => (id ? accountMap.get(id) : undefined),
      categoryById: (id) => (id ? categoryMap.get(id) : undefined),
      accountName: (id) => (id ? accountMap.get(id)?.name ?? '—' : '—'),
      categoryName: (id) => (id ? categoryMap.get(id)?.name ?? 'Sem categoria' : 'Sem categoria'),
    };
  }, [data.accounts, data.categories]);
}

/** Vencimentos dos próximos dias, para o alerta do painel. */
export function useUpcoming(days = 14): DisplayEntry[] {
  const from = today();
  const entries = useEntriesInRange(from, addDays(from, days));
  return useMemo(() => entries.filter((entry) => entry.status === 'pending'), [entries]);
}

/** Lançamentos previstos com data já passada — as contas esquecidas. */
export function useOverdue(): DisplayEntry[] {
  const to = today();
  const entries = useEntriesInRange(addDays(to, -365), addDays(to, -1));
  return useMemo(() => entries.filter((entry) => entry.status === 'pending'), [entries]);
}
