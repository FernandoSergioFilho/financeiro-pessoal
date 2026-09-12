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
 *
 * **O intervalo é fechado no começo e aberto no fim: `[fechamento anterior,
 * fechamento)`.** Isto é, a compra feita **no próprio dia do fechamento já é
 * da fatura seguinte** — é o que as faturas dizem com todas as letras
 * ("compras realizadas a partir da data de fechamento entrarão na próxima
 * fatura"), e é o que faz diferença de verdade num cartão que fecha dia 1:
 * tudo o que se compra no dia 1º cai na fatura do mês que vem.
 *
 * O app fazia o contrário — incluía o dia do fechamento e excluía o do
 * fechamento anterior —, o que jogava um mês inteiro de compras na fatura
 * errada em cartões que fecham no começo do mês.
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

/** O ciclo de uma fatura, sem os valores: só as datas que a delimitam. */
export interface CicloDaFatura {
  /** Quando esta fatura fecha. A compra deste dia já é da seguinte. */
  fecha: string;
  /** Quando ela vence — depois do fechamento, no `dueDay`. */
  vence: string;
  /** O primeiro dia que já conta para esta fatura. */
  comecaEm: string;
}

export interface Fatura extends CicloDaFatura {
  conta: Account;
  total: number;
  lancamentos: number;
}

/** O cartão tem ciclo de fatura? Sem o dia do fechamento não há como saber nada. */
export function temCiclo(conta: Account): boolean {
  return conta.kind === 'credit_card' && Boolean(conta.closingDay);
}

/**
 * Em que fatura cai uma compra feita em `data`.
 *
 * É a função que responde a pergunta do usuário — "comprei hoje, quando vou
 * pagar isto?" —, e é a única que sabe onde cada compra entra: tudo o mais
 * aqui é construído sobre ela, para que não existam duas respostas diferentes
 * para a mesma data.
 */
export function faturaDaCompra(conta: Account, data: string): CicloDaFatura | null {
  if (!temCiclo(conta)) return null;
  const dia = conta.closingDay!;

  // O primeiro fechamento **depois** da compra, e não a partir dela: comprar
  // no dia do fechamento é comprar na fatura seguinte.
  const candidato = proximoDiaDoMes(data, dia);
  const fecha = candidato > data ? candidato : diaDoMes(addMonths(candidato, 1), dia);

  const comecaEm = diaDoMes(addMonths(fecha, -1), dia);
  // O vencimento é o primeiro `dueDay` **depois** do fechamento: fechando dia
  // 28 e vencendo dia 5, o vencimento é do mês seguinte; fechando dia 5 e
  // vencendo dia 20, é do mesmo mês.
  const vence = conta.dueDay ? proximoDiaDoMes(fecha, conta.dueDay) : fecha;

  return { fecha, vence, comecaEm };
}

/**
 * A fatura em aberto do cartão, ou nulo quando a conta não é cartão ou não
 * tem os dias configurados — sem eles não há como saber o que já fechou.
 *
 * A fatura aberta é, por definição, aquela em que cairia uma compra feita
 * hoje: é o mesmo cálculo, e por isso a mesma função.
 */
export function faturaAberta(
  conta: Account,
  entradas: readonly DisplayEntry[],
  hoje: string,
): Fatura | null {
  const ciclo = faturaDaCompra(conta, hoje);
  if (!ciclo) return null;

  let total = 0;
  let lancamentos = 0;
  for (const entrada of entradas) {
    if (entrada.accountId !== conta.id) continue;
    if (entrada.kind !== 'expense') continue;
    // Fechado no começo, aberto no fim: o dia do fechamento já é da próxima.
    if (entrada.date < ciclo.comecaEm || entrada.date >= ciclo.fecha) continue;
    total += entrada.amount;
    lancamentos += 1;
  }

  return { conta, ...ciclo, total, lancamentos };
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
