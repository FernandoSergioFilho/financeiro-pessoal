import { describe, expect, it } from 'vitest';

import { RECORTES, filtrarPorSituacao, sufixoDoRecorte } from './situacao.ts';
import type { DisplayEntry } from './types.ts';

const lancamento = (id: string, status: DisplayEntry['status']): DisplayEntry =>
  ({ id, date: '2026-09-10', description: 'x', amount: 100, kind: 'expense',
     accountId: 'a1', status, createdAt: '', updatedAt: '' }) as DisplayEntry;

const lista = [lancamento('confirmado', 'settled'), lancamento('falta', 'pending')];

describe('filtrarPorSituacao', () => {
  it('"tudo" deixa passar os dois', () => {
    expect(filtrarPorSituacao(lista, 'tudo').map((e) => e.id)).toEqual(['confirmado', 'falta']);
  });

  it('"já pago" deixa só o que foi marcado', () => {
    expect(filtrarPorSituacao(lista, 'confirmado').map((e) => e.id)).toEqual(['confirmado']);
  });

  it('"a pagar" deixa só o que ainda não foi', () => {
    expect(filtrarPorSituacao(lista, 'em-aberto').map((e) => e.id)).toEqual(['falta']);
  });

  it('os dois recortes juntos dão o total, sem sobra nem repetição', () => {
    const pagos = filtrarPorSituacao(lista, 'confirmado');
    const aPagar = filtrarPorSituacao(lista, 'em-aberto');
    expect(pagos.length + aPagar.length).toBe(lista.length);
    expect(pagos.some((p) => aPagar.includes(p))).toBe(false);
  });

  it('não mexe na lista que recebeu', () => {
    const original = [...lista];
    filtrarPorSituacao(lista, 'confirmado');
    expect(lista).toEqual(original);
  });

  it('lista vazia continua vazia em qualquer recorte', () => {
    for (const { valor } of RECORTES) expect(filtrarPorSituacao([], valor)).toEqual([]);
  });
});

describe('sufixoDoRecorte', () => {
  it('"Tudo" não precisa de sufixo — é o padrão', () => {
    expect(sufixoDoRecorte('tudo')).toBe('');
  });

  it('os outros dizem de que recorte o número fala', () => {
    expect(`Saídas${sufixoDoRecorte('confirmado')}`).toBe('Saídas confirmadas');
    expect(`Saídas${sufixoDoRecorte('em-aberto')}`).toBe('Saídas em aberto');
  });

  // Português concorda: sem isto o cartão saía escrito "Sobra confirmadas".
  it('concorda no singular quando o rótulo é singular', () => {
    expect(`Sobra${sufixoDoRecorte('confirmado', 'singular')}`).toBe('Sobra confirmada');
    expect(`Sobra${sufixoDoRecorte('em-aberto', 'singular')}`).toBe('Sobra em aberto');
    expect(`Sobra${sufixoDoRecorte('tudo', 'singular')}`).toBe('Sobra');
  });
});
