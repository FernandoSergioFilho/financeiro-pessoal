/**
 * A fatura aberta de cada cartão.
 *
 * Com quatro cartões, "saldo do cartão" não responde nada: o que importa é
 * quanto está na fatura que **fecha agora** e quando ela vence. Uma compra
 * feita depois do fechamento não pesa neste mês, e o app mostrava as duas
 * misturadas num número só.
 *
 * O modelo é o brasileiro de sempre: a fatura fecha no dia `closingDay`,
 * junta o que foi comprado desde o fechamento anterior, e vence no `dueDay`
 * seguinte.
 */

import { addMonths, daysInMonth, parseISO, toISO } from './date.ts';
import type { Account, DisplayEntry } from './types.ts';

/**
 * O dia `dia` do mês de `referencia`, sem estourar em mês curto: dia 31 em
 * fevereiro vira 28. Sem isso, um cartão que fecha dia 31 não fecharia nunca
 * em fevereiro.
 */
export function diaDoMes(referencia: string, dia: number): string {
  const { year, month } = parseISO(referencia);
  return toISO({ year, month, day: Math.min(Math.max(dia, 1), daysInMonth(year, month)) });
}

/** O primeiro dia `dia` que cai em `iso` ou depois dele. */
export function proximoDiaDoMes(iso: string, dia: number): string {
  const desteMes = diaDoMes(iso, dia);
  return desteMes >= iso ? desteMes : diaDoMes(addMonths(iso, 1), dia);
}

export interface Fatura {
  conta: Account;
  /** Quando esta fatura fecha. */
  fecha: string;
  /** Quando ela vence — depois do fechamento, no `dueDay`. */
  vence: string;
  /** O primeiro dia que já conta para esta fatura. */
  comecaEm: string;
  total: number;
  lancamentos: number;
}

/**
 * A fatura em aberto do cartão, ou nulo quando a conta não é cartão ou não
 * tem os dias configurados — sem eles não há como saber o que já fechou.
 */
export function faturaAberta(
  conta: Account,
  entradas: readonly DisplayEntry[],
  hoje: string,
): Fatura | null {
  if (conta.kind !== 'credit_card' || !conta.closingDay) return null;

  const fecha = proximoDiaDoMes(hoje, conta.closingDay);
  const fechamentoAnterior = diaDoMes(addMonths(fecha, -1), conta.closingDay);
  // O vencimento é o primeiro `dueDay` **depois** do fechamento: fechando dia
  // 28 e vencendo dia 5, o vencimento é do mês seguinte; fechando dia 5 e
  // vencendo dia 20, é do mesmo mês.
  const vence = conta.dueDay ? proximoDiaDoMes(fecha, conta.dueDay) : fecha;

  let total = 0;
  let lancamentos = 0;
  for (const entrada of entradas) {
    if (entrada.accountId !== conta.id) continue;
    if (entrada.kind !== 'expense') continue;
    if (entrada.date <= fechamentoAnterior || entrada.date > fecha) continue;
    total += entrada.amount;
    lancamentos += 1;
  }

  return { conta, fecha, vence, comecaEm: fechamentoAnterior, total, lancamentos };
}

/** As faturas abertas de todos os cartões ativos, da que vence antes para a última. */
export function faturasAbertas(
  contas: readonly Account[],
  entradas: readonly DisplayEntry[],
  hoje: string,
): Fatura[] {
  return contas
    .filter((conta) => !conta.archived)
    .map((conta) => faturaAberta(conta, entradas, hoje))
    .filter((fatura): fatura is Fatura => fatura !== null)
    .sort((a, b) => a.vence.localeCompare(b.vence));
}
