import { describe, expect, it } from 'vitest';

import {
  CONTAS_DE_CAIXA, dividaDosCartoes, lerCaixa, saldoDisponivel, saldoInvestido,
} from './caixa.ts';
import { balanceWalk, netWorth, type DayPoint } from './summary.ts';
import { comDataDeCaixa, quandoSai } from './faturas.ts';
import { addDays } from './date.ts';
import type { Account, AccountKind, Entry, DisplayEntry } from './types.ts';

const STAMP = '2026-01-01T00:00:00.000Z';

function conta(id: string, kind: AccountKind, openingBalance: number): Account {
  return { id, name: id, kind, openingBalance, color: 'blue', updatedAt: STAMP };
}

const contas = [
  conta('corrente', 'checking', 100000),
  conta('poupanca', 'savings', 50000),
  conta('carteira', 'cash', 12000),
  conta('tesouro', 'investment', 2600000),
  // Com ciclo, como um cartão de verdade: fecha dia 25, vence dia 5. Sem isso
  // o app não tem data de vencimento e trata a compra como débito.
  { ...conta('cartao', 'credit_card', 0), closingDay: 25, dueDay: 5 },
];

/** A compra de 05/09 cai na fatura que fecha em 25/09 e vence em 05/10. */
const ANTES_DE_VENCER = '2026-09-30';
const DEPOIS_DE_VENCER = '2026-10-06';

const compraNoCartao: Entry = {
  id: 'e1', date: '2026-09-05', description: 'compra', amount: 30000, kind: 'expense',
  accountId: 'cartao', toAccountId: null, categoryId: null, status: 'settled',
  recurringId: null, occurrenceDate: null, purchaseId: null, installmentNumber: null,
  installmentTotal: null, createdAt: STAMP, updatedAt: STAMP,
};
const entradas: DisplayEntry[] = [compraNoCartao];

describe('o que conta como caixa', () => {
  it('corrente, poupança e dinheiro — e mais nada', () => {
    expect(CONTAS_DE_CAIXA).toEqual(['checking', 'savings', 'cash']);
  });

  it('o disponível soma só as contas de onde o dinheiro sai', () => {
    // 1000 + 500 + 120, e o investido fora.
    expect(saldoDisponivel(contas, entradas, { upTo: ANTES_DE_VENCER })).toBe(162000);
  });

  /*
   * Este par é a correção de um defeito que apareceu na tela do usuário: o
   * aviso e o gráfico mostravam saldos diferentes para o MESMO dia, e a
   * diferença era o total das faturas já vencidas. O saldo em conta não
   * descontava a fatura porque a compra pertence à conta do CARTÃO; o gráfico
   * descontava, porque anda pela data de caixa.
   */
  it('depois de a fatura vencer, o dinheiro saiu da conta', () => {
    expect(saldoDisponivel(contas, entradas, { upTo: DEPOIS_DE_VENCER })).toBe(132000);
  });

  /*
   * O defeito que motivou o módulo. O painel mostrava patrimônio líquido como
   * se fosse caixa: infla com o que está investido (que não é dinheiro deste
   * mês) e desconta uma dívida de cartão que ainda vai aparecer sozinha como
   * saída no dia em que a fatura vence. Contada duas vezes na cabeça de quem
   * lê, ainda que não na aritmética.
   */
  it('o disponível não é o patrimônio líquido', () => {
    const patrimonio = netWorth(contas, entradas);
    expect(patrimonio).toBe(2732000); // com o investido, menos a dívida
    expect(saldoDisponivel(contas, entradas, { upTo: ANTES_DE_VENCER })).toBe(162000);
    expect(saldoDisponivel(contas, entradas, { upTo: ANTES_DE_VENCER })).toBeLessThan(patrimonio);
  });

  it('o investido aparece à parte, e não somado', () => {
    expect(saldoInvestido(contas, entradas)).toBe(2600000);
  });

  it('a dívida do cartão vem positiva, que é como se lê "devo tanto"', () => {
    expect(dividaDosCartoes(contas, entradas, { upTo: ANTES_DE_VENCER })).toBe(30000);
  });

  it('depois de sair da conta, deixa de ser "fatura por vencer"', () => {
    // Senão o mesmo dinheiro contaria duas vezes contra quem lê: descontado do
    // saldo e ainda listado como dívida a vencer.
    expect(dividaDosCartoes(contas, entradas, { upTo: DEPOIS_DE_VENCER })).toBe(0);
  });

  it('cartão sem dívida não vira crédito', () => {
    expect(dividaDosCartoes([conta('cartao', 'credit_card', 0)], [])).toBe(0);
  });

  it('conta arquivada não entra em nenhum dos três', () => {
    const arquivada = [{ ...conta('velha', 'checking', 999900), archived: true }];
    expect(saldoDisponivel(arquivada, [])).toBe(0);
  });
});

describe('lerCaixa', () => {
  const ponto = (date: string, balance: number): DayPoint => ({ date, balance, projected: true });

  it('acha o primeiro dia no vermelho, e não o pior', () => {
    const leitura = lerCaixa([
      ponto('2026-09-01', 50000),
      ponto('2026-09-17', -3400),
      ponto('2026-09-20', -90000),
      ponto('2026-09-30', 10000),
    ]);
    expect(leitura.primeiroNegativo?.date).toBe('2026-09-17');
    expect(leitura.menorSaldo?.date).toBe('2026-09-20');
  });

  /*
   * O aviso útil vem antes do vermelho: terminar o pior dia com R$ 40 não é
   * negativo, e é exatamente a hora de não parcelar mais nada. Por isso o
   * menor saldo é lido mesmo quando nunca há negativo.
   */
  it('sem nenhum dia negativo, ainda diz qual foi o momento mais apertado', () => {
    const leitura = lerCaixa([
      ponto('2026-09-01', 50000),
      ponto('2026-09-19', 4000),
      ponto('2026-09-30', 80000),
    ]);
    expect(leitura.primeiroNegativo).toBeNull();
    expect(leitura.menorSaldo?.balance).toBe(4000);
    expect(leitura.saldoFinal).toBe(80000);
  });

  it('percurso vazio não inventa nada', () => {
    expect(lerCaixa([])).toEqual({ primeiroNegativo: null, menorSaldo: null, saldoFinal: null });
  });

  it('zero não é vermelho', () => {
    expect(lerCaixa([ponto('2026-09-01', 0)]).primeiroNegativo).toBeNull();
  });
});

