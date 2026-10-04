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

import { dataDeCaixa } from './faturas.ts';
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

/**
 * O que as faturas de cartão já tiraram do caixa até a data de corte.
 *
 * **Isto existe porque faltava, e a falta aparecia na tela.** Uma compra no
 * cartão pertence à conta do CARTÃO. Somando só as contas de caixa, a fatura
 * nunca reduzia o saldo da conta corrente — nem depois de paga. O gráfico, que
 * anda pela data de caixa, já descontava; o "Dinheiro disponível" e o "já
 * havia" não. Os dois números apareciam na mesma tela, no mesmo dia,
 * discordando pelo total das faturas já vencidas.
 *
 * O modelo certo é o que o app promete no tutorial: "ele mostra quando o
 * dinheiro sai da sua conta". A compra no cartão É a saída de caixa, no dia em
 * que a fatura vence. Não existe um lançamento separado de "pagar a fatura".
 *
 * Transferência para o cartão fica de fora de propósito: ela é o pagamento da
 * fatura em si, feito à mão, e a conta de caixa já a desconta por conta
 * própria. Contá-la aqui também tiraria o mesmo dinheiro duas vezes.
 */
function faturasQueJaSairam(
  contas: readonly Account[],
  entradas: readonly DisplayEntry[],
  options: BalanceOptions = {},
): number {
  const porId = new Map(contas.map((conta) => [conta.id, conta]));
  let movimento = 0;

  for (const entrada of entradas) {
    if (entrada.kind === 'transfer') continue;
    const conta = porId.get(entrada.accountId);
    if (!conta || conta.archived || conta.kind !== 'credit_card') continue;
    if (options.onlySettled && entrada.status !== 'settled') continue;
    // A data em que o dinheiro sai, e não a da compra: é a mesma regra do
    // gráfico, e é o que faz os dois pararem de discordar.
    if (options.upTo && dataDeCaixa(conta, entrada) > options.upTo) continue;
    movimento += entrada.kind === 'income' ? entrada.amount : -entrada.amount;
  }

  return movimento;
}

/** O dinheiro disponível agora: o que está nas contas de caixa, já descontadas
 * as faturas de cartão que venceram. */
export function saldoDisponivel(
  contas: readonly Account[],
  entradas: readonly DisplayEntry[],
  options: BalanceOptions = {},
): number {
  const emConta = contas
    .filter((conta) => !conta.archived && ehContaDeCaixa(conta))
    .reduce((soma, conta) => soma + accountBalance(conta, entradas, options), 0);
  return emConta + faturasQueJaSairam(contas, entradas, options);
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

/**
 * Quanto se deve nos cartões e **ainda não saiu**, como número positivo.
 *
 * O "ainda não saiu" passou a importar quando o saldo de caixa começou a
 * descontar as faturas vencidas: sem isso, o mesmo dinheiro apareceria duas
 * vezes contra a pessoa — tirado do saldo e ainda listado como dívida a
 * vencer, que é o rótulo que esse número leva na tela.
 *
 * A dívida continua nascendo na COMPRA, e não no vencimento: é o que o
 * tutorial promete, e é o que o extrato do cartão mostra.
 */
export function dividaDosCartoes(
  contas: readonly Account[],
  entradas: readonly DisplayEntry[],
  options: BalanceOptions = {},
): number {
  const saldo = contas
    .filter((conta) => !conta.archived && conta.kind === 'credit_card')
    .reduce((soma, conta) => soma + accountBalance(conta, entradas, options), 0);
  // O que já foi embora deixa de ser dívida a vencer. `faturasQueJaSairam` é
  // negativo quando saiu dinheiro, então somá-lo abate a parte já paga:
  //   a vencer = dívida total − o que já saiu.
  return Math.max(0, -saldo + faturasQueJaSairam(contas, entradas, options));
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
