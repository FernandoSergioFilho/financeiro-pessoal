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
import { ajustarParaDiaUtil } from './diautil.ts';
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
  // O vencimento que cai num sábado é pago na segunda: é uma data derivada, e
  // num fluxo de caixa o dia em que o dinheiro sai é o que vale.
  const venceNoPapel = conta.dueDay ? proximoDiaDoMes(fecha, conta.dueDay) : fecha;
  const vence = ajustarParaDiaUtil(venceNoPapel, 'expense');

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

/* --------------------------------------------------------- data de caixa */

/**
 * **Duas datas, e cada uma manda numa coisa.**
 *
 * A *data da compra* é quando você passou o cartão. É ela que decide em que
 * fatura a compra cai, quanto você deve no cartão, e é ela que o extrato do
 * banco traz — então é ela que fica gravada, e é por ela que a importação
 * compara para não duplicar. Mexer nisso corromperia o que veio do banco.
 *
 * A *data de caixa* é quando o dinheiro sai da sua conta. No débito e no Pix
 * são a mesma data. **No crédito não**: comprar dia 1º num cartão que fecha
 * dia 1º e vence dia 10 é gastar hoje um dinheiro que só sai em 10 de
 * novembro. É por esta data que o mês fecha, porque é ela que responde
 * "quanto vai sair este mês".
 *
 * Esta função dá a segunda a partir da primeira. O que ela **não** desloca:
 * a transferência para o cartão, que é o pagamento da fatura em si e já
 * acontece no dia em que acontece.
 */
export function dataDeCaixa(
  conta: Account | undefined,
  entrada: { date: string; kind: string; projected?: boolean },
): string {
  if (conta && entrada.kind !== 'transfer' && temCiclo(conta)) {
    // O vencimento da fatura já vem ajustado para dia útil.
    return faturaDaCompra(conta, entrada.date)?.vence ?? entrada.date;
  }
  // A ocorrência de uma conta recorrente é data derivada: a do dia 5 que cai
  // num domingo não move dinheiro no domingo. Já o lançamento que a pessoa
  // digitou fica onde ela o pôs — cartão e Pix funcionam no fim de semana, e
  // corrigir o que ela viu acontecer seria o app achando que sabe mais.
  if (entrada.projected) {
    return ajustarParaDiaUtil(
      entrada.date,
      entrada.kind === 'income' ? 'income' : entrada.kind === 'transfer' ? 'transfer' : 'expense',
    );
  }
  return entrada.date;
}

/**
 * Quando o dinheiro deste lançamento sai, já calculado.
 *
 * `caixa` é preenchido em `entriesInRange`, onde as contas estão à mão. Quem
 * recebe uma lista de outro lugar cai no `date`, que é o certo para tudo o
 * que não é cartão.
 */
export function quandoSai(entrada: { date: string; caixa?: string }): string {
  return entrada.caixa ?? entrada.date;
}

/**
 * A lista com a data de caixa já calculada em cada item.
 *
 * Quem agrupa por mês precisa dela: sem isto, a lista do período mostraria a
 * compra no mês da fatura e o gráfico no mês da compra.
 */
export function comDataDeCaixa<T extends { date: string; kind: string; accountId: string; projected?: boolean }>(
  contas: readonly Account[],
  entradas: readonly T[],
): (T & { caixa?: string })[] {
  const porId = new Map(contas.map((c) => [c.id, c]));
  return entradas.map((entrada) => {
    const caixa = dataDeCaixa(porId.get(entrada.accountId), entrada);
    return caixa === entrada.date ? entrada : { ...entrada, caixa };
  });
}
