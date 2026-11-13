import { describe, expect, it } from 'vitest';

import { dividirRecorrente, type ValoresDaRegra } from './divisao-recorrente.ts';
import { occurrenceDates, projectAll } from './recurrence.ts';
import type { Entry, RecurringRule } from './types.ts';

const T = '2026-01-01T00:00:00.000Z';

function regra(over: Partial<RecurringRule> = {}): RecurringRule {
  return {
    id: 'r1', description: 'Streaming', amount: 2990, kind: 'expense',
    accountId: 'cc', toAccountId: null, categoryId: 'lazer',
    frequency: 'monthly', interval: 1, startDate: '2026-01-10',
    endDate: null, maxOccurrences: null, active: true, skippedDates: [],
    createdAt: T, updatedAt: T, ...over,
  };
}

let n = 0;
function entry(over: Partial<Entry> = {}): Entry {
  n += 1;
  return {
    id: `e${n}`, date: '2026-01-10', description: 'Streaming', amount: 2990,
    kind: 'expense', accountId: 'cc', toAccountId: null, categoryId: 'lazer',
    status: 'settled', recurringId: 'r1', occurrenceDate: '2026-01-10',
    purchaseId: null, installmentNumber: null, installmentTotal: null,
    createdAt: T, updatedAt: T, ...over,
  };
}

const NOVOS: ValoresDaRegra = {
  description: 'Streaming', amount: 3990, kind: 'expense',
  accountId: 'cc', toAccountId: null, categoryId: 'lazer',
};

describe('dividirRecorrente', () => {
  it('fecha a regra antiga na véspera do corte', () => {
    const divisao = dividirRecorrente(regra(), '2026-06-10', '2026-06-10', NOVOS, []);
    expect(divisao.patchDaAnterior).toEqual({ endDate: '2026-06-09' });
  });

  it('a regra nova começa no corte, com os valores novos', () => {
    const divisao = dividirRecorrente(regra(), '2026-06-10', '2026-06-10', NOVOS, []);
    expect(divisao.nova).toMatchObject({
      amount: 3990, startDate: '2026-06-10', frequency: 'monthly', interval: 1, active: true,
    });
  });

  it('o passado continua valendo o preço antigo', () => {
    const antiga = regra();
    const divisao = dividirRecorrente(antiga, '2026-06-10', '2026-06-10', NOVOS, []);
    const fechada = { ...antiga, ...divisao.patchDaAnterior };

    // Janeiro a maio continuam na regra antiga; junho em diante, não.
    expect(occurrenceDates(fechada, '2026-01-01', '2026-12-31')).toEqual([
      '2026-01-10', '2026-02-10', '2026-03-10', '2026-04-10', '2026-05-10',
    ]);
  });

  it('as duas regras juntas cobrem a série inteira, sem buraco e sem sobra', () => {
    const antiga = regra();
    const divisao = dividirRecorrente(antiga, '2026-06-10', '2026-06-10', NOVOS, []);
    const fechada = { ...antiga, ...divisao.patchDaAnterior };
    const nova: RecurringRule = { ...divisao.nova!, id: 'r2', createdAt: T, updatedAt: T };

    const datas = [
      ...occurrenceDates(fechada, '2026-01-01', '2026-12-31'),
      ...occurrenceDates(nova, '2026-01-01', '2026-12-31'),
    ].sort();
    expect(datas).toEqual(occurrenceDates(antiga, '2026-01-01', '2026-12-31'));
    expect(new Set(datas).size).toBe(datas.length);
  });

  it('nenhum mês aparece duas vezes na projeção depois do corte', () => {
    const antiga = regra();
    const divisao = dividirRecorrente(antiga, '2026-06-10', '2026-06-10', NOVOS, []);
    const fechada = { ...antiga, ...divisao.patchDaAnterior };
    const nova: RecurringRule = { ...divisao.nova!, id: 'r2', createdAt: T, updatedAt: T };

    const projetadas = projectAll([fechada, nova], [], '2026-01-01', '2026-12-31');
    const porData = projetadas.map((p) => p.date);
    expect(new Set(porData).size).toBe(porData.length);
    expect(projetadas.find((p) => p.date === '2026-05-10')!.amount).toBe(2990);
    expect(projetadas.find((p) => p.date === '2026-06-10')!.amount).toBe(3990);
  });

  it('mudar o dia move a série daqui em diante', () => {
    const antiga = regra();
    const divisao = dividirRecorrente(antiga, '2026-06-10', '2026-06-20', NOVOS, []);
    const nova: RecurringRule = { ...divisao.nova!, id: 'r2', createdAt: T, updatedAt: T };
    expect(occurrenceDates(nova, '2026-06-01', '2026-08-31')).toEqual([
      '2026-06-20', '2026-07-20', '2026-08-20',
    ]);
    // E o corte continua na data original, senão junho apareceria duas vezes.
    expect(divisao.patchDaAnterior.endDate).toBe('2026-06-09');
  });

  it('cortar na primeira ocorrência muda a regra inteira, sem criar outra', () => {
    const divisao = dividirRecorrente(regra(), '2026-01-10', '2026-01-10', NOVOS, []);
    expect(divisao.nova).toBeNull();
    expect(divisao.patchDaAnterior).toMatchObject({ amount: 3990, startDate: '2026-01-10' });
    expect(divisao.patchDaAnterior.endDate).toBeUndefined();
  });

  it('desconta do teto de ocorrências o que ficou para trás', () => {
    const divisao = dividirRecorrente(
      regra({ maxOccurrences: 12 }), '2026-06-10', '2026-06-10', NOVOS, [],
    );
    // Janeiro a maio são cinco; sobram sete.
    expect(divisao.nova!.maxOccurrences).toBe(7);
  });

  it('as dispensas do passado ficam com a regra do passado', () => {
    const divisao = dividirRecorrente(
      regra({ skippedDates: ['2026-03-10', '2026-09-10'] }), '2026-06-10', '2026-06-10', NOVOS, [],
    );
    expect(divisao.nova!.skippedDates).toEqual(['2026-09-10']);
  });

  it('a data de término original é herdada pela regra nova', () => {
    const divisao = dividirRecorrente(
      regra({ endDate: '2027-01-10' }), '2026-06-10', '2026-06-10', NOVOS, [],
    );
    expect(divisao.nova!.endDate).toBe('2027-01-10');
    expect(divisao.patchDaAnterior.endDate).toBe('2026-06-09');
  });

  it('não estica uma regra que já terminava antes do corte', () => {
    const divisao = dividirRecorrente(
      regra({ endDate: '2026-03-10' }), '2026-06-10', '2026-06-10', NOVOS, [],
    );
    expect(divisao.patchDaAnterior.endDate).toBe('2026-03-10');
  });
});

