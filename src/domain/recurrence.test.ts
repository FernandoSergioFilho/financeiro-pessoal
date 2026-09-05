import { describe, expect, it } from 'vitest';
import { describeFrequency, materializedIndex, occurrenceDates, projectAll, projectRule } from './recurrence.ts';
import type { RecurringRule } from './types.ts';

function rule(overrides: Partial<RecurringRule> = {}): RecurringRule {
  return {
    id: 'r1',
    description: 'Aluguel',
    amount: 180000,
    kind: 'expense',
    accountId: 'a1',
    toAccountId: null,
    categoryId: 'c1',
    frequency: 'monthly',
    interval: 1,
    startDate: '2026-01-10',
    endDate: null,
    maxOccurrences: null,
    active: true,
    skippedDates: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('occurrenceDates — mensal', () => {
  it('gera uma ocorrência por mês dentro da janela', () => {
    expect(occurrenceDates(rule(), '2026-01-01', '2026-04-30')).toEqual([
      '2026-01-10', '2026-02-10', '2026-03-10', '2026-04-10',
    ]);
  });

  it('respeita a janela pedida sem depender de quando a regra começou', () => {
    expect(occurrenceDates(rule(), '2027-03-01', '2027-05-31')).toEqual([
      '2027-03-10', '2027-04-10', '2027-05-10',
    ]);
  });

  it('não gera nada antes da data de início', () => {
    expect(occurrenceDates(rule(), '2025-01-01', '2025-12-31')).toEqual([]);
  });

  it('encolhe o dia 31 nos meses curtos e o recupera depois', () => {
    const r = rule({ startDate: '2026-01-31' });
    expect(occurrenceDates(r, '2026-01-01', '2026-05-31')).toEqual([
      '2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31',
    ]);
  });

  it('respeita o intervalo de N meses', () => {
    const r = rule({ interval: 3 });
    expect(occurrenceDates(r, '2026-01-01', '2026-12-31')).toEqual([
      '2026-01-10', '2026-04-10', '2026-07-10', '2026-10-10',
    ]);
  });
});

describe('occurrenceDates — semanal e anual', () => {
  it('gera a cada sete dias', () => {
    const r = rule({ frequency: 'weekly', startDate: '2026-02-25' });
    expect(occurrenceDates(r, '2026-02-01', '2026-03-25')).toEqual([
      '2026-02-25', '2026-03-04', '2026-03-11', '2026-03-18', '2026-03-25',
    ]);
  });

  it('gera quinzenalmente com intervalo 2', () => {
    const r = rule({ frequency: 'weekly', interval: 2, startDate: '2026-01-05' });
    expect(occurrenceDates(r, '2026-01-01', '2026-02-15')).toEqual([
      '2026-01-05', '2026-01-19', '2026-02-02',
    ]);
  });

  it('gera uma vez por ano', () => {
    const r = rule({ frequency: 'yearly', startDate: '2026-07-04' });
    expect(occurrenceDates(r, '2026-01-01', '2029-12-31')).toEqual([
      '2026-07-04', '2027-07-04', '2028-07-04', '2029-07-04',
    ]);
  });
});

describe('occurrenceDates — término e exceções', () => {
  it('para na data final', () => {
    const r = rule({ endDate: '2026-03-15' });
    expect(occurrenceDates(r, '2026-01-01', '2026-12-31')).toEqual([
      '2026-01-10', '2026-02-10', '2026-03-10',
    ]);
  });

  it('para depois do número máximo de ocorrências', () => {
    const r = rule({ maxOccurrences: 2 });
    expect(occurrenceDates(r, '2026-01-01', '2026-12-31')).toEqual(['2026-01-10', '2026-02-10']);
  });

  it('conta o limite desde o início, mesmo consultando uma janela adiante', () => {
    const r = rule({ maxOccurrences: 3 });
    expect(occurrenceDates(r, '2026-04-01', '2026-12-31')).toEqual([]);
  });

  it('pula as ocorrências apagadas individualmente', () => {
    const r = rule({ skippedDates: ['2026-02-10'] });
    expect(occurrenceDates(r, '2026-01-01', '2026-03-31')).toEqual(['2026-01-10', '2026-03-10']);
  });

  it('não gera nada quando a regra está desativada', () => {
    expect(occurrenceDates(rule({ active: false }), '2026-01-01', '2026-12-31')).toEqual([]);
  });
});

describe('projectRule', () => {
  it('omite ocorrências que já viraram lançamento gravado', () => {
    const projected = projectRule(rule(), '2026-01-01', '2026-03-31', new Set(['2026-02-10']));
    expect(projected.map((p) => p.date)).toEqual(['2026-01-10', '2026-03-10']);
  });

  it('marca a projeção como prevista e rastreável até a regra', () => {
    const [first] = projectRule(rule(), '2026-01-01', '2026-01-31', new Set());
    expect(first).toMatchObject({
      projected: true,
      status: 'pending',
      recurringId: 'r1',
      occurrenceDate: '2026-01-10',
      amount: 180000,
      description: 'Aluguel',
    });
  });
});

describe('materializedIndex e projectAll', () => {
  it('agrupa as ocorrências já gravadas por regra', () => {
    const index = materializedIndex([
      { recurringId: 'r1', occurrenceDate: '2026-01-10' },
      { recurringId: 'r1', occurrenceDate: '2026-02-10' },
      { recurringId: 'r2', occurrenceDate: '2026-01-05' },
      { recurringId: null, occurrenceDate: null },
    ]);
    expect([...(index.get('r1') ?? [])]).toEqual(['2026-01-10', '2026-02-10']);
    expect(index.has('r2')).toBe(true);
  });

  it('projeta várias regras e desconta as materializadas', () => {
    const rules = [rule(), rule({ id: 'r2', description: 'Salário', kind: 'income', startDate: '2026-01-05' })];
    const projected = projectAll(rules, [{ recurringId: 'r2', occurrenceDate: '2026-01-05' }], '2026-01-01', '2026-01-31');
    expect(projected.map((p) => `${p.recurringId}@${p.date}`)).toEqual(['r1@2026-01-10']);
  });
});

describe('describeFrequency', () => {
  it('descreve o intervalo em português', () => {
    expect(describeFrequency(rule())).toBe('Todo mês');
    expect(describeFrequency(rule({ interval: 3 }))).toBe('A cada 3 meses');
    expect(describeFrequency(rule({ frequency: 'weekly', interval: 2 }))).toBe('A cada 2 semanas');
    expect(describeFrequency(rule({ frequency: 'yearly' }))).toBe('Todo ano');
  });
});
