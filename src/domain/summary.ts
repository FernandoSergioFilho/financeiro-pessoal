/** Agregações de saldo e resumo do mês. */

import { monthKey } from './date.ts';
import type { Account, Category, DisplayEntry } from './types.ts';

/**
 * Quanto o lançamento move o saldo de uma conta específica.
 * Uma transferência sai de uma conta e entra na outra, então o mesmo
 * lançamento tem sinais opostos dependendo de quem está perguntando.
 */
export function entryDelta(entry: DisplayEntry, accountId: string): number {
  if (entry.kind === 'transfer') {
    if (entry.accountId === accountId) return -entry.amount;
    if (entry.toAccountId === accountId) return entry.amount;
    return 0;
  }
  if (entry.accountId !== accountId) return 0;
  return entry.kind === 'income' ? entry.amount : -entry.amount;
}

export interface BalanceOptions {
  /** Considera apenas lançamentos até esta data, inclusive. */
  upTo?: string;
  /** `true` ignora os previstos e devolve o saldo já realizado. */
  onlySettled?: boolean;
}

export function accountBalance(
  account: Account,
  entries: readonly DisplayEntry[],
  options: BalanceOptions = {},
): number {
  let balance = account.openingBalance;
  for (const entry of entries) {
    if (options.upTo && entry.date > options.upTo) continue;
    if (options.onlySettled && entry.status !== 'settled') continue;
    balance += entryDelta(entry, account.id);
  }
  return balance;
}

/** Soma dos saldos de todas as contas não arquivadas. */
export function netWorth(
  accounts: readonly Account[],
  entries: readonly DisplayEntry[],
  options: BalanceOptions = {},
): number {
  return accounts
    .filter((a) => !a.archived)
    .reduce((sum, account) => sum + accountBalance(account, entries, options), 0);
}

export interface PeriodTotals {
  income: number;
  expense: number;
  /** Entradas menos saídas, previstos incluídos. */
  net: number;
  settledIncome: number;
  settledExpense: number;
  pendingIncome: number;
  pendingExpense: number;
}

const EMPTY_TOTALS: PeriodTotals = {
  income: 0,
  expense: 0,
  net: 0,
  settledIncome: 0,
  settledExpense: 0,
  pendingIncome: 0,
  pendingExpense: 0,
};

/** Transferências não entram: movem dinheiro sem ser receita nem despesa. */
export function periodTotals(entries: readonly DisplayEntry[]): PeriodTotals {
  const totals = { ...EMPTY_TOTALS };
  for (const entry of entries) {
    if (entry.kind === 'transfer') continue;
    const settled = entry.status === 'settled';
    if (entry.kind === 'income') {
      totals.income += entry.amount;
      if (settled) totals.settledIncome += entry.amount;
      else totals.pendingIncome += entry.amount;
    } else {
      totals.expense += entry.amount;
      if (settled) totals.settledExpense += entry.amount;
      else totals.pendingExpense += entry.amount;
    }
  }
  totals.net = totals.income - totals.expense;
  return totals;
}

export interface CategoryTotal {
  category: Category | null;
  amount: number;
  share: number;
}

/** Gastos (ou receitas) do período por categoria, do maior para o menor. */
export function totalsByCategory(
  entries: readonly DisplayEntry[],
  categories: readonly Category[],
  kind: 'income' | 'expense',
): CategoryTotal[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const sums = new Map<string, number>();

  for (const entry of entries) {
    if (entry.kind !== kind) continue;
    const key = entry.categoryId ?? '';
    sums.set(key, (sums.get(key) ?? 0) + entry.amount);
  }

  const total = [...sums.values()].reduce((a, b) => a + b, 0);
  return [...sums.entries()]
    .map(([key, amount]) => ({
      category: byId.get(key) ?? null,
      amount,
      share: total > 0 ? amount / total : 0,
    }))
    .sort((a, b) => b.amount - a.amount);
}

export interface MonthPoint {
  key: string;
  income: number;
  expense: number;
  net: number;
}

/** Série mensal para o gráfico de evolução, incluindo meses sem movimento. */
export function monthlySeries(
  entries: readonly DisplayEntry[],
  months: readonly string[],
): MonthPoint[] {
  const buckets = new Map(months.map((key) => [key, { income: 0, expense: 0 }]));
  for (const entry of entries) {
    const bucket = buckets.get(monthKey(entry.date));
    if (!bucket || entry.kind === 'transfer') continue;
    if (entry.kind === 'income') bucket.income += entry.amount;
    else bucket.expense += entry.amount;
  }
  return months.map((key) => {
    const bucket = buckets.get(key)!;
    return { key, income: bucket.income, expense: bucket.expense, net: bucket.income - bucket.expense };
  });
}
