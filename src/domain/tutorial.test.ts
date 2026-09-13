import { describe, expect, it } from 'vitest';

import { CAPITULOS, capituloPorId } from './tutorial.ts';

/*
 * Um tutorial com um buraco no meio é pior do que nenhum: quem procurou ali
 * desiste do resto. Estas provas não julgam o texto — garantem que ele existe,
 * inteiro, em todo capítulo.
 */
describe('o tutorial está inteiro', () => {
  it('todo capítulo tem id único', () => {
    const ids = CAPITULOS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('todo capítulo tem emoji, título, resumo e ao menos três passos', () => {
    for (const c of CAPITULOS) {
      expect(c.emoji, c.id).not.toBe('');
      expect(c.titulo.length, c.id).toBeGreaterThan(3);
      expect(c.resumo.length, c.id).toBeGreaterThan(15);
      expect(c.passos.length, c.id).toBeGreaterThanOrEqual(3);
    }
  });

  it('todo passo começa com um verbo ou uma afirmação, e não fica vazio', () => {
    for (const c of CAPITULOS) {
      for (const p of c.passos) {
        expect(p.titulo.length, `${c.id}: ${p.titulo}`).toBeGreaterThan(10);
        if (p.detalhe !== undefined) {
          expect(p.detalhe.length, `${c.id}: ${p.titulo}`).toBeGreaterThan(30);
        }
      }
    }
  });

  it('capituloPorId acha o que existe e não inventa o que não existe', () => {
    expect(capituloPorId('cartao')?.titulo).toBe('O cartão de crédito');
    expect(capituloPorId('nao-existe')).toBeUndefined();
  });

  /*
   * A ordem é a de quem está aprendendo, não a do menu: o primeiro capítulo
   * tem de ser o dos primeiros minutos, senão o tutorial abre pelo meio.
   */
  it('começa pelo começo', () => {
    expect(CAPITULOS[0]!.id).toBe('comecar');
  });

  it('cobre os assuntos que geram dúvida', () => {
    const ids = CAPITULOS.map((c) => c.id);
    for (const assunto of ['cartao', 'importar', 'instalar', 'seguranca', 'investimentos']) {
      expect(ids).toContain(assunto);
    }
  });
});
