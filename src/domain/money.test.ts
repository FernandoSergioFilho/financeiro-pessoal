import { describe, expect, it } from 'vitest';
import { formatMoney, parseMoney, splitInstallments } from './money.ts';

describe('parseMoney', () => {
  it('lê o formato brasileiro', () => {
    expect(parseMoney('1.234,56')).toBe(123456);
    expect(parseMoney('R$ 89,90')).toBe(8990);
    expect(parseMoney('0,05')).toBe(5);
  });

  it('lê o formato com ponto decimal, comum em teclado numérico', () => {
    expect(parseMoney('1234.56')).toBe(123456);
    expect(parseMoney('89.9')).toBe(8990);
  });

  it('trata ponto com três casas como separador de milhar', () => {
    expect(parseMoney('1.234')).toBe(123400);
    expect(parseMoney('12.000')).toBe(1200000);
  });

  it('aceita valor sem separador', () => {
    expect(parseMoney('42')).toBe(4200);
  });

  it('aceita negativo', () => {
    expect(parseMoney('-25,50')).toBe(-2550);
  });

  it('devolve null para entrada vazia ou não numérica', () => {
    expect(parseMoney('')).toBeNull();
    expect(parseMoney('   ')).toBeNull();
    expect(parseMoney('abc')).toBeNull();
  });
});

describe('formatMoney', () => {
  it('formata em real com dois decimais', () => {
    // O Intl usa espaço não separável entre símbolo e número.
    expect(formatMoney(123456).replace(/ /g, ' ')).toBe('R$ 1.234,56');
    expect(formatMoney(0).replace(/ /g, ' ')).toBe('R$ 0,00');
  });
});

describe('splitInstallments', () => {
  it('soma exatamente o total mesmo quando não divide redondo', () => {
    for (const [total, count] of [[10000, 3], [9999, 7], [1, 3], [123456, 11]] as const) {
      const parts = splitInstallments(total, count);
      expect(parts).toHaveLength(count);
      expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
    }
  });

  it('joga o resto nas primeiras parcelas, como a maquininha', () => {
    expect(splitInstallments(10000, 3)).toEqual([3334, 3333, 3333]);
  });

  it('não gera parcela com diferença maior que um centavo', () => {
    const parts = splitInstallments(9999, 7);
    expect(Math.max(...parts) - Math.min(...parts)).toBeLessThanOrEqual(1);
  });

  it('parcela única devolve o total', () => {
    expect(splitInstallments(4999, 1)).toEqual([4999]);
  });

  it('recusa contagem inválida', () => {
    expect(() => splitInstallments(1000, 0)).toThrow();
  });
});
