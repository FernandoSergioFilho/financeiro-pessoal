import { describe, expect, it } from 'vitest';

import { LIMIAR_DE_SWIPE, deslocamentoVisual, direcaoDoGesto, passouDoLimiar } from './gestos.ts';

describe('direcaoDoGesto', () => {
  it('encostar o dedo ainda não é gesto nenhum', () => {
    expect(direcaoDoGesto(0, 0)).toBe('indefinido');
    expect(direcaoDoGesto(3, -4)).toBe('indefinido');
  });

  it('andar para o lado é horizontal', () => {
    expect(direcaoDoGesto(40, 5)).toBe('horizontal');
    expect(direcaoDoGesto(-40, 5)).toBe('horizontal');
  });

  /*
   * A regra que impede o gesto de sequestrar a rolagem: um dedo que quer rolar
   * a página quase nunca desce em linha reta, e sem a folga de 1,3× a lista
   * prenderia a rolagem em qualquer tremida.
   */
  it('descer torto continua sendo rolagem, não arrasto', () => {
    expect(direcaoDoGesto(12, 30)).toBe('vertical');
    expect(direcaoDoGesto(20, 20)).toBe('vertical');
    expect(direcaoDoGesto(25, 20)).toBe('vertical'); // 25 não é > 26
  });

  it('só passa a horizontal quando o lado ganha com folga', () => {
    expect(direcaoDoGesto(27, 20)).toBe('horizontal');
  });

  it('rolar reto para baixo é vertical', () => {
    expect(direcaoDoGesto(0, 60)).toBe('vertical');
  });
});

describe('passouDoLimiar', () => {
  it('vale para os dois lados', () => {
    expect(passouDoLimiar(LIMIAR_DE_SWIPE)).toBe(true);
    expect(passouDoLimiar(-LIMIAR_DE_SWIPE)).toBe(true);
  });

  it('um pouquinho antes ainda não vale', () => {
    expect(passouDoLimiar(LIMIAR_DE_SWIPE - 1)).toBe(false);
  });
});

describe('deslocamentoVisual', () => {
  it('acompanha o dedo até o limiar', () => {
    expect(deslocamentoVisual(50)).toBe(50);
    expect(deslocamentoVisual(-50)).toBe(-50);
  });

  // Depois do limiar o arrasto fica pesado: sinaliza que o gesto já acabou.
  it('freia depois do limiar, sem parar', () => {
    const solto = deslocamentoVisual(LIMIAR_DE_SWIPE + 100);
    expect(solto).toBeGreaterThan(LIMIAR_DE_SWIPE);
    expect(solto).toBeLessThan(LIMIAR_DE_SWIPE + 100);
  });

  it('freia igual para os dois lados', () => {
    expect(deslocamentoVisual(-(LIMIAR_DE_SWIPE + 100))).toBe(-deslocamentoVisual(LIMIAR_DE_SWIPE + 100));
  });

  it('parado é parado', () => {
    expect(deslocamentoVisual(0)).toBe(0);
  });
});
