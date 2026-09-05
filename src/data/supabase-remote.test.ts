/**
 * A conversão entre as linhas do banco e o formato do app.
 *
 * É a parte da integração com o Supabase que tem lógica, e a única que dá
 * para testar sem rede — o resto são chamadas finas ao cliente.
 */

import { describe, expect, it } from 'vitest';
import type { Entry, FinanceData } from '../domain/types.ts';
import { emptyData } from './schema.ts';
import { changesToRows, nextCursor, rowsToChanges, type RecordRow } from './supabase-remote.ts';
import { normalizeUrl } from './supabase.ts';

const CARTEIRA = 'w1';
const T = '2026-09-05T12:00:00.000Z';

function entry(id: string, over: Partial<Entry> = {}): Entry {
  return {
    id, date: '2026-09-10', description: `Lançamento ${id}`, amount: 1000,
    kind: 'expense', accountId: 'a1', toAccountId: null, categoryId: null,
    status: 'settled', recurringId: null, occurrenceDate: null,
    purchaseId: null, installmentNumber: null, installmentTotal: null,
    createdAt: T, updatedAt: T, ...over,
  };
}

function row(over: Partial<RecordRow> = {}): RecordRow {
  return {
    wallet_id: CARTEIRA, table_name: 'entries', record_id: 'e1',
    payload: entry('e1'), updated_at: T, deleted_at: null, seq: 1, ...over,
  };
}

describe('rowsToChanges', () => {
  it('remonta os registros na coleção certa', () => {
    const changes = rowsToChanges([
      row({ record_id: 'e1', payload: entry('e1') }),
      row({ table_name: 'accounts', record_id: 'a1', seq: 2,
            payload: { id: 'a1', name: 'Conta', kind: 'checking', openingBalance: 0, color: 'blue', updatedAt: T } }),
    ]);
    expect(changes.entries.map((e) => e.id)).toEqual(['e1']);
    expect(changes.accounts.map((a) => a.id)).toEqual(['a1']);
  });

  it('transforma linha apagada em marca de exclusão, não em registro', () => {
    const changes = rowsToChanges([row({ payload: null, deleted_at: T })]);
    expect(changes.entries).toEqual([]);
    expect(changes.tombstones).toEqual([{ table: 'entries', id: 'e1', deletedAt: T }]);
  });

  it('ignora tabela desconhecida em vez de quebrar', () => {
    // Viria de uma versão mais nova do app gravando algo que esta não conhece.
    const changes = rowsToChanges([row({ table_name: 'planetas' as never })]);
    expect(changes.entries).toEqual([]);
    expect(changes.tombstones).toEqual([]);
  });

  it('ignora linha sem conteúdo e sem marca de exclusão', () => {
    expect(rowsToChanges([row({ payload: null, deleted_at: null })]).entries).toEqual([]);
  });

  it('devolve o estado vazio para nenhuma linha', () => {
    expect(rowsToChanges([])).toEqual(emptyData());
  });
});

describe('changesToRows', () => {
  it('gera uma linha por registro, com a carteira e a data', () => {
    const changes: FinanceData = { ...emptyData(), entries: [entry('e1'), entry('e2')] };
    const rows = changesToRows(changes, CARTEIRA);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      wallet_id: CARTEIRA, table_name: 'entries', record_id: 'e1', updated_at: T, deleted_at: null,
    });
  });

  it('a exclusão leva o conteúdo embora', () => {
    // Não há motivo para o servidor guardar um lançamento que mandaram apagar.
    const changes: FinanceData = {
      ...emptyData(),
      tombstones: [{ table: 'entries', id: 'e9', deletedAt: T }],
    };
    const [linha] = changesToRows(changes, CARTEIRA);
    expect(linha).toMatchObject({ record_id: 'e9', payload: null, deleted_at: T, updated_at: T });
  });

  it('cobre todas as coleções, não só os lançamentos', () => {
    const changes: FinanceData = {
      ...emptyData(),
      entries: [entry('e1')],
      accounts: [{ id: 'a1', name: 'C', kind: 'checking', openingBalance: 0, color: 'blue', updatedAt: T }],
      categories: [{ id: 'c1', name: 'X', kind: 'expense', color: 'blue', emoji: '🏠', updatedAt: T }],
    };
    const tabelas = changesToRows(changes, CARTEIRA).map((r) => r.table_name).sort();
    expect(tabelas).toEqual(['accounts', 'categories', 'entries']);
  });

  it('ida e volta preserva o conteúdo', () => {
    const original: FinanceData = {
      ...emptyData(),
      entries: [entry('e1', { amount: 12345 })],
      tombstones: [{ table: 'entries', id: 'morto', deletedAt: T }],
    };
    const rows = changesToRows(original, CARTEIRA).map((r, i) => ({ ...r, seq: i + 1 }));
    const volta = rowsToChanges(rows);
    expect(volta.entries).toEqual(original.entries);
    expect(volta.tombstones).toEqual(original.tombstones);
  });
});

describe('nextCursor', () => {
  it('avança para a maior ordem de chegada recebida', () => {
    expect(nextCursor([row({ seq: 3 }), row({ seq: 7 }), row({ seq: 5 })], '2')).toBe('7');
  });

  it('não retrocede quando não veio nada', () => {
    expect(nextCursor([], '42')).toBe('42');
    expect(nextCursor([], null)).toBe('0');
  });
});

describe('normalizeUrl', () => {
  it('aceita a URL que o painel mostra, com o caminho da API', () => {
    // Colar essa é o engano mais fácil de cometer, e falharia sem explicar nada.
    expect(normalizeUrl('https://abc.supabase.co/rest/v1/')).toBe('https://abc.supabase.co');
    expect(normalizeUrl('https://abc.supabase.co/auth/v1')).toBe('https://abc.supabase.co');
  });

  it('aceita a URL base, com ou sem barra', () => {
    expect(normalizeUrl('https://abc.supabase.co')).toBe('https://abc.supabase.co');
    expect(normalizeUrl('  https://abc.supabase.co/  ')).toBe('https://abc.supabase.co');
  });
});
