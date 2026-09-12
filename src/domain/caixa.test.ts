import { describe, expect, it } from 'vitest';

import {
  CONTAS_DE_CAIXA, dividaDosCartoes, lerCaixa, saldoDisponivel, saldoInvestido,
} from './caixa.ts';
import { netWorth, type DayPoint } from './summary.ts';
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
  conta('cartao', 'credit_card', 0),
];

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
    expect(saldoDisponivel(contas, entradas)).toBe(162000); // 1000 + 500 + 120
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
    expect(saldoDisponivel(contas, entradas)).toBe(162000);
    expect(saldoDisponivel(contas, entradas)).toBeLessThan(patrimonio);
  });

  it('o investido aparece à parte, e não somado', () => {
    expect(saldoInvestido(contas, entradas)).toBe(2600000);
  });

  it('a dívida do cartão vem positiva, que é como se lê "devo tanto"', () => {
    expect(dividaDosCartoes(contas, entradas)).toBe(30000);
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
