import { describe, expect, it } from 'vitest';
import { SCHEMA_VERSION, emptyData, looksLikeFinanceData, migrate } from './schema.ts';

/** Como os dados de quem já usava o app estavam gravados antes da sincronização. */
const SALVO_NA_VERSAO_1 = {
  version: 1,
  accounts: [{ id: 'a1', name: 'Conta corrente', kind: 'checking', openingBalance: 50000, color: 'blue' }],
  categories: [{ id: 'c1', name: 'Moradia', kind: 'expense', color: 'blue', emoji: '🏠' }],
  entries: [
    {
      id: 'e1', date: '2026-08-10', description: 'Aluguel', amount: 180000,
      kind: 'expense', accountId: 'a1', categoryId: 'c1', status: 'settled',
      createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z',
    },
  ],
  recurring: [{ id: 'r1', description: 'Aluguel', amount: 180000, skippedDates: ['2026-07-10'] }],
  purchases: [{ id: 'p1', description: 'Notebook', totalAmount: 450000, installments: 10 }],
};

describe('migrate a partir da versão 1', () => {
  const migrado = migrate(SALVO_NA_VERSAO_1);

  it('não perde nada do que já estava salvo', () => {
    expect(migrado.entries).toHaveLength(1);
    expect(migrado.entries[0]).toMatchObject({ id: 'e1', amount: 180000 });
    expect(migrado.accounts[0]).toMatchObject({ id: 'a1', openingBalance: 50000 });
    expect(migrado.recurring[0]!.skippedDates).toEqual(['2026-07-10']);
    expect(migrado.purchases).toHaveLength(1);
  });

  it('cria a lista de exclusões que a versão 1 não tinha', () => {
    expect(migrado.tombstones).toEqual([]);
    expect(migrado.version).toBe(SCHEMA_VERSION);
  });

  it('datar contas e categorias antigas com a data mais antiga possível', () => {
    // Assim, na primeira sincronização, qualquer versão vinda de outro
    // aparelho é considerada mais nova — um dado velho nunca sobrescreve
    // algo que já foi editado por lá.
    expect(migrado.accounts[0]!.updatedAt).toBe('1970-01-01T00:00:00.000Z');
    expect(migrado.categories[0]!.updatedAt).toBe('1970-01-01T00:00:00.000Z');
  });

  it('preserva o carimbo de quem já tinha', () => {
    const comData = migrate({
      ...SALVO_NA_VERSAO_1,
      accounts: [{ ...SALVO_NA_VERSAO_1.accounts[0], updatedAt: '2026-09-01T00:00:00.000Z' }],
    });
    expect(comData.accounts[0]!.updatedAt).toBe('2026-09-01T00:00:00.000Z');
  });
});

describe('migrate com entrada estranha', () => {
  it('devolve o estado vazio para lixo', () => {
    for (const lixo of [null, undefined, 42, 'texto', []]) {
      expect(migrate(lixo).accounts).toEqual([]);
    }
  });

  it('tolera coleções faltando ou com tipo errado', () => {
    const resultado = migrate({ accounts: 'não é lista', entries: [{ id: 'x' }] });
    expect(resultado.accounts).toEqual([]);
    expect(resultado.entries).toHaveLength(1);
    expect(resultado.tombstones).toEqual([]);
  });

  it('tolera uma regra recorrente sem a lista de dispensas', () => {
    expect(migrate({ recurring: [{ id: 'r1' }] }).recurring[0]!.skippedDates).toEqual([]);
  });
});

describe('looksLikeFinanceData', () => {
  it('aceita um backup de verdade', () => {
    expect(looksLikeFinanceData(SALVO_NA_VERSAO_1)).toBe(true);
    expect(looksLikeFinanceData(emptyData())).toBe(true);
  });

  it('recusa qualquer outro arquivo', () => {
    for (const outro of [null, {}, { accounts: [] }, [1, 2, 3], 'texto']) {
      expect(looksLikeFinanceData(outro)).toBe(false);
    }
  });
});
