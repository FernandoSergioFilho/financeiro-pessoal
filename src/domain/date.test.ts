import { describe, expect, it } from 'vitest';
import { addDays, addMonths, daysInMonth, formatMonthKey, monthEnd, parseISO, toISO } from './date.ts';

describe('parseISO / toISO', () => {
  it('faz o ida e volta sem deslocar o dia por fuso horário', () => {
    expect(toISO(parseISO('2026-01-31'))).toBe('2026-01-31');
    expect(toISO(parseISO('2026-12-01'))).toBe('2026-12-01');
  });

  it('recusa data malformada', () => {
    expect(() => parseISO('31/01/2026')).toThrow();
  });
});

describe('addMonths', () => {
  it('preserva o dia quando ele existe no mês de destino', () => {
    expect(addMonths('2026-01-15', 1)).toBe('2026-02-15');
    expect(addMonths('2026-01-15', 12)).toBe('2027-01-15');
  });

  it('encolhe para o último dia quando o mês de destino é mais curto', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-01-31', 3)).toBe('2026-04-30');
  });

  it('não deixa o dia derreter, porque sempre parte da data original', () => {
    // Se a conta fosse encadeada (jan→fev→mar), março cairia em 28.
    expect(addMonths('2026-01-31', 2)).toBe('2026-03-31');
  });

  it('lida com 29 de fevereiro em ano bissexto', () => {
    expect(addMonths('2028-02-29', 12)).toBe('2029-02-28');
  });

  it('atravessa a virada do ano nos dois sentidos', () => {
    expect(addMonths('2026-11-10', 3)).toBe('2027-02-10');
    expect(addMonths('2026-02-10', -3)).toBe('2025-11-10');
  });
});

describe('addDays', () => {
  it('atravessa mês e ano', () => {
    expect(addDays('2026-02-27', 2)).toBe('2026-03-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });
});

describe('daysInMonth / monthEnd', () => {
  it('conhece fevereiro bissexto', () => {
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(monthEnd('2028-02')).toBe('2028-02-29');
    expect(monthEnd('2026-09')).toBe('2026-09-30');
  });
});

describe('formatMonthKey', () => {
  it('escreve o mês por extenso em português', () => {
    expect(formatMonthKey('2026-09')).toBe('Setembro de 2026');
    expect(formatMonthKey('2026-03')).toBe('Março de 2026');
  });
});
