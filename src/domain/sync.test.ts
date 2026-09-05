import { describe, expect, it } from 'vitest';
import { highWaterMark, mergeCollection, mergeData, mergeTombstones, pruneTombstones } from './sync.ts';
import type { Account, Entry, FinanceData, Tombstone } from './types.ts';

const T = (iso: string) => `2026-09-${iso}T12:00:00.000Z`;
const NOW = T('20');

function entry(id: string, updatedAt: string, over: Partial<Entry> = {}): Entry {
  return {
    id, date: '2026-09-10', description: `Lançamento ${id}`, amount: 1000,
    kind: 'expense', accountId: 'a1', toAccountId: null, categoryId: null,
    status: 'settled', recurringId: null, occurrenceDate: null,
    purchaseId: null, installmentNumber: null, installmentTotal: null,
    createdAt: T('01'), updatedAt, ...over,
  };
}

function account(id: string, updatedAt: string, over: Partial<Account> = {}): Account {
  return { id, name: `Conta ${id}`, kind: 'checking', openingBalance: 0, color: 'blue', updatedAt, ...over };
}

function data(over: Partial<FinanceData> = {}): FinanceData {
  return {
    version: 2, accounts: [], categories: [], entries: [],
    recurring: [], purchases: [], tombstones: [], ...over,
  };
}

describe('mergeCollection', () => {
  const semMortos = new Map<string, string>();

  it('mantém o que existe só de um lado', () => {
    const result = mergeCollection([entry('a', T('01'))], [entry('b', T('02'))], semMortos);
    expect(result.map((e) => e.id)).toEqual(['a', 'b']);
  });

  it('quando o registro existe nos dois, a versão mais nova vence', () => {
    const antigo = entry('a', T('01'), { amount: 100 });
    const novo = entry('a', T('05'), { amount: 999 });
    expect(mergeCollection([antigo], [novo], semMortos)[0]!.amount).toBe(999);
    // e o resultado não depende de quem é chamado de "local"
    expect(mergeCollection([novo], [antigo], semMortos)[0]!.amount).toBe(999);
  });

  it('remove o que foi apagado, mesmo que o outro lado ainda tenha', () => {
    const mortos = new Map([['a', T('05')]]);
    expect(mergeCollection([entry('a', T('01'))], [], mortos)).toEqual([]);
  });

  it('ressuscita o registro editado depois de apagado', () => {
    // Quem mexeu por último decidiu depois: é mais fácil apagar de novo do
    // que redigitar um lançamento que sumiu sozinho.
    const mortos = new Map([['a', T('05')]]);
    const result = mergeCollection([entry('a', T('09'), { amount: 777 })], [], mortos);
    expect(result).toHaveLength(1);
    expect(result[0]!.amount).toBe(777);
  });

  it('não ressuscita quando a edição é anterior à exclusão', () => {
    const mortos = new Map([['a', T('05')]]);
    expect(mergeCollection([entry('a', T('04'))], [], mortos)).toEqual([]);
  });
});

describe('mergeTombstones', () => {
  const t = (id: string, deletedAt: string): Tombstone => ({ table: 'entries', id, deletedAt });

  it('junta os dois lados sem duplicar', () => {
    const result = mergeTombstones([t('a', T('01'))], [t('a', T('01')), t('b', T('02'))]);
    expect(result.map((x) => x.id)).toEqual(['a', 'b']);
  });

  it('guarda o instante mais antigo, que é quando o registro morreu', () => {
    const result = mergeTombstones([t('a', T('08'))], [t('a', T('03'))]);
    expect(result[0]!.deletedAt).toBe(T('03'));
  });

  it('distingue o mesmo id em coleções diferentes', () => {
    const result = mergeTombstones(
      [{ table: 'entries', id: 'x', deletedAt: T('01') }],
      [{ table: 'accounts', id: 'x', deletedAt: T('01') }],
    );
    expect(result).toHaveLength(2);
  });
});