/*
 * O defeito que o usuário viu na tela: o aviso dizia que em 03/10 o saldo era
 * -R$ 543,99 e o gráfico, na mesma tela e no mesmo dia, dizia -R$ 3.119,53.
 *
 * A causa é que havia DUAS definições de saldo no app:
 *
 * - `saldoDisponivel` somava só as contas de caixa. Uma compra no cartão
 *   pertence à conta do CARTÃO, então a fatura nunca reduzia o saldo da conta
 *   corrente — nem depois de paga.
 * - `balanceWalk` (o gráfico) trata cada lançamento como dinheiro saindo no dia
 *   em que a fatura vence, que é o modelo que o app promete no tutorial:
 *   "ele mostra quando o dinheiro sai da sua conta".
 *
 * A diferença entre os dois era a soma de todas as faturas já vencidas — e por
 * isso o número ficava mais perto da verdade quanto maior o intervalo
 * escolhido, que foi exatamente o que o usuário relatou.
 *
 * A invariante abaixo é a que fecha esse buraco para sempre: o saldo de
 * abertura mais o percurso TEM de dar o saldo no fim. Se as duas contas
 * voltarem a divergir, é aqui que aparece.
 */
describe('a fatura que já venceu sai do dinheiro disponível', () => {
  const T = '2026-09-01T00:00:00.000Z';
  const conta = (o: Partial<Account>): Account =>
    ({ id: 'x', name: 'x', kind: 'checking', openingBalance: 0, color: 'blue', updatedAt: T, ...o }) as Account;
  const lanc = (o: Partial<Entry>): Entry =>
    ({
      id: 'e', date: '2026-09-10', description: 'x', amount: 0, kind: 'expense',
      accountId: 'cc', toAccountId: null, categoryId: null, status: 'settled',
      recurringId: null, occurrenceDate: null, purchaseId: null,
      installmentNumber: null, installmentTotal: null, createdAt: T, updatedAt: T, ...o,
    }) as Entry;

  const contas = [
    conta({ id: 'cc', name: 'Conta corrente', kind: 'checking', openingBalance: 100000 }),
    conta({ id: 'card', name: 'Cartão', kind: 'credit_card', closingDay: 25, dueDay: 5 }),
  ];
  // Compra de R$ 300 em 10/09 → fecha 25/09, vence 05/10.
  const compra = lanc({ id: 'compra', accountId: 'card', date: '2026-09-10', amount: 30000 });

  const comCaixa = (entradas: readonly Entry[]): DisplayEntry[] =>
    comDataDeCaixa(contas, entradas as unknown as DisplayEntry[]);

  it('antes de a fatura vencer, o dinheiro ainda está na conta', () => {
    expect(saldoDisponivel(contas, comCaixa([compra]), { upTo: '2026-10-04' })).toBe(100000);
  });

  it('no dia em que a fatura vence, o dinheiro sai', () => {
    expect(saldoDisponivel(contas, comCaixa([compra]), { upTo: '2026-10-05' })).toBe(70000);
  });

  it('a dívida do cartão continua nascendo na compra, e não no vencimento', () => {
    // Esta é a outra metade do par, e ela NÃO muda: "o saldo do cartão é o que
    // você deve", e você já deve no dia em que passou o cartão.
    expect(dividaDosCartoes(contas, comCaixa([compra]), { upTo: '2026-09-11' })).toBe(30000);
  });

  it('o que já saiu não conta mais como "fatura por vencer"', () => {
    // Senão o mesmo dinheiro apareceria duas vezes contra a pessoa: descontado
    // do saldo e ainda listado como dívida a vencer.
    expect(dividaDosCartoes(contas, comCaixa([compra]), { upTo: '2026-10-05' })).toBe(0);
  });

  /*
   * A invariante que o usuário viu quebrada, em forma de teste.
   */
  it('abertura + percurso = saldo no fim, em qualquer recorte', () => {
    const entradas = comCaixa([
      compra,
      lanc({ id: 'salario', accountId: 'cc', date: '2026-09-05', kind: 'income', amount: 825000 }),
      lanc({ id: 'aluguel', accountId: 'cc', date: '2026-09-15', amount: 180000 }),
      lanc({ id: 'compra2', accountId: 'card', date: '2026-09-28', amount: 50000 }), // vence 05/11
    ]);

    for (const [de, ate] of [
      ['2026-09-01', '2026-10-03'],
      ['2026-10-01', '2026-10-31'],
      ['2026-09-20', '2026-11-10'],
    ]) {
      const vespera = addDays(de!, -1);
      const abertura = saldoDisponivel(contas, entradas, { upTo: vespera });
      const noFim = saldoDisponivel(contas, entradas, { upTo: ate! });
      const doPeriodo = entradas.filter((e) => quandoSai(e) >= de! && quandoSai(e) <= ate!);
      const percurso = balanceWalk(doPeriodo, de!, ate!, abertura, ate!);

      expect(`${de} a ${ate}: ${percurso.at(-1)!.balance}`).toBe(`${de} a ${ate}: ${noFim}`);
    }
  });
});
