import { describe, expect, it } from 'vitest';

import { ajustarParaDiaUtil, diaUtilAnterior, diaUtilSeguinte, ehDiaUtil, ehFimDeSemana } from './diautil.ts';

// Setembro de 2026: dia 5 é sábado, 6 é domingo, 4 é sexta e 7 é segunda.
const SABADO = '2026-09-05';
const DOMINGO = '2026-09-06';
const SEXTA = '2026-09-04';
const SEGUNDA = '2026-09-07';

describe('ehFimDeSemana', () => {
  it('reconhece sábado e domingo', () => {
    expect(ehFimDeSemana(SABADO)).toBe(true);
    expect(ehFimDeSemana(DOMINGO)).toBe(true);
  });

  it('a sexta e a segunda são dias úteis', () => {
    expect(ehDiaUtil(SEXTA)).toBe(true);
    expect(ehDiaUtil(SEGUNDA)).toBe(true);
  });
});

describe('diaUtilAnterior e diaUtilSeguinte', () => {
  it('do domingo, volta dois dias e avança um', () => {
    expect(diaUtilAnterior(DOMINGO)).toBe(SEXTA);
    expect(diaUtilSeguinte(DOMINGO)).toBe(SEGUNDA);
  });

  it('do sábado, volta um e avança dois', () => {
    expect(diaUtilAnterior(SABADO)).toBe(SEXTA);
    expect(diaUtilSeguinte(SABADO)).toBe(SEGUNDA);
  });

  it('um dia útil é ele mesmo, para os dois lados', () => {
    expect(diaUtilAnterior(SEXTA)).toBe(SEXTA);
    expect(diaUtilSeguinte(SEXTA)).toBe(SEXTA);
  });

  it('atravessa a virada do mês sem tropeçar', () => {
    // 01/11/2026 é domingo; o dia útil anterior está em outubro.
    expect(diaUtilAnterior('2026-11-01')).toBe('2026-10-30');
    expect(diaUtilSeguinte('2026-10-31')).toBe('2026-11-02');
  });
});

describe('ajustarParaDiaUtil', () => {
  /*
   * As duas regras andam para lados opostos de propósito. Juntar numa só
   * ("tudo vai para a segunda") faria o salário atrasar, que é justamente o
   * que ninguém vê acontecer na vida real.
   */
  it('o salário do domingo cai na sexta', () => {
    expect(ajustarParaDiaUtil(DOMINGO, 'income')).toBe(SEXTA);
  });

  it('o boleto do domingo é pago na segunda', () => {
    expect(ajustarParaDiaUtil(DOMINGO, 'expense')).toBe(SEGUNDA);
  });

  it('a transferência segue a regra de quem paga', () => {
    expect(ajustarParaDiaUtil(DOMINGO, 'transfer')).toBe(SEGUNDA);
  });

  it('em dia útil não mexe em nada, qualquer que seja o tipo', () => {
    expect(ajustarParaDiaUtil(SEXTA, 'income')).toBe(SEXTA);
    expect(ajustarParaDiaUtil(SEXTA, 'expense')).toBe(SEXTA);
  });
});
