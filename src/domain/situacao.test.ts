import { describe, expect, it } from 'vitest';

import { RECORTES, filtrarPorSituacao, sufixoDoRecorte } from './situacao.ts';
import type { DisplayEntry } from './types.ts';

const lancamento = (id: string, status: DisplayEntry['status']): DisplayEntry =>
  ({ id, date: '2026-09-10', description: 'x', amount: 100, kind: 'expense',
     accountId: 'a1', status, createdAt: '', updatedAt: '' }) as DisplayEntry;

const lista = [lancamento('pago', 'settled'), lancamento('falta', 'pending')];

describe('filtrarPorSituacao', () => {
  it('"tudo" deixa passar os dois', () => {
    expect(filtrarPorSituacao(lista, 'tudo').map((e) => e.id)).toEqual(['pago', 'falta']);
  });

  it('"já pago" deixa só o que foi marcado', () => {
    expect(filtrarPorSituacao(lista, 'pago').map((e) => e.id)).toEqual(['pago']);
  });

  it('"a pagar" deixa só o que ainda não foi', () => {
    expect(filtrarPorSituacao(lista, 'a-pagar').map((e) => e.id)).toEqual(['falta']);
  });

  it('os dois recortes juntos dão o total, sem sobra nem repetição', () => {
    const pagos = filtrarPorSituacao(lista, 'pago');
    const aPagar = filtrarPorSituacao(lista, 'a-pagar');
    expect(pagos.length + aPagar.length).toBe(lista.length);
    expect(pagos.some((p) => aPagar.includes(p))).toBe(false);
  });

  it('não mexe na lista que recebeu', () => {
    const original = [...lista];
    filtrarPorSituacao(lista, 'pago');
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
    expect(`Saídas${sufixoDoRecorte('pago')}`).toBe('Saídas já pagas');
    expect(`Saídas${sufixoDoRecorte('a-pagar')}`).toBe('Saídas a pagar');
  });

  // Português concorda: sem isto o cartão saía escrito "Sobra já pagas".
  it('concorda no singular quando o rótulo é singular', () => {
    expect(`Sobra${sufixoDoRecorte('pago', 'singular')}`).toBe('Sobra já paga');
    expect(`Sobra${sufixoDoRecorte('a-pagar', 'singular')}`).toBe('Sobra a pagar');
    expect(`Sobra${sufixoDoRecorte('tudo', 'singular')}`).toBe('Sobra');
  });
});
