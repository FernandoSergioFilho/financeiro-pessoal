import { describe, expect, it } from 'vitest';

import { contarDuplicados, juntarDuplicados } from './duplicates.ts';
import type { Account, Category, Entry, FinanceData, InstallmentPurchase, RecurringRule } from './types.ts';

const AGORA = '2026-09-08T12:00:00.000Z';

function conta(id: string, name: string, updatedAt = '2026-01-01T00:00:00.000Z', extra: Partial<Account> = {}): Account {
  return { id, name, kind: 'checking', openingBalance: 0, color: 'blue', updatedAt, ...extra };
}

function categoria(id: string, name: string, extra: Partial<Category> = {}): Category {
  return {
    id,
    name,
    kind: 'expense',
    color: 'blue',
    emoji: '🏠',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...extra,
  };
}

function lancamento(overrides: Partial<Entry> = {}): Entry {
  return {
    id: 'e1',
    date: '2026-09-01',
    description: 'Mercado',
    amount: 5000,
    kind: 'expense',
    accountId: 'c1',
    toAccountId: null,
    categoryId: 'k1',
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

function base(overrides: Partial<FinanceData> = {}): FinanceData {
  return {
    version: 1,
    accounts: [],
    categories: [],
    entries: [],
    recurring: [],
    purchases: [],
    tombstones: [],
    ...overrides,
  };
}

describe('contarDuplicados', () => {
  it('não vê repetição onde os nomes são diferentes', () => {
    const data = base({ accounts: [conta('c1', 'Conta corrente'), conta('c2', 'Carteira')] });
    expect(contarDuplicados(data)).toEqual({ contas: 0, categorias: 0 });
  });

  it('conta quantos cadastros sairiam, não quantos grupos existem', () => {
    const data = base({
      accounts: [conta('c1', 'Conta corrente'), conta('c2', 'Conta corrente'), conta('c3', 'conta CORRENTE')],
      categories: [categoria('k1', 'Alimentação'), categoria('k2', 'alimentacao')],
    });
    expect(contarDuplicados(data)).toEqual({ contas: 2, categorias: 1 });
  });

  it('não junta categorias de tipos diferentes com o mesmo nome', () => {
    const data = base({
      categories: [categoria('k1', 'Outros'), categoria('k2', 'Outros', { kind: 'income' })],
    });
    expect(contarDuplicados(data)).toEqual({ contas: 0, categorias: 0 });
  });
});

describe('juntarDuplicados', () => {
  it('devolve os mesmos dados quando não há o que juntar', () => {
    const data = base({ accounts: [conta('c1', 'Conta corrente')] });
    const { data: depois, resumo } = juntarDuplicados(data, AGORA);
    expect(depois).toBe(data);
    expect(resumo.contas).toEqual([]);
  });

  it('mantém um cadastro por nome e apaga os demais', () => {
    const data = base({
      accounts: [conta('c1', 'Conta corrente'), conta('c2', 'Conta Corrente'), conta('c3', 'Carteira')],
    });
    const { data: depois, resumo } = juntarDuplicados(data, AGORA);
    expect(depois.accounts.map((a) => a.id).sort()).toEqual(['c1', 'c3']);
    expect(resumo.contas).toEqual([{ nome: 'Conta corrente', quantidade: 2 }]);
  });

  it('faz os lançamentos apontarem para quem ficou', () => {
    const data = base({
      accounts: [conta('c1', 'Conta corrente'), conta('c2', 'Conta corrente')],
      categories: [categoria('k1', 'Moradia'), categoria('k2', 'moradia')],
      entries: [
        lancamento({ id: 'e1', accountId: 'c1', categoryId: 'k1' }),
        lancamento({ id: 'e2', accountId: 'c1', categoryId: 'k1' }),
        lancamento({ id: 'e3', accountId: 'c2', categoryId: 'k2' }),
      ],
    });
    const { data: depois, resumo } = juntarDuplicados(data, AGORA);
    const movido = depois.entries.find((e) => e.id === 'e3')!;
    expect(movido.accountId).toBe('c1');
    expect(movido.categoryId).toBe('k1');
    expect(movido.updatedAt).toBe(AGORA);
    // Só o que mudou é reescrito: os outros dois mantêm a data original.
    expect(resumo.registrosRemapeados).toBe(1);
    expect(depois.entries.find((e) => e.id === 'e1')!.updatedAt).toBe('2026-09-01T00:00:00.000Z');
  });

  it('remapeia também a conta de destino de uma transferência', () => {
    const data = base({
      accounts: [conta('c1', 'Carteira'), conta('c2', 'Carteira'), conta('c3', 'Conta corrente')],
      entries: [
        lancamento({ id: 'e1', accountId: 'c1', categoryId: null }),
        lancamento({ id: 'e2', accountId: 'c1', categoryId: null }),
        lancamento({ id: 'e3', kind: 'transfer', accountId: 'c3', toAccountId: 'c2', categoryId: null }),
      ],
    });
    const { data: depois } = juntarDuplicados(data, AGORA);
    const transferencia = depois.entries.find((e) => e.id === 'e3')!;
    expect(transferencia.toAccountId).toBe('c1');
    expect(transferencia.accountId).toBe('c3');
  });

  it('remapeia recorrentes e compras parceladas', () => {
    const regra: RecurringRule = {
      id: 'r1',
      description: 'Aluguel',
      amount: 100000,
      kind: 'expense',
      accountId: 'c2',
      toAccountId: null,
      categoryId: null,
      frequency: 'monthly',
      interval: 1,
      startDate: '2026-01-05',
      endDate: null,
      maxOccurrences: null,
      active: true,
      skippedDates: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const compra: InstallmentPurchase = {
      id: 'p1',
      description: 'Geladeira',
      totalAmount: 240000,
      installments: 12,
      firstDate: '2026-02-10',
      accountId: 'c2',
      categoryId: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const data = base({
      accounts: [conta('c1', 'Conta corrente'), conta('c2', 'Conta corrente')],
      entries: [
        lancamento({ id: 'e1', accountId: 'c1', categoryId: null }),
        lancamento({ id: 'e2', accountId: 'c1', categoryId: null }),
        lancamento({ id: 'e3', accountId: 'c1', categoryId: null }),
      ],
      recurring: [regra],
      purchases: [compra],
    });
    const { data: depois, resumo } = juntarDuplicados(data, AGORA);
    expect(depois.recurring[0]!.accountId).toBe('c1');
    expect(depois.purchases[0]!.accountId).toBe('c1');
    expect(resumo.registrosRemapeados).toBe(2);
  });

  it('deixa um tombstone para cada cadastro removido, senão a nuvem os traria de volta', () => {
    const data = base({
      accounts: [conta('c1', 'Conta corrente'), conta('c2', 'Conta corrente')],
      categories: [categoria('k1', 'Moradia'), categoria('k2', 'Moradia')],
    });
    const { data: depois } = juntarDuplicados(data, AGORA);
    expect(depois.tombstones).toEqual([
      { table: 'accounts', id: 'c2', deletedAt: AGORA },
      { table: 'categories', id: 'k2', deletedAt: AGORA },
    ]);
  });

  it('prefere quem já está em uso, mesmo sendo mais novo', () => {
    const data = base({
      accounts: [
        conta('velha', 'Conta corrente', '2026-01-01T00:00:00.000Z'),
        conta('nova', 'Conta corrente', '2026-05-01T00:00:00.000Z'),
      ],
      entries: [lancamento({ id: 'e1', accountId: 'nova', categoryId: null })],
    });
    const { data: depois } = juntarDuplicados(data, AGORA);
    expect(depois.accounts.map((a) => a.id)).toEqual(['nova']);
    // Nada a remapear: o lançamento já apontava para quem ficou.
    expect(depois.entries[0]!.updatedAt).toBe('2026-09-01T00:00:00.000Z');
  });

  it('não deixa uma conta arquivada sobreviver no lugar de uma ativa', () => {
    const data = base({
      accounts: [
        conta('arquivada', 'Carteira', '2026-01-01T00:00:00.000Z', { archived: true }),
        conta('ativa', 'Carteira', '2026-05-01T00:00:00.000Z'),
      ],
    });
    const { data: depois } = juntarDuplicados(data, AGORA);
    expect(depois.accounts.map((a) => a.id)).toEqual(['ativa']);
  });

  it('aplicar de novo não muda mais nada', () => {
    const data = base({
      accounts: [conta('c1', 'Conta corrente'), conta('c2', 'Conta corrente')],
      categories: [categoria('k1', 'Moradia'), categoria('k2', 'moradia')],
      entries: [lancamento({ id: 'e1', accountId: 'c2', categoryId: 'k2' })],
    });
    const primeira = juntarDuplicados(data, AGORA);
    const segunda = juntarDuplicados(primeira.data, '2026-10-01T00:00:00.000Z');
    expect(segunda.data).toBe(primeira.data);
    expect(segunda.resumo.registrosRemapeados).toBe(0);
  });
});
