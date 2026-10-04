import { describe, expect, it } from 'vitest';

import {
  desmarcarTodosComoPagos, lerLoteDePagamento, quantosEstaoPagos, rotuloDoLote,
} from './pagamentos.ts';
import type { DisplayEntry, Entry, FinanceData } from './types.ts';

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

/*
 * O pedido: "preciso de uma forma de selecionar vários para marcar como pago,
 * da mesma forma que consigo selecionar vários lançamentos pra excluí-los".
 */
describe('confirmar o que está selecionado', () => {
  const linha = (id: string, over: Partial<DisplayEntry> = {}): DisplayEntry =>
    ({
      id, date: '2026-10-01', description: id, amount: 1000, kind: 'expense',
      accountId: 'cc', toAccountId: null, categoryId: null, status: 'pending',
      recurringId: null, occurrenceDate: null, purchaseId: null,
      installmentNumber: null, installmentTotal: null,
      createdAt: '2026-10-01', updatedAt: '2026-10-01', ...over,
    }) as DisplayEntry;

  it('com algo em aberto, o botão confirma — e só o que está em aberto', () => {
    const lote = lerLoteDePagamento([
      linha('a'),
      linha('b', { status: 'settled' }),
      linha('c'),
    ]);
    expect(lote.acao).toBe('confirmar');
    expect(lote.aConfirmar.map((e) => e.id)).toEqual(['a', 'c']);
    expect(rotuloDoLote(lote)).toBe('✓ Confirmar 2');
  });

  it('com tudo já confirmado, ele desmarca em vez de não fazer nada', () => {
    const lote = lerLoteDePagamento([
      linha('a', { status: 'settled' }),
      linha('b', { status: 'settled' }),
    ]);
    expect(lote.acao).toBe('desmarcar');
    expect(rotuloDoLote(lote)).toBe('↩ Desmarcar 2');
  });

  it('sem nada selecionado, não há ação', () => {
    const lote = lerLoteDePagamento([]);
    expect(lote.acao).toBe('nada');
    expect(lote.aConfirmar).toEqual([]);
  });

  it('conta quantas previsões virarão lançamentos gravados', () => {
    // Confirmar uma ocorrência prevista é o que a grava. Marcar trinta de uma
    // vez cria trinta registros, e isso precisa estar dito antes.
    const lote = lerLoteDePagamento([
      linha('a'),
      linha('prevista', { projected: true } as Partial<DisplayEntry>),
      linha('outra-prevista', { projected: true } as Partial<DisplayEntry>),
    ]);
    expect(lote.previstos).toBe(2);
    expect(lote.aConfirmar).toHaveLength(3);
  });

  it('transferência selecionada à mão entra na conta', () => {
    // Ao contrário do "desmarcar todos" de Ajustes, que a ignora de propósito:
    // aqui a pessoa escolheu a linha, e tirá-la calada seria pior.
    const lote = lerLoteDePagamento([linha('t', { kind: 'transfer' })]);
    expect(lote.aConfirmar.map((e) => e.id)).toEqual(['t']);
  });
});
