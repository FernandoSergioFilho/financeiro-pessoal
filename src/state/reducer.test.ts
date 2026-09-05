import { describe, expect, it } from 'vitest';
import { buildPurchase } from '../domain/installments.ts';
import type { Entry, FinanceData, RecurringRule } from '../domain/types.ts';
import { accountInUse, reducer } from './reducer.ts';

const STAMP = '2026-09-01T00:00:00.000Z';

function rule(overrides: Partial<RecurringRule> = {}): RecurringRule {
  return {
    id: 'r1', description: 'Aluguel', amount: 180000, kind: 'expense',
    accountId: 'a1', toAccountId: null, categoryId: 'c1',
    frequency: 'monthly', interval: 1, startDate: '2026-01-10',
    endDate: null, maxOccurrences: null, active: true, skippedDates: [],
    createdAt: STAMP, updatedAt: STAMP, ...overrides,
  };
}

function entry(overrides: Partial<Entry> = {}): Entry {
  return {
    id: 'e1', date: '2026-09-10', description: 'Mercado', amount: 15000,
    kind: 'expense', accountId: 'a1', toAccountId: null, categoryId: 'c1',
    status: 'settled', recurringId: null, occurrenceDate: null,
    purchaseId: null, installmentNumber: null, installmentTotal: null,
    createdAt: STAMP, updatedAt: STAMP, ...overrides,
  };
}

function state(overrides: Partial<FinanceData> = {}): FinanceData {
  return {
    version: 1,
    accounts: [{ id: 'a1', name: 'Conta', kind: 'checking', openingBalance: 0, color: 'blue', updatedAt: STAMP }],
    categories: [{ id: 'c1', name: 'Casa', kind: 'expense', color: 'blue', emoji: '🏠', updatedAt: STAMP }],
    entries: [], recurring: [], purchases: [], tombstones: [], ...overrides,
  };
}

describe('lançamentos', () => {
  it('cria, edita e apaga', () => {
    let s = reducer(state(), { type: 'entry/create', entry: entry() });
    expect(s.entries).toHaveLength(1);

    s = reducer(s, { type: 'entry/update', id: 'e1', patch: { amount: 20000 }, updatedAt: '2026-09-02T00:00:00.000Z' });
    expect(s.entries[0]).toMatchObject({ amount: 20000, updatedAt: '2026-09-02T00:00:00.000Z' });

    s = reducer(s, { type: 'entry/delete', id: 'e1', deletedAt: STAMP });
    expect(s.entries).toHaveLength(0);
  });

  it('não mexe no estado anterior', () => {
    const before = state({ entries: [entry()] });
    reducer(before, { type: 'entry/update', id: 'e1', patch: { amount: 1 }, updatedAt: STAMP });
    expect(before.entries[0]!.amount).toBe(15000);
  });
});

describe('ocorrências de contas recorrentes', () => {
  it('apagar a ocorrência gravada também dispensa aquele mês na regra', () => {
    const s = reducer(
      state({ recurring: [rule()], entries: [entry({ recurringId: 'r1', occurrenceDate: '2026-09-10' })] }),
      { type: 'entry/delete', id: 'e1', deletedAt: STAMP },
    );
    expect(s.entries).toHaveLength(0);
    expect(s.recurring[0]!.skippedDates).toEqual(['2026-09-10']);
  });

  it('apagar um lançamento avulso não toca nas regras', () => {
    const s = reducer(state({ recurring: [rule()], entries: [entry()] }), { type: 'entry/delete', id: 'e1', deletedAt: STAMP });
    expect(s.recurring[0]!.skippedDates).toEqual([]);
  });

  it('dispensa uma ocorrência ainda não gravada', () => {
    const s = reducer(state({ recurring: [rule()] }), {
      type: 'occurrence/skip', recurringId: 'r1', date: '2026-10-10', updatedAt: STAMP,
    });
    expect(s.recurring[0]!.skippedDates).toEqual(['2026-10-10']);
  });

  it('não duplica a mesma dispensa', () => {
    let s = state({ recurring: [rule({ skippedDates: ['2026-10-10'] })] });
    s = reducer(s, { type: 'occurrence/skip', recurringId: 'r1', date: '2026-10-10', updatedAt: STAMP });
    expect(s.recurring[0]!.skippedDates).toEqual(['2026-10-10']);
  });

  it('apagar a regra preserva o histórico já lançado, sem vínculo quebrado', () => {
    const s = reducer(
      state({ recurring: [rule()], entries: [entry({ recurringId: 'r1', occurrenceDate: '2026-09-10' })] }),
      { type: 'recurring/delete', id: 'r1', deletedAt: STAMP },
    );
    expect(s.recurring).toHaveLength(0);
    expect(s.entries[0]).toMatchObject({ recurringId: null, occurrenceDate: null, amount: 15000 });
  });
});

