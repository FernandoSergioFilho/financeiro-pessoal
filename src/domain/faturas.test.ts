import { describe, expect, it } from 'vitest';

import { diaDoMes, faturaAberta, faturasAbertas, proximoDiaDoMes } from './faturas.ts';
import type { Account, DisplayEntry } from './types.ts';

const STAMP = '2026-01-01T00:00:00.000Z';

const cartao = (over: Partial<Account> = {}): Account => ({
  id: 'nu', name: 'Cartão', kind: 'credit_card', openingBalance: 0, color: 'violet',
  closingDay: 28, dueDay: 5, updatedAt: STAMP, ...over,
});

let n = 0;
const gasto = (date: string, amount: number, over: Partial<DisplayEntry> = {}): DisplayEntry => {
  n += 1;
  return {
    id: `e${n}`, date, description: 'x', amount, kind: 'expense', accountId: 'nu',
    toAccountId: null, categoryId: null, status: 'pending', recurringId: null,
    occurrenceDate: null, purchaseId: null, installmentNumber: null, installmentTotal: null,
    createdAt: STAMP, updatedAt: STAMP, ...over,
  } as DisplayEntry;
};

describe('diaDoMes', () => {
  it('devolve aquele dia no mês da referência', () => {
    expect(diaDoMes('2026-09-15', 28)).toBe('2026-09-28');
  });

  // Sem isto, um cartão que fecha dia 31 nunca fecharia em fevereiro.
  it('encolhe para o último dia quando o mês é curto', () => {
    expect(diaDoMes('2026-02-10', 31)).toBe('2026-02-28');
    expect(diaDoMes('2028-02-10', 31)).toBe('2028-02-29');
  });

  it('não aceita dia fora do calendário', () => {
    expect(diaDoMes('2026-09-15', 0)).toBe('2026-09-01');
    expect(diaDoMes('2026-09-15', 99)).toBe('2026-09-30');
  });
});

describe('proximoDiaDoMes', () => {
  it('é o deste mês quando ainda não passou', () => {
    expect(proximoDiaDoMes('2026-09-15', 28)).toBe('2026-09-28');
  });

  it('é hoje quando hoje é o dia', () => {
    expect(proximoDiaDoMes('2026-09-28', 28)).toBe('2026-09-28');
  });

  it('vira o mês quando já passou', () => {
    expect(proximoDiaDoMes('2026-09-29', 28)).toBe('2026-10-28');
  });

  it('vira o ano em dezembro', () => {
    expect(proximoDiaDoMes('2026-12-29', 28)).toBe('2027-01-28');
  });
});

describe('faturaAberta', () => {
  it('junta o que foi comprado desde o fechamento anterior', () => {
    const fatura = faturaAberta(
      cartao(),
      [
        gasto('2026-08-27', 10000), // fatura anterior: fechou dia 28/08
        gasto('2026-08-29', 20000),
        gasto('2026-09-10', 30000),
        gasto('2026-09-29', 40000), // já é da próxima
      ],
      '2026-09-15',
    )!;
    expect(fatura.fecha).toBe('2026-09-28');
    expect(fatura.comecaEm).toBe('2026-08-28');
    expect(fatura.total).toBe(50000);
    expect(fatura.lancamentos).toBe(2);
  });

  it('a compra do próprio dia do fechamento ainda entra', () => {
    const fatura = faturaAberta(cartao(), [gasto('2026-09-28', 10000)], '2026-09-15')!;
    expect(fatura.total).toBe(10000);
  });

  it('a compra do dia do fechamento anterior já não entra', () => {
    const fatura = faturaAberta(cartao(), [gasto('2026-08-28', 10000)], '2026-09-15')!;
    expect(fatura.total).toBe(0);
  });

  it('fechando dia 28 e vencendo dia 5, o vencimento é do mês seguinte', () => {
    expect(faturaAberta(cartao(), [], '2026-09-15')!.vence).toBe('2026-10-05');
  });

  it('fechando dia 5 e vencendo dia 20, o vencimento é do mesmo mês', () => {
    const fatura = faturaAberta(cartao({ closingDay: 5, dueDay: 20 }), [], '2026-09-02')!;
    expect(fatura.fecha).toBe('2026-09-05');
    expect(fatura.vence).toBe('2026-09-20');
  });

  it('ignora lançamento de outro cartão', () => {
    const fatura = faturaAberta(cartao(), [gasto('2026-09-10', 30000, { accountId: 'outro' })], '2026-09-15')!;
    expect(fatura.total).toBe(0);
  });

  it('o pagamento da fatura não é compra: só despesa entra', () => {
    const entrada = gasto('2026-09-10', 30000, { kind: 'income' });
    expect(faturaAberta(cartao(), [entrada], '2026-09-15')!.total).toBe(0);
  });

  it('conta que não é cartão não tem fatura', () => {
    expect(faturaAberta(cartao({ kind: 'checking' }), [], '2026-09-15')).toBeNull();
  });

  it('cartão sem dia de fechamento não tem como ter fatura', () => {
    expect(faturaAberta(cartao({ closingDay: null }), [], '2026-09-15')).toBeNull();
  });

  it('conta o que já foi pago e o que não foi — a fatura é o que foi comprado', () => {
    const fatura = faturaAberta(
      cartao(),
      [gasto('2026-09-10', 10000, { status: 'settled' }), gasto('2026-09-11', 20000)],
      '2026-09-15',
    )!;
    expect(fatura.total).toBe(30000);
  });
});

describe('faturasAbertas', () => {
  it('lista só os cartões, da que vence antes para a última', () => {
    const contas = [
      cartao({ id: 'a', name: 'Amex', closingDay: 15, dueDay: 25 }),
      cartao({ id: 'b', name: 'Nu', closingDay: 28, dueDay: 5 }),
      cartao({ id: 'c', name: 'Conta', kind: 'checking' }),
    ];
    const faturas = faturasAbertas(contas, [], '2026-09-10');
    expect(faturas.map((f) => f.conta.name)).toEqual(['Amex', 'Nu']);
    expect(faturas[0]!.vence < faturas[1]!.vence).toBe(true);
  });

  it('cartão arquivado fica de fora', () => {
    expect(faturasAbertas([cartao({ archived: true })], [], '2026-09-10')).toEqual([]);
  });
});