describe('o que o corte alcança', () => {
  it('leva as ocorrências já gravadas de hoje em diante', () => {
    const divisao = dividirRecorrente(regra(), '2026-06-10', '2026-06-10', NOVOS, [
      entry({ id: 'passado', occurrenceDate: '2026-03-10' }),
      entry({ id: 'futuro', occurrenceDate: '2026-07-10', status: 'pending' }),
    ]);
    expect(divisao.mover.map((m) => m.id)).toEqual(['futuro']);
  });

  it('o que já foi confirmado troca de regra mas não troca de valor', () => {
    const divisao = dividirRecorrente(regra(), '2026-06-10', '2026-06-10', NOVOS, [
      entry({ id: 'pago', occurrenceDate: '2026-07-10', status: 'settled' }),
      entry({ id: 'previsto', occurrenceDate: '2026-08-10', status: 'pending' }),
    ]);
    expect(divisao.mover).toEqual([
      { id: 'pago', atualizarValores: false },
      { id: 'previsto', atualizarValores: true },
    ]);
  });

  it('não encosta em lançamento de outra regra nem em avulso', () => {
    const divisao = dividirRecorrente(regra(), '2026-06-10', '2026-06-10', NOVOS, [
      entry({ id: 'outra', recurringId: 'r9', occurrenceDate: '2026-07-10' }),
      entry({ id: 'avulso', recurringId: null, occurrenceDate: null, date: '2026-07-10' }),
    ]);
    expect(divisao.mover).toEqual([]);
  });

  it('mesmo mudando a regra inteira, o que já está gravado acompanha', () => {
    const divisao = dividirRecorrente(regra(), '2026-01-10', '2026-01-10', NOVOS, [
      entry({ id: 'previsto', occurrenceDate: '2026-05-10', status: 'pending' }),
    ]);
    expect(divisao.nova).toBeNull();
    expect(divisao.mover.map((m) => m.id)).toEqual(['previsto']);
  });
});
