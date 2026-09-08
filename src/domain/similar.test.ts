import { describe, expect, it } from 'vitest';

import {
  DIAS_DE_FOLGA,
  procurarComprasSemelhantes,
  procurarRegrasSemelhantes,
  procurarSemelhantes,
  textoComparavel,
} from './similar.ts';
import type { Entry, InstallmentPurchase, RecurringRule } from './types.ts';

const STAMP = '2026-09-01T00:00:00.000Z';

function entry(over: Partial<Entry> = {}): Entry {
  return {
    id: 'e1', date: '2026-09-10', description: 'Mercado', amount: 9200,
    kind: 'expense', accountId: 'a1', toAccountId: null, categoryId: null,
    status: 'settled', recurringId: null, occurrenceDate: null, purchaseId: null,
    installmentNumber: null, installmentTotal: null,
    createdAt: STAMP, updatedAt: STAMP, ...over,
  };
}

const rascunho = { date: '2026-09-10', description: 'Mercado', amount: 9200, kind: 'expense' as const, accountId: 'a1' };

describe('textoComparavel', () => {
  it('ignora acento, caixa, pontuação e espaço sobrando', () => {
    expect(textoComparavel('  Padaria São João!! ')).toBe('padaria sao joao');
    expect(textoComparavel('MERCADO')).toBe(textoComparavel('mercado'));
  });
});

describe('procurarSemelhantes', () => {
  it('acha o lançamento idêntico e chama de igual', () => {
    const achados = procurarSemelhantes([entry()], rascunho);
    expect(achados).toHaveLength(1);
    expect(achados[0]!.motivo).toBe('igual');
  });

  it('acha o de poucos dias antes e chama de parecido', () => {
    const achados = procurarSemelhantes([entry({ date: '2026-09-08' })], rascunho);
    expect(achados[0]!.motivo).toBe('parecido');
  });

  it('não acha nada fora da folga de dias', () => {
    const longe = entry({ date: '2026-08-01' });
    expect(procurarSemelhantes([longe], rascunho)).toEqual([]);
  });

  it('a folga vale para os dois lados', () => {
    const antes = entry({ id: 'antes', date: '2026-09-03' });
    const depois = entry({ id: 'depois', date: '2026-09-17' });
    expect(procurarSemelhantes([antes, depois], rascunho, { diasDeFolga: DIAS_DE_FOLGA })).toHaveLength(2);
  });

  // Conservador de propósito: alarme falso ensina a ignorar o aviso.
  it('valor diferente não é repetido, nem por um centavo', () => {
    expect(procurarSemelhantes([entry({ amount: 9201 })], rascunho)).toEqual([]);
  });

  it('entrada não é repetição de saída do mesmo valor', () => {
    expect(procurarSemelhantes([entry({ kind: 'income' })], rascunho)).toEqual([]);
  });

  it('descrição de outra coisa não conta', () => {
    expect(procurarSemelhantes([entry({ description: 'Farmácia' })], rascunho)).toEqual([]);
  });

  it('uma descrição contida na outra conta, palavra por palavra', () => {
    expect(procurarSemelhantes([entry({ description: 'Mercado do mês' })], rascunho)).toHaveLength(1);
    expect(procurarSemelhantes([entry({ description: 'MERCADO' })], rascunho)).toHaveLength(1);
    expect(procurarSemelhantes([entry({ description: 'Pagamento do Mercado' })], rascunho)).toHaveLength(1);
  });

  // Pedaço de palavra não conta: "Mercado" dentro de "supermercadox", ou
  // "Uber" dentro de "Uberlândia", declarariam repetido o que não é.
  it('não casa palavra que é só um pedaço de outra', () => {
    expect(procurarSemelhantes([entry({ description: 'PAG*SUPERMERCADOX' })], rascunho)).toEqual([]);
    expect(procurarSemelhantes([entry({ description: 'Uberlândia' })], { ...rascunho, description: 'Uber' })).toEqual([]);
  });

  it('descrição vazia não casa com tudo', () => {
    expect(procurarSemelhantes([entry({ description: '   ' })], rascunho)).toEqual([]);
    expect(procurarSemelhantes([entry()], { ...rascunho, description: '' })).toEqual([]);
  });

  // Ao editar um lançamento, ele não pode aparecer como cópia de si próprio.
  it('não aponta o próprio lançamento que está sendo editado', () => {
    expect(procurarSemelhantes([entry()], rascunho, { ignorar: 'e1' })).toEqual([]);
  });

  it('põe o idêntico na frente do parecido', () => {
    const lista = [entry({ id: 'perto', date: '2026-09-09' }), entry({ id: 'exato' })];
    expect(procurarSemelhantes(lista, rascunho).map((s) => s.entry.id)).toEqual(['exato', 'perto']);
  });

  it('lançamento em outra conta também é avisado — errar de conta é comum', () => {
    expect(procurarSemelhantes([entry({ accountId: 'outra' })], rascunho)).toHaveLength(1);
  });
});

describe('procurarRegrasSemelhantes', () => {
  const regra = (over: Partial<RecurringRule> = {}): RecurringRule => ({
    id: 'r1', description: 'Internet', amount: 12900, kind: 'expense',
    accountId: 'a1', toAccountId: null, categoryId: null,
    frequency: 'monthly', interval: 1, startDate: '2026-01-08',
    endDate: null, maxOccurrences: null, skippedDates: [], active: true,
    createdAt: STAMP, updatedAt: STAMP, ...over,
  });
  const nova = { description: 'Internet', amount: 12900, kind: 'expense' as const, frequency: 'monthly' as const, interval: 1 };

  it('acha a regra que já cobra a mesma coisa, comece quando começar', () => {
    expect(procurarRegrasSemelhantes([regra({ startDate: '2020-05-01' })], nova)).toHaveLength(1);
  });

  it('frequência ou intervalo diferente é outra conta', () => {
    expect(procurarRegrasSemelhantes([regra({ frequency: 'yearly' })], nova)).toEqual([]);
    expect(procurarRegrasSemelhantes([regra({ interval: 3 })], nova)).toEqual([]);
  });

  it('não aponta a própria regra em edição', () => {
    expect(procurarRegrasSemelhantes([regra()], nova, { ignorar: 'r1' })).toEqual([]);
  });
});

describe('procurarComprasSemelhantes', () => {
  const compra = (over: Partial<InstallmentPurchase> = {}): InstallmentPurchase => ({
    id: 'p1', description: 'Notebook', totalAmount: 720000, installments: 12,
    firstDate: '2026-05-08', accountId: 'a1', categoryId: null,
    createdAt: STAMP, updatedAt: STAMP, ...over,
  });
  const nova = { description: 'Notebook', totalAmount: 720000, installments: 12, firstDate: '2026-05-10' };

  it('acha a compra igual lançada dias depois', () => {
    expect(procurarComprasSemelhantes([compra()], nova)).toHaveLength(1);
  });

  it('número de parcelas diferente é outra compra', () => {
    expect(procurarComprasSemelhantes([compra({ installments: 10 })], nova)).toEqual([]);
  });

  it('meses depois já não é a mesma compra', () => {
    expect(procurarComprasSemelhantes([compra({ firstDate: '2026-01-08' })], nova)).toEqual([]);
  });
});
