/**
 * Aporte, retirada e rendimento.
 *
 * **A decisão que define tudo aqui: o rendimento não é entrada de caixa.**
 *
 * Este app é um fluxo de caixa — quando entra e quando sai. Os R$ 250 que o
 * Tesouro rendeu em setembro **não entraram**: eles engordaram um patrimônio
 * que continua lá dentro. Contá-los como entrada do mês inflaria a renda,
 * estragaria o "quanto ainda posso gastar" e faria o app dizer que sobrou
 * dinheiro que ninguém pode gastar sem antes resgatar.
 *
 * O rendimento vira caixa **no dia do resgate**, e aí ele já é uma retirada.
 *
 * **Por que não existe um tipo novo de lançamento.** A tentação é criar um
 * `kind: 'rendimento'` ao lado de entrada, saída e transferência — e isso
 * obrigaria a mexer nos quinze lugares que decidem por tipo, para um conceito
 * que os três existentes já expressam:
 *
 * | O que a pessoa faz | O que fica gravado |
 * | --- | --- |
 * | **Aportar** | transferência: conta corrente → investimento |
 * | **Retirar** | transferência: investimento → conta corrente |
 * | **Rendimento** | entrada, na conta de investimento |
 *
 * O que separa o rendimento de um salário não é o tipo do lançamento: é **em
 * que conta ele cai**. Entrada numa conta de investimento é rendimento, por
 * definição — não existe outra coisa que ela poderia ser. Daí `foraDoCaixa`,
 * calculado uma vez em `entriesInRange` junto com a data de caixa, e respeitado
 * por todo somatório de fluxo.
 *
 * **A poupança é caixa, e isso não é inconsistência.** Rendimento de poupança
 * cai numa conta de onde se gasta no mesmo dia, então ele entra no fluxo como
 * qualquer entrada. Quem decide é a natureza da conta, não a palavra
 * "rendimento".
 */

import type { Account, DisplayEntry } from './types.ts';

export function ehInvestimento(conta: Account | undefined): boolean {
  return conta?.kind === 'investment';
}

/**
 * Este lançamento fica de fora das contas de fluxo de caixa?
 *
 * Só o que acontece **dentro** de uma conta de investimento: o rendimento que
 * ficou lá, a taxa de custódia que saiu de lá. A transferência não, porque ela
 * tem a outra ponta numa conta de caixa — é justamente o aporte e o resgate, o
 * momento em que o dinheiro atravessa a fronteira.
 */
export function foraDoCaixa(conta: Account | undefined, entrada: { kind: string }): boolean {
  return ehInvestimento(conta) && entrada.kind !== 'transfer';
}

/** `caixa` já filtrado: o que este lançamento move no fluxo, ou nada. */
export function contaNoFluxo(entrada: { foraDoCaixa?: boolean }): boolean {
  return entrada.foraDoCaixa !== true;
}

export interface ResumoDeInvestimento {
  conta: Account;
  /** Quanto está lá hoje. */
  saldo: number;
  /** Tudo que entrou por aporte. */
  aportado: number;
  /** Tudo que saiu por resgate. */
  retirado: number;
  /** Tudo que rendeu — e as taxas, que entram negativas. */
  rendimento: number;
  /**
   * O que rendeu sobre o que foi posto lá.
   *
   * `null` quando nada foi aportado: dividir por zero daria infinito, e uma
   * conta que começou com saldo de abertura e nunca recebeu aporte não tem
   * denominador honesto.
   */
  retorno: number | null;
}

/**
 * O retrato de uma conta de investimento.
 *
 * `saldo` vale `abertura + aportado − retirado + rendimento`, e é essa
 * identidade que prova que nada se perdeu no caminho — há um teste nomeado
 * só para ela.
 */
export function resumoDoInvestimento(
  conta: Account,
  entradas: readonly DisplayEntry[],
): ResumoDeInvestimento {
  let aportado = 0;
  let retirado = 0;
  let rendimento = 0;

  for (const entrada of entradas) {
    if (entrada.kind === 'transfer') {
      if (entrada.toAccountId === conta.id) aportado += entrada.amount;
      else if (entrada.accountId === conta.id) retirado += entrada.amount;
      continue;
    }
    if (entrada.accountId !== conta.id) continue;
    // Entrada numa conta de investimento é rendimento; saída é taxa, e desconta.
    rendimento += entrada.kind === 'income' ? entrada.amount : -entrada.amount;
  }

  const saldo = conta.openingBalance + aportado - retirado + rendimento;
  return {
    conta,
    saldo,
    aportado,
    retirado,
    rendimento,
    retorno: aportado > 0 ? rendimento / aportado : null,
  };
}

export interface ResumoGeral {
  contas: ResumoDeInvestimento[];
  saldo: number;
  aportado: number;
  retirado: number;
  rendimento: number;
}

/** O mesmo retrato, somando todas as contas de investimento não arquivadas. */
export function resumoGeralDeInvestimentos(
  contas: readonly Account[],
  entradas: readonly DisplayEntry[],
): ResumoGeral {
  const daVez = contas
    .filter((c) => ehInvestimento(c) && !c.archived)
    .map((c) => resumoDoInvestimento(c, entradas));

  return {
    contas: daVez,
    saldo: daVez.reduce((s, r) => s + r.saldo, 0),
    aportado: daVez.reduce((s, r) => s + r.aportado, 0),
    retirado: daVez.reduce((s, r) => s + r.retirado, 0),
    rendimento: daVez.reduce((s, r) => s + r.rendimento, 0),
  };
}

export type MovimentoDeInvestimento = 'aporte' | 'retirada' | 'rendimento';

export const ROTULOS: Record<MovimentoDeInvestimento, { titulo: string; ajuda: string }> = {
  aporte: {
    titulo: 'Aportar',
    ajuda: 'Dinheiro saindo da conta e indo para o investimento. Sai do caixa do mês.',
  },
  retirada: {
    titulo: 'Retirar',
    ajuda: 'Resgate: o dinheiro volta para a conta e vira caixa disponível.',
  },
  rendimento: {
    titulo: 'Rendimento',
    ajuda: 'O que o investimento rendeu sozinho. Não conta como entrada do mês — só vira caixa quando você resgatar.',
  },
};
