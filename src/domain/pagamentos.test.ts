import { describe, expect, it } from 'vitest';

import { desmarcarTodosComoPagos, quantosEstaoPagos } from './pagamentos.ts';
import type { Entry, FinanceData } from './types.ts';

const ANTES = '2026-01-01T00:00:00.000Z';
const AGORA = '2026-09-10T12:00:00.000Z';

function lancamento(over: Partial<Entry> = {}): Entry {
  return {
    id: 'e1', date: '2026-09-10', description: 'x', amount: 1000, kind: 'expense',
    accountId: 'a1', toAccountId: null, categoryId: null, status: 'settled',
    recurringId: null, occurrenceDate: null, purchaseId: null,
    installmentNumber: null, installmentTotal: null, createdAt: ANTES, updatedAt: ANTES,
    ...over,
  };
}

function carteira(entries: Entry[]): FinanceData {
  return { version: 2, accounts: [], categories: [], entries, recurring: [], purchases: [], tombstones: [] };
}

describe('desmarcarTodosComoPagos', () => {
  it('devolve tudo para "a pagar"', () => {
    const data = carteira([lancamento({ id: 'a' }), lancamento({ id: 'b' })]);
    const { data: novo, alterados } = desmarcarTodosComoPagos(data, AGORA);
    expect(alterados).toBe(2);
    expect(novo.entries.every((e) => e.status === 'pending')).toBe(true);
  });

  it('não conta o que já estava a pagar', () => {
    const data = carteira([lancamento({ id: 'a', status: 'pending' }), lancamento({ id: 'b' })]);
    expect(desmarcarTodosComoPagos(data, AGORA).alterados).toBe(1);
  });

  /*
   * Transferência entre contas próprias não é conta que se paga. Deixá-la
   * pendente encheria a lista de atrasados com o que ninguém vai marcar.
   */
  it('não mexe em transferência', () => {
    const data = carteira([lancamento({ id: 't', kind: 'transfer', toAccountId: 'a2' })]);
    const { data: novo, alterados } = desmarcarTodosComoPagos(data, AGORA);
    expect(alterados).toBe(0);
    expect(novo.entries[0]!.status).toBe('settled');
  });

  it('carimba updatedAt no que mudou — senão a sincronização ignora', () => {
    const data = carteira([lancamento()]);
    expect(desmarcarTodosComoPagos(data, AGORA).data.entries[0]!.updatedAt).toBe(AGORA);
  });

  it('não carimba o que não mudou', () => {
    const data = carteira([lancamento({ status: 'pending' })]);
    expect(desmarcarTodosComoPagos(data, AGORA).data.entries[0]!.updatedAt).toBe(ANTES);
  });

  it('sem nada a fazer, devolve a mesma carteira', () => {
    const data = carteira([lancamento({ status: 'pending' })]);
    expect(desmarcarTodosComoPagos(data, AGORA).data).toBe(data);
  });

  it('aplicar de novo não muda mais nada', () => {
    const data = carteira([lancamento({ id: 'a' }), lancamento({ id: 'b' })]);
    const primeira = desmarcarTodosComoPagos(data, AGORA);
    const segunda = desmarcarTodosComoPagos(primeira.data, AGORA);
    expect(segunda.alterados).toBe(0);
    expect(segunda.data).toBe(primeira.data);
  });

  it('carteira vazia não quebra', () => {
    expect(desmarcarTodosComoPagos(carteira([]), AGORA)).toEqual({ data: carteira([]), alterados: 0 });
  });
});

describe('quantosEstaoPagos', () => {
  it('conta só os marcados, e não as transferências', () => {
    const data = carteira([
      lancamento({ id: 'a' }),
      lancamento({ id: 'b', status: 'pending' }),
      lancamento({ id: 't', kind: 'transfer', toAccountId: 'a2' }),
    ]);
    expect(quantosEstaoPagos(data)).toBe(1);
  });
});
