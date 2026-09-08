import { describe, expect, it } from 'vitest';
import {
  accountBalance,
  categoryChanges,
  dailyBalance,
  entryDelta,
  monthlySeries,
  netWorth,
  periodTotals,
  totalsByCategory,
} from './summary.ts';
import type { Account, Category, DisplayEntry, Entry } from './types.ts';

function entry(overrides: Partial<Entry> = {}): Entry {
  return {
    id: 'e1',
    date: '2026-09-10',
    description: 'Mercado',
    amount: 15000,
    kind: 'expense',
    accountId: 'conta',
    toAccountId: null,
    categoryId: 'alimentacao',
    status: 'settled',
    recurringId: null,
    occurrenceDate: null,
    purchaseId: null,
    installmentNumber: null,
    installmentTotal: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

const conta: Account = { id: 'conta', name: 'Conta corrente', kind: 'checking', openingBalance: 100000, color: 'blue', updatedAt: '2026-01-01T00:00:00.000Z' };
const poupanca: Account = { id: 'poupanca', name: 'Poupança', kind: 'savings', openingBalance: 0, color: 'aqua', updatedAt: '2026-01-01T00:00:00.000Z' };

describe('entryDelta', () => {
  it('soma receita e subtrai despesa na conta do lançamento', () => {
    expect(entryDelta(entry({ kind: 'income', amount: 5000 }), 'conta')).toBe(5000);
    expect(entryDelta(entry({ kind: 'expense', amount: 5000 }), 'conta')).toBe(-5000);
  });

  it('ignora lançamento de outra conta', () => {
    expect(entryDelta(entry(), 'poupanca')).toBe(0);
  });

  it('dá sinais opostos às duas pontas de uma transferência', () => {
    const t = entry({ kind: 'transfer', amount: 20000, accountId: 'conta', toAccountId: 'poupanca' });
    expect(entryDelta(t, 'conta')).toBe(-20000);
    expect(entryDelta(t, 'poupanca')).toBe(20000);
    expect(entryDelta(t, 'outra')).toBe(0);
  });
});

describe('accountBalance', () => {
  const entries = [
    entry({ id: 'a', kind: 'income', amount: 300000, date: '2026-09-05' }),
    entry({ id: 'b', kind: 'expense', amount: 50000, date: '2026-09-10' }),
    entry({ id: 'c', kind: 'expense', amount: 20000, date: '2026-09-20', status: 'pending' }),
  ];

  it('parte do saldo inicial e aplica os lançamentos', () => {
    expect(accountBalance(conta, entries)).toBe(100000 + 300000 - 50000 - 20000);
  });

  it('separa o saldo já realizado do previsto', () => {
    expect(accountBalance(conta, entries, { onlySettled: true })).toBe(350000);
  });

  it('corta na data pedida', () => {
    expect(accountBalance(conta, entries, { upTo: '2026-09-05' })).toBe(400000);
  });

  it('move o saldo das duas contas numa transferência', () => {
    const t = [entry({ kind: 'transfer', amount: 40000, accountId: 'conta', toAccountId: 'poupanca' })];
    expect(accountBalance(conta, t)).toBe(60000);
    expect(accountBalance(poupanca, t)).toBe(40000);
  });
});

describe('netWorth', () => {
  it('soma as contas e não conta a transferência duas vezes', () => {
    const t = [entry({ kind: 'transfer', amount: 40000, accountId: 'conta', toAccountId: 'poupanca' })];
    expect(netWorth([conta, poupanca], t)).toBe(100000);
  });

  it('ignora contas arquivadas', () => {
    expect(netWorth([conta, { ...poupanca, openingBalance: 999, archived: true }], [])).toBe(100000);
  });
});

describe('periodTotals', () => {
  const entries = [
    entry({ kind: 'income', amount: 500000 }),
    entry({ kind: 'income', amount: 100000, status: 'pending' }),
    entry({ kind: 'expense', amount: 120000 }),
    entry({ kind: 'expense', amount: 30000, status: 'pending' }),
    entry({ kind: 'transfer', amount: 999999, toAccountId: 'poupanca' }),
  ];

  it('separa entradas e saídas por situação', () => {
    expect(periodTotals(entries)).toEqual({
      income: 600000,
      expense: 150000,
      net: 450000,
      settledIncome: 500000,
      settledExpense: 120000,
      pendingIncome: 100000,
      pendingExpense: 30000,
    });
  });

  it('não trata transferência como receita nem despesa', () => {
    expect(periodTotals([entries[4]!])).toMatchObject({ income: 0, expense: 0, net: 0 });
  });

  it('devolve zeros para período vazio', () => {
    expect(periodTotals([])).toMatchObject({ income: 0, expense: 0, net: 0 });
  });
});

describe('totalsByCategory', () => {
  const categories: Category[] = [
    { id: 'alimentacao', name: 'Alimentação', kind: 'expense', color: 'blue', emoji: '🍽️', updatedAt: '2026-01-01T00:00:00.000Z' },
    { id: 'transporte', name: 'Transporte', kind: 'expense', color: 'orange', emoji: '🚌', updatedAt: '2026-01-01T00:00:00.000Z' },
  ];

  it('agrupa por categoria e ordena do maior para o menor', () => {
    const result = totalsByCategory(
      [
        entry({ categoryId: 'transporte', amount: 20000 }),
        entry({ categoryId: 'alimentacao', amount: 50000 }),
        entry({ categoryId: 'alimentacao', amount: 30000 }),
      ],
      categories,
      'expense',
    );
    expect(result.map((r) => [r.category?.name, r.amount])).toEqual([
      ['Alimentação', 80000],
      ['Transporte', 20000],
    ]);
    expect(result[0]!.share).toBeCloseTo(0.8);
  });

  it('agrupa os lançamentos sem categoria', () => {
    const result = totalsByCategory([entry({ categoryId: null, amount: 1000 })], categories, 'expense');
    expect(result[0]!.category).toBeNull();
  });
});

describe('monthlySeries', () => {
  it('devolve um ponto por mês pedido, inclusive os vazios', () => {
    const series = monthlySeries(
      [
        entry({ date: '2026-08-03', kind: 'income', amount: 100000 }),
        entry({ date: '2026-08-20', kind: 'expense', amount: 40000 }),
      ],
      ['2026-07', '2026-08', '2026-09'],
    );
    expect(series).toEqual([
      { key: '2026-07', income: 0, expense: 0, net: 0 },
      { key: '2026-08', income: 100000, expense: 40000, net: 60000 },
      { key: '2026-09', income: 0, expense: 0, net: 0 },
    ]);
  });
});

/* ------------------------------------------------- saldo dia a dia */

describe('dailyBalance', () => {
  const entrada = (date: string, amount: number): DisplayEntry =>
    ({ id: date + amount, date, description: 'x', amount, kind: 'income', accountId: 'a', status: 'settled',
       createdAt: '', updatedAt: '' }) as DisplayEntry;
  const saida = (date: string, amount: number): DisplayEntry =>
    ({ id: date + amount, date, description: 'x', amount, kind: 'expense', accountId: 'a', status: 'settled',
       createdAt: '', updatedAt: '' }) as DisplayEntry;

  it('cobre o mês inteiro, um ponto por dia', () => {
    const pontos = dailyBalance([], '2026-02', 0, '2026-02-15');
    expect(pontos).toHaveLength(28);
    expect(pontos[0]?.date).toBe('2026-02-01');
    expect(pontos.at(-1)?.date).toBe('2026-02-28');
  });

  it('acumula a partir do saldo de abertura', () => {
    const pontos = dailyBalance([entrada('2026-03-02', 1000), saida('2026-03-04', 300)], '2026-03', 5000, '2026-03-31');
    expect(pontos[0]?.balance).toBe(5000); // dia 1, sem movimento
    expect(pontos[1]?.balance).toBe(6000); // dia 2
    expect(pontos[2]?.balance).toBe(6000); // dia 3, sem movimento: mantém
    expect(pontos[3]?.balance).toBe(5700); // dia 4
    expect(pontos.at(-1)?.balance).toBe(5700);
  });

  it('marca como previsto só o que vem depois de hoje', () => {
    const pontos = dailyBalance([], '2026-03', 0, '2026-03-10');
    expect(pontos.find((p) => p.date === '2026-03-10')?.projected).toBe(false);
    expect(pontos.find((p) => p.date === '2026-03-11')?.projected).toBe(true);
  });

  // Sai de uma conta e entra na outra: o total não muda.
  it('ignora transferência entre contas próprias', () => {
    const transferencia = { id: 't', date: '2026-03-05', description: 'x', amount: 900, kind: 'transfer',
      accountId: 'a', toAccountId: 'b', status: 'settled', createdAt: '', updatedAt: '' } as DisplayEntry;
    const pontos = dailyBalance([transferencia], '2026-03', 100, '2026-03-31');
    expect(pontos.every((p) => p.balance === 100)).toBe(true);
  });

  it('vários lançamentos no mesmo dia entram juntos', () => {
    const pontos = dailyBalance([saida('2026-03-03', 100), saida('2026-03-03', 250)], '2026-03', 1000, '2026-03-31');
    expect(pontos[2]?.balance).toBe(650);
  });
});

/* ------------------------------------- comparação com o mês anterior */

describe('categoryChanges', () => {
  const cats = [
    { id: 'c1', name: 'Alimentação', kind: 'expense', emoji: '🍽', color: 'blue', updatedAt: '' },
    { id: 'c2', name: 'Lazer', kind: 'expense', emoji: '🎬', color: 'orange', updatedAt: '' },
  ] as Category[];
  const gasto = (id: string, categoryId: string | null, amount: number): DisplayEntry =>
    ({ id, date: '2026-03-01', description: 'x', amount, kind: 'expense', accountId: 'a', categoryId,
       status: 'settled', createdAt: '', updatedAt: '' }) as DisplayEntry;

  it('mostra quanto cada categoria subiu ou desceu', () => {
    const mudou = categoryChanges(
      [gasto('1', 'c1', 5000), gasto('2', 'c2', 1000)],
      [gasto('3', 'c1', 3000), gasto('4', 'c2', 4000)],
      cats,
    );
    expect(mudou.map((m) => [m.category?.name, m.diff])).toEqual([
      ['Lazer', -3000],
      ['Alimentação', 2000],
    ]);
  });

  it('ordena pelo tamanho da mudança, não pelo valor gasto', () => {
    const mudou = categoryChanges(
      [gasto('1', 'c1', 10000), gasto('2', 'c2', 500)],
      [gasto('3', 'c1', 9900), gasto('4', 'c2', 100)],
      cats,
    );
    expect(mudou[0]?.category?.name).toBe('Lazer'); // +400 pesa mais que +100
  });

  it('deixa de fora quem não mudou — não informa nada', () => {
    const mudou = categoryChanges([gasto('1', 'c1', 5000)], [gasto('2', 'c1', 5000)], cats);
    expect(mudou).toEqual([]);
  });

  it('conta categoria que apareceu ou sumiu de um mês para o outro', () => {
    const mudou = categoryChanges([gasto('1', 'c1', 5000)], [], cats);
    expect(mudou[0]).toMatchObject({ current: 5000, previous: 0, diff: 5000 });
  });

  it('não mistura entradas com saídas', () => {
    const salario = { id: 's', date: '2026-03-01', description: 'x', amount: 90000, kind: 'income',
      accountId: 'a', categoryId: 'c1', status: 'settled', createdAt: '', updatedAt: '' } as DisplayEntry;
    expect(categoryChanges([salario], [], cats)).toEqual([]);
  });
});