describe('pruneTombstones', () => {
  it('descarta as marcas velhas e mantém as recentes', () => {
    const velho: Tombstone = { table: 'entries', id: 'velho', deletedAt: '2020-01-01T00:00:00.000Z' };
    const novo: Tombstone = { table: 'entries', id: 'novo', deletedAt: T('19') };
    expect(pruneTombstones([velho, novo], NOW).map((t) => t.id)).toEqual(['novo']);
  });

  it('respeita o prazo informado', () => {
    const t: Tombstone = { table: 'entries', id: 'x', deletedAt: T('10') };
    expect(pruneTombstones([t], NOW, 5)).toEqual([]);
    expect(pruneTombstones([t], NOW, 30)).toEqual([t]);
  });
});

describe('mergeData', () => {
  it('une lançamentos criados em aparelhos diferentes', () => {
    const celular = data({ entries: [entry('a', T('01'))] });
    const notebook = data({ entries: [entry('b', T('02'))] });
    expect(mergeData(celular, notebook, NOW).entries.map((e) => e.id)).toEqual(['a', 'b']);
  });

  it('propaga a exclusão feita no outro aparelho', () => {
    const celular = data({ tombstones: [{ table: 'entries', id: 'a', deletedAt: T('05') }] });
    const notebook = data({ entries: [entry('a', T('01'))] });
    const merged = mergeData(celular, notebook, NOW);
    expect(merged.entries).toEqual([]);
    expect(merged.tombstones).toHaveLength(1);
  });

  it('é idempotente: sincronizar de novo não muda nada', () => {
    const a = data({ entries: [entry('x', T('03'))], accounts: [account('a1', T('02'))] });
    const b = data({ entries: [entry('y', T('04'))], tombstones: [{ table: 'entries', id: 'z', deletedAt: T('05') }] });
    const uma = mergeData(a, b, NOW);
    const duas = mergeData(uma, b, NOW);
    expect(duas).toEqual(uma);
  });

  it('é comutativo: tanto faz qual lado é o local', () => {
    const a = data({ entries: [entry('x', T('03'), { amount: 111 })], accounts: [account('a1', T('06'))] });
    const b = data({ entries: [entry('x', T('07'), { amount: 222 })], accounts: [account('a1', T('02'))] });
    expect(mergeData(a, b, NOW)).toEqual(mergeData(b, a, NOW));
  });

  it('resolve por registro, não pelo conjunto inteiro', () => {
    // O celular editou um lançamento; o notebook editou outro. Ninguém perde.
    const celular = data({ entries: [entry('x', T('09'), { amount: 111 }), entry('y', T('01'))] });
    const notebook = data({ entries: [entry('x', T('01')), entry('y', T('09'), { amount: 222 })] });
    const merged = mergeData(celular, notebook, NOW);
    expect(merged.entries.find((e) => e.id === 'x')!.amount).toBe(111);
    expect(merged.entries.find((e) => e.id === 'y')!.amount).toBe(222);
  });

  it('funde todas as coleções, não só os lançamentos', () => {
    const a = data({ accounts: [account('a1', T('01'))] });
    const b = data({
      categories: [{ id: 'c1', name: 'Casa', kind: 'expense', color: 'blue', emoji: '🏠', updatedAt: T('02') }],
    });
    const merged = mergeData(a, b, NOW);
    expect(merged.accounts).toHaveLength(1);
    expect(merged.categories).toHaveLength(1);
  });

  it('poda as marcas antigas ao fundir', () => {
    const a = data({ tombstones: [{ table: 'entries', id: 'antigo', deletedAt: '2020-01-01T00:00:00.000Z' }] });
    expect(mergeData(a, data(), NOW).tombstones).toEqual([]);
  });
});

describe('highWaterMark', () => {
  it('devolve a alteração mais recente entre todas as coleções', () => {
    const d = data({
      entries: [entry('a', T('03'))],
      accounts: [account('a1', T('08'))],
      tombstones: [{ table: 'entries', id: 'z', deletedAt: T('05') }],
    });
    expect(highWaterMark(d)).toBe(T('08'));
  });

  it('considera também a exclusão mais recente', () => {
    const d = data({
      entries: [entry('a', T('03'))],
      tombstones: [{ table: 'entries', id: 'z', deletedAt: T('11') }],
    });
    expect(highWaterMark(d)).toBe(T('11'));
  });

  it('devolve vazio quando não há nada', () => {
    expect(highWaterMark(data())).toBe('');
  });
});
