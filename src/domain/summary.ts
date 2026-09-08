/** Agregações de saldo e resumo do período. */

import { addDays, formatMonthKey, monthEnd, monthKey, monthStart } from './date.ts';
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

/* ------------------------------------------------- saldo dia a dia do mês */

export interface DayPoint {
  date: string;
  /** Saldo ao fim daquele dia, somando tudo que veio antes. */
  balance: number;
  /** Depois de hoje: ainda não aconteceu, é o que está previsto. */
  projected: boolean;
  /** Como chamar o ponto na dica; sem isto, a data basta. */
  rotulo?: string;
}

/**
 * O saldo caminhando dia a dia até o fim do mês.
 *
 * Responde a pergunta que o painel ainda não respondia — "vou fechar o mês no
 * azul?" —, porque o total do mês esconde o percurso: dá para terminar positivo
 * tendo passado três semanas no vermelho, e é no percurso que a conta estoura.
 *
 * Transferência entre contas próprias não mexe no total: sai de um lado e entra
 * no outro. Por isso ela é ignorada aqui, como em `periodTotals`.
 */
export function dailyBalance(
  entries: readonly DisplayEntry[],
  month: string,
  startingBalance: number,
  todayIso: string,
): DayPoint[] {
  const porDia = new Map<string, number>();
  for (const entry of entries) {
    if (entry.kind === 'transfer') continue;
    const delta = entry.kind === 'income' ? entry.amount : -entry.amount;
    porDia.set(entry.date, (porDia.get(entry.date) ?? 0) + delta);
  }

  return balanceWalk(entries, monthStart(month), monthEnd(month), startingBalance, todayIso);
}

/**
 * O mesmo percurso, para um intervalo qualquer.
 *
 * Um ponto por dia enquanto isso for legível; passando de `MAX_PONTOS`, um
 * ponto por mês. Um ano inteiro com 365 pontos vira uma mancha de pixels num
 * gráfico de 100 unidades de largura — e num trimestre a leitura diária ainda
 * vale a pena, então o corte fica entre os dois.
 */
export const MAX_PONTOS = 100;

export function balanceWalk(
  entries: readonly DisplayEntry[],
  from: string,
  to: string,
  startingBalance: number,
  todayIso: string,
): DayPoint[] {
  const porDia = new Map<string, number>();
  for (const entry of entries) {
    if (entry.kind === 'transfer') continue;
    if (entry.date < from || entry.date > to) continue;
    const delta = entry.kind === 'income' ? entry.amount : -entry.amount;
    porDia.set(entry.date, (porDia.get(entry.date) ?? 0) + delta);
  }

  const dias = diasEntre(from, to);
  const pontos: DayPoint[] = [];
  let saldo = startingBalance;

  if (dias <= MAX_PONTOS) {
    for (let dia = from; dia <= to; dia = addDays(dia, 1)) {
      saldo += porDia.get(dia) ?? 0;
      pontos.push({ date: dia, balance: saldo, projected: dia > todayIso });
    }
    return pontos;
  }

  // Agrupado por mês: o ponto é o saldo no último dia daquele mês dentro do
  // intervalo, para que o começo e o fim do gráfico sejam as pontas pedidas.
  for (let dia = from; dia <= to; dia = addDays(dia, 1)) {
    saldo += porDia.get(dia) ?? 0;
    const ultimoDoMes = monthEnd(monthKey(dia));
    if (dia === to || dia === ultimoDoMes) {
      pontos.push({ date: dia, balance: saldo, projected: dia > todayIso, rotulo: formatMonthKey(monthKey(dia)) });
    }
  }
  return pontos;
}

function diasEntre(from: string, to: string): number {
  let dias = 1;
  for (let dia = from; dia < to; dia = addDays(dia, 1)) {
    dias += 1;
    if (dias > MAX_PONTOS) return dias; // não precisa contar o resto
  }
  return dias;
}

/* --------------------------------------- comparação com o mês anterior */

export interface CategoryChange {
  category: Category | undefined;
  current: number;
  previous: number;
  /** Positivo: gastou mais que no mês anterior. */
  diff: number;
}

/**
 * Quanto cada categoria mudou em relação ao mês anterior.
 *
 * O gráfico de gastos por categoria diz onde o dinheiro foi; este diz o que
 * saiu do normal, que é a informação que leva a fazer alguma coisa.
 */
export function categoryChanges(
  current: readonly DisplayEntry[],
  previous: readonly DisplayEntry[],
  categories: readonly Category[],
  kind: Category['kind'] = 'expense',
): CategoryChange[] {
  const somar = (entries: readonly DisplayEntry[]) => {
    const totais = new Map<string, number>();
    for (const entry of entries) {
      if (entry.kind === 'transfer') continue;
      if ((entry.kind === 'income' ? 'income' : 'expense') !== kind) continue;
      const chave = entry.categoryId ?? '';
      totais.set(chave, (totais.get(chave) ?? 0) + entry.amount);
    }
    return totais;
  };

  const agora = somar(current);
  const antes = somar(previous);
  const porId = new Map(categories.map((c) => [c.id, c]));

  return [...new Set([...agora.keys(), ...antes.keys()])]
    .map((id) => {
      const atual = agora.get(id) ?? 0;
      const anterior = antes.get(id) ?? 0;
      return { category: porId.get(id), current: atual, previous: anterior, diff: atual - anterior };
    })
    // Só entra quem mudou: uma categoria idêntica aos dois meses não informa nada.
    .filter((linha) => linha.diff !== 0)
    .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
}
