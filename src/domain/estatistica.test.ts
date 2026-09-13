import { describe, expect, it } from 'vitest';

import {
  CONFIANCA_MINIMA, concentracao, media, mediana, projetar, tendencia, variacao,
} from './estatistica.ts';

describe('media e mediana', () => {
  /*
   * A razão de a mediana existir aqui. Um mês com a compra do notebook levanta
   * a média de "Educação" e faz o app dizer que se gasta R$ 600 por mês numa
   * categoria em que se gasta R$ 90.
   */
  it('a mediana ignora o mês do notebook; a média não', () => {
    const meses = [9000, 9000, 9500, 9000, 300000];
    expect(mediana(meses)).toBe(9000);
    expect(media(meses)).toBe(67300);
  });

  it('com quantidade par, a mediana é a média dos dois do meio', () => {
    expect(mediana([100, 200, 300, 400])).toBe(250);
  });

  it('lista vazia não inventa número', () => {
    expect(media([])).toBeNull();
    expect(mediana([])).toBeNull();
  });
});

describe('tendencia', () => {
  it('acha a subida em reais por mês', () => {
    expect(tendencia([100, 200, 300, 400, 500])).toMatchObject({ porMes: 100, confianca: 1 });
  });

  it('acha a descida', () => {
    expect(tendencia([500, 400, 300, 200])!.porMes).toBe(-100);
  });

  it('série parada tem inclinação zero', () => {
    expect(tendencia([300, 300, 300, 300])!.porMes).toBe(0);
  });

  /*
   * Com três pontos qualquer reta passa bem por qualquer coisa, e a confiança
   * sairia alta dizendo nada. É melhor não afirmar.
   */
  it('menos de quatro meses não é série', () => {
    expect(tendencia([100, 200, 300])).toBeNull();
  });

  /*
   * O que separa "está subindo" de "varia muito". Sem a confiança, o app
   * diria que Lazer sobe R$ 30 por mês numa série que só balança.
   */
  it('série barulhenta tem confiança baixa', () => {
    const barulho = tendencia([10000, 200, 9000, 500, 11000, 300])!;
    expect(barulho.confianca).toBeLessThan(CONFIANCA_MINIMA);
  });

  it('série limpa tem confiança alta', () => {
    expect(tendencia([1000, 1100, 1200, 1300, 1400])!.confianca).toBeGreaterThan(0.9);
  });
});

describe('variacao', () => {
  it('aluguel não varia; lazer varia muito', () => {
    expect(variacao([120000, 120000, 120000, 120000])).toBe(0);
    expect(variacao([5000, 90000, 12000, 70000])!).toBeGreaterThan(0.6);
  });

  it('um ponto só não tem variação para medir', () => {
    expect(variacao([100])).toBeNull();
  });

  it('série de zeros não divide por zero', () => {
    expect(variacao([0, 0, 0])).toBeNull();
  });
});

describe('concentracao', () => {
  /*
   * Decide onde vale a pena mexer: com 70% do gasto em três categorias,
   * cortar as pequenas não muda nada.
   */
  it('diz quanto do total está nos maiores', () => {
    expect(concentracao([70, 20, 10, 5, 5], 2)!).toBeCloseTo(0.818, 2);
  });

  it('total zero não vira divisão por zero', () => {
    expect(concentracao([0, 0])).toBeNull();
  });
});

describe('projetar', () => {
  it('com tendência clara, segue a reta', () => {
    expect(projetar([100, 200, 300, 400])).toBe(500);
  });

  /*
   * Projetar com uma reta que não descreve a série é inventar com aparência
   * de método. Sem confiança, o palpite honesto é o valor de costume.
   */
  it('sem tendência clara, usa a mediana', () => {
    const barulho = [10000, 200, 9000, 500, 11000, 300];
    expect(projetar(barulho)).toBe(mediana(barulho));
  });

  it('nunca projeta gasto negativo', () => {
    expect(projetar([400, 300, 200, 100])!).toBeGreaterThanOrEqual(0);
  });
});
