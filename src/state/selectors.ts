/** Leituras derivadas do estado, memoizadas para a UI. */

import { useMemo } from 'react';

import { addDays, monthEnd, monthStart, today } from '../domain/date.ts';
import { dataDeCaixa, quandoSai } from '../domain/faturas.ts';
import { foraDoCaixa } from '../domain/investimentos.ts';
import { intervaloDoPeriodo, limiteDaPrevisao, type Periodo } from '../domain/period.ts';
import { projectAll } from '../domain/recurrence.ts';
import type { Account, Category, DisplayEntry, FinanceData } from '../domain/types.ts';
import { useFinance } from './store.tsx';

/**
 * Quanto a janela se alarga antes de filtrar por data de caixa.
 *
 * Uma compra no cartão pertence ao mês em que a fatura vence, e esse
 * vencimento pode estar até dois meses depois da compra (fechou dia 1º,
 * venceu dia 10 do mês seguinte). Procurar a compra dentro da própria janela
 * deixaria de fora justamente as que se deslocaram para dentro dela.
 */
const FOLGA_DE_CAIXA = 70;

/**
 * Alarga um limite em `dias`, sem sair do calendário.
 *
 * Nos extremos do período "Tudo" o deslocamento estoura: `0000-01-01 − 70`
 * vira `1899-10-23` (o ano 0 vira 1900 em JavaScript) e `9999-12-31 + 70` vira
 * `10000-03-10`, que comparado como texto é **menor** que qualquer data de
 * verdade — e a busca voltava vazia. Quando o resultado não anda para o lado
 * pedido, ou muda de tamanho, o próprio limite já é largo o bastante.
 */
function alargar(iso: string, dias: number): string {
  const movido = addDays(iso, dias);
  if (movido.length !== iso.length) return iso;
  if (dias < 0) return movido < iso ? movido : iso;
  return movido > iso ? movido : iso;
}

/**
 * Lançamentos gravados e ocorrências previstas de uma janela, em ordem.
 *
 * O que está gravado sai inteiro, por mais antigo que seja. Já a projeção das
 * recorrentes para no horizonte de `limiteDaPrevisao`: com o período "Tudo" a
 * janela vai até 9999 e uma regra mensal sozinha geraria dezenas de milhares
 * de linhas inventadas.
 *
 * **A janela é a do dinheiro saindo, não a da compra.** Cada lançamento recebe
 * a sua `caixa` — igual à data, exceto no cartão de crédito, onde é o
 * vencimento da fatura em que a compra caiu (o porquê está em
 * `domain/faturas.ts`). É este o funil por onde passam todas as telas, e é por
 * isso que a conta é feita aqui: se cada uma calculasse a sua, a lista e o
 * gráfico discordariam.
 */
export function entriesInRange(data: FinanceData, from: string, to: string): DisplayEntry[] {
  const contas = new Map(data.accounts.map((c) => [c.id, c]));
  const comCaixa = (entrada: DisplayEntry): DisplayEntry => {
    const conta = contas.get(entrada.accountId);
    const caixa = dataDeCaixa(conta, entrada);
    // Os dois carimbos saem juntos, do mesmo lugar: quando o dinheiro sai, e
    // se ele chega a sair. Calculá-los em telas diferentes é como o intervalo
    // da fatura ficou invertido sem ninguém ver.
    const fora = foraDoCaixa(conta, entrada);
    if (caixa === entrada.date && !fora) return entrada;
    return { ...entrada, ...(caixa === entrada.date ? {} : { caixa }), ...(fora ? { foraDoCaixa: true } : {}) };
  };

  // Alarga para os dois lados antes de filtrar: o que entra na janela por
  // vencimento pode ter sido comprado antes dela, e o que foi comprado dentro
  // pode vencer depois.
  const busca = { de: alargar(from, -FOLGA_DE_CAIXA), ate: alargar(to, FOLGA_DE_CAIXA) };
  const gravados = data.entries
    .filter((entry) => entry.date >= busca.de && entry.date <= busca.ate)
    .map((entry) => comCaixa(entry as DisplayEntry));
  const previstos = projectAll(
    data.recurring,
    data.entries,
    busca.de,
    limiteDaPrevisao(busca.ate),
  ).map(comCaixa);

  return [...gravados, ...previstos]
    .filter((entrada) => {
      const sai = quandoSai(entrada);
      return sai >= from && sai <= to;
    })
    .sort(
      (a, b) => quandoSai(a).localeCompare(quandoSai(b)) || a.description.localeCompare(b.description),
    );
}

export function useEntriesInRange(from: string, to: string): DisplayEntry[] {
  const { data } = useFinance();
  return useMemo(() => entriesInRange(data, from, to), [data, from, to]);
}

export function useMonthEntries(month: string): DisplayEntry[] {
  return useEntriesInRange(monthStart(month), monthEnd(month));
}

/** Os lançamentos do período aberto na barra do topo. */
export function usePeriodEntries(periodo: Periodo): DisplayEntry[] {
  const { de, ate } = intervaloDoPeriodo(periodo);
  return useEntriesInRange(de, ate);
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
