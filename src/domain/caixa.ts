/**
 * Quanto dinheiro existe, e até quando ele dura.
 *
 * **Este app é um fluxo de caixa.** Isso decide duas coisas que antes estavam
 * decididas de outro jeito.
 *
 * **A primeira: saldo é o que dá para gastar, não patrimônio.** O painel
 * somava tudo — conta corrente, poupança, dinheiro, investimento — e descontava
 * a dívida dos cartões. Isso é patrimônio líquido, e como número grande de um
 * fluxo de caixa ele engana duas vezes: infla com o que está investido (que
 * não é caixa deste mês) e desconta uma dívida que ainda vai aparecer sozinha
 * no dia em que a fatura vence. Na carteira de exemplo a diferença era de
 * R$ 118.132,10 para R$ 112.634,00 — e é o segundo que responde "posso gastar".
 *
 * **A segunda: um fluxo de caixa serve para responder quando o dinheiro
 * acaba.** O gráfico de saldo já existia, mas ninguém lê um gráfico procurando
 * o ponto onde a linha cruza o zero. A frase tem de estar escrita.
 */

import type { Account, AccountKind, DisplayEntry } from './types.ts';
import { accountBalance, type BalanceOptions, type DayPoint } from './summary.ts';

/**
 * As contas de onde o dinheiro sai de verdade.
 *
 * Investimento fica de fora porque resgatar leva tempo e é decisão, não caixa;
 * cartão fica de fora porque não é dinheiro que se tem, é conta que se deve —
 * e ela já aparece como saída no dia do vencimento. Poupança entra: é
 * transferência instantânea e todo mundo conta com ela.
 */
export const CONTAS_DE_CAIXA: AccountKind[] = ['checking', 'savings', 'cash'];

export function ehContaDeCaixa(conta: Account): boolean {
  return CONTAS_DE_CAIXA.includes(conta.kind);
}

/** O dinheiro disponível agora: só as contas de onde ele sai. */
export function saldoDisponivel(
  contas: readonly Account[],
  entradas: readonly DisplayEntry[],
  options: BalanceOptions = {},
): number {
  return contas
    .filter((conta) => !conta.archived && ehContaDeCaixa(conta))
    .reduce((soma, conta) => soma + accountBalance(conta, entradas, options), 0);
}

/** O que está guardado e não é caixa do dia a dia. */
export function saldoInvestido(
  contas: readonly Account[],
  entradas: readonly DisplayEntry[],
  options: BalanceOptions = {},
): number {
  return contas
    .filter((conta) => !conta.archived && conta.kind === 'investment')
    .reduce((soma, conta) => soma + accountBalance(conta, entradas, options), 0);
}

/** Quanto se deve nos cartões, como número positivo. */
export function dividaDosCartoes(
  contas: readonly Account[],
  entradas: readonly DisplayEntry[],
  options: BalanceOptions = {},
): number {
  const saldo = contas
    .filter((conta) => !conta.archived && conta.kind === 'credit_card')
    .reduce((soma, conta) => soma + accountBalance(conta, entradas, options), 0);
  return Math.max(0, -saldo);
}

/* ------------------------------------------------------- a leitura do futuro */

/** Até onde o fluxo olha para a frente, independente do período aberto. */
export const HORIZONTE_DE_CAIXA = 90;

export interface LeituraDoCaixa {
  /** O primeiro dia em que o saldo fica abaixo de zero, se houver. */
  primeiroNegativo: DayPoint | null;
  /** O pior momento do percurso — pode ser positivo, e ainda assim apertado. */
  menorSaldo: DayPoint | null;
  /** Onde o percurso termina. */
  saldoFinal: number | null;
}

/**
 * O que o percurso de saldo tem a dizer.
 *
 * `menorSaldo` existe separado de `primeiroNegativo` porque o aviso útil vem
 * antes do vermelho: terminar o mês com R$ 40 no pior dia não é negativo, e é
 * exatamente a hora de não parcelar mais nada.
 */
export function lerCaixa(percurso: readonly DayPoint[]): LeituraDoCaixa {
  if (percurso.length === 0) {
    return { primeiroNegativo: null, menorSaldo: null, saldoFinal: null };
  }

  let menor = percurso[0]!;
  let negativo: DayPoint | null = null;
  for (const ponto of percurso) {
    if (ponto.balance < menor.balance) menor = ponto;
    if (negativo === null && ponto.balance < 0) negativo = ponto;
  }

  return { primeiroNegativo: negativo, menorSaldo: menor, saldoFinal: percurso.at(-1)!.balance };
}