describe('compras parceladas', () => {
  const built = buildPurchase(
    { description: 'TV', totalAmount: 300000, installments: 6, firstDate: '2026-09-05', accountId: 'a1', categoryId: 'c1' },
    (() => { let n = 0; return () => `p${++n}`; })(),
  );

  it('grava a compra e todas as parcelas de uma vez', () => {
    const s = reducer(state(), { type: 'purchase/create', purchase: built.purchase, entries: built.entries });
    expect(s.purchases).toHaveLength(1);
    expect(s.entries).toHaveLength(6);
  });

  it('apagar a compra leva junto as parcelas dela, e só elas', () => {
    let s = reducer(state({ entries: [entry({ id: 'avulso' })] }), {
      type: 'purchase/create', purchase: built.purchase, entries: built.entries,
    });
    s = reducer(s, { type: 'purchase/delete', id: built.purchase.id, deletedAt: STAMP });
    expect(s.purchases).toHaveLength(0);
    expect(s.entries.map((e) => e.id)).toEqual(['avulso']);
  });

  it('apagar uma parcela isolada mantém as demais', () => {
    let s = reducer(state(), { type: 'purchase/create', purchase: built.purchase, entries: built.entries });
    s = reducer(s, { type: 'entry/delete', id: built.entries[0]!.id, deletedAt: STAMP });
    expect(s.entries).toHaveLength(5);
    expect(s.purchases).toHaveLength(1);
  });
});

describe('contas', () => {
  it('exclui de vez a conta que nunca foi usada', () => {
    const s = reducer(state(), { type: 'account/delete', id: 'a1', deletedAt: STAMP });
    expect(s.accounts).toHaveLength(0);
  });

  it('arquiva, em vez de excluir, a conta com movimento', () => {
    const s = reducer(state({ entries: [entry()] }), { type: 'account/delete', id: 'a1', deletedAt: STAMP });
    expect(s.accounts[0]).toMatchObject({ id: 'a1', archived: true });
    expect(s.entries).toHaveLength(1);
  });

  it('reconhece a conta usada como destino de transferência', () => {
    const s = state({ entries: [entry({ kind: 'transfer', accountId: 'outra', toAccountId: 'a1' })] });
    expect(accountInUse(s, 'a1')).toBe(true);
    expect(accountInUse(s, 'nenhuma')).toBe(false);
  });

  it('reconhece a conta usada apenas por uma regra recorrente', () => {
    expect(accountInUse(state({ recurring: [rule()] }), 'a1')).toBe(true);
  });
});

describe('marcas de exclusão', () => {
  it('toda exclusão deixa rastro, para o outro aparelho saber', () => {
    const s = reducer(state({ entries: [entry()] }), { type: 'entry/delete', id: 'e1', deletedAt: STAMP });
    expect(s.tombstones).toEqual([{ table: 'entries', id: 'e1', deletedAt: STAMP }]);
  });

  it('apagar a compra marca a compra e cada parcela', () => {
    const built = buildPurchase(
      { description: 'TV', totalAmount: 30000, installments: 3, firstDate: '2026-09-05', accountId: 'a1', categoryId: 'c1' },
      (() => { let n = 0; return () => `t${++n}`; })(),
    );
    let s = reducer(state(), { type: 'purchase/create', purchase: built.purchase, entries: built.entries });
    s = reducer(s, { type: 'purchase/delete', id: built.purchase.id, deletedAt: STAMP });

    expect(s.tombstones.filter((t) => t.table === 'purchases')).toHaveLength(1);
    expect(s.tombstones.filter((t) => t.table === 'entries')).toHaveLength(3);
  });

  it('arquivar uma conta em uso não deixa marca de exclusão', () => {
    // Ela não foi apagada: continua existindo, só saiu dos formulários.
    const s = reducer(state({ entries: [entry()] }), { type: 'account/delete', id: 'a1', deletedAt: STAMP });
    expect(s.tombstones).toEqual([]);
    expect(s.accounts[0]).toMatchObject({ archived: true, updatedAt: STAMP });
  });

  it('apagar de vez uma conta sem uso deixa marca', () => {
    const s = reducer(state(), { type: 'account/delete', id: 'a1', deletedAt: STAMP });
    expect(s.tombstones).toEqual([{ table: 'accounts', id: 'a1', deletedAt: STAMP }]);
  });

  it('não duplica a marca se a mesma exclusão chegar duas vezes', () => {
    let s = reducer(state({ entries: [entry()] }), { type: 'entry/delete', id: 'e1', deletedAt: STAMP });
    s = reducer(s, { type: 'entry/delete', id: 'e1', deletedAt: '2026-09-09T00:00:00.000Z' });
    expect(s.tombstones).toHaveLength(1);
    expect(s.tombstones[0]!.deletedAt).toBe(STAMP);
  });

  it('carimba os registros que a exclusão alterou de tabela', () => {
    // Sem o carimbo novo, o desvínculo não viajaria para os outros aparelhos.
    const s = reducer(
      state({ recurring: [rule()], entries: [entry({ recurringId: 'r1', occurrenceDate: '2026-09-10' })] }),
      { type: 'recurring/delete', id: 'r1', deletedAt: '2026-09-30T00:00:00.000Z' },
    );
    expect(s.entries[0]).toMatchObject({ recurringId: null, updatedAt: '2026-09-30T00:00:00.000Z' });
  });
});

describe('categorias', () => {
  it('apagar a categoria deixa os lançamentos sem categoria, não os apaga', () => {
    const s = reducer(state({ entries: [entry()], recurring: [rule()] }), { type: 'category/delete', id: 'c1', deletedAt: STAMP });
    expect(s.categories).toHaveLength(0);
    expect(s.entries[0]).toMatchObject({ categoryId: null, amount: 15000 });
    expect(s.recurring[0]!.categoryId).toBeNull();
  });
});
