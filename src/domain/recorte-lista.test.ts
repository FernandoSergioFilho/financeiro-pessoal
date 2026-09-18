import { describe, expect, it } from 'vitest';

import {
  RECORTE_ABERTO, descreverRecorte, dimensoesDoAtalho, passaNoRecorte, temRecorte,
  type RecorteDaLista,
} from './recorte-lista.ts';
import type { DisplayEntry } from './types.ts';

const HOJE = '2026-09-18';

function lancamento(over: Partial<DisplayEntry> = {}): DisplayEntry {
  return {
    id: 'e1', date: HOJE, description: 'Mercado', amount: 1000, kind: 'expense',
    accountId: 'a1', toAccountId: null, categoryId: null, status: 'settled',
    recurringId: null, occurrenceDate: null, purchaseId: null,
    installmentNumber: null, installmentTotal: null,
    createdAt: HOJE, updatedAt: HOJE, ...over,
  } as DisplayEntry;
}

describe('os dois eixos se combinam', () => {
  /*
   * O pedido que motivou a mudança: "saídas E atrasados". Com um controle só,
   * escolher um apagava o outro e esta pergunta não tinha como ser feita.
   */
  const saidaAtrasada = lancamento({ id: 'a', kind: 'expense', status: 'pending', date: '2026-09-01' });
  const saidaPaga = lancamento({ id: 'b', kind: 'expense', status: 'settled', date: '2026-09-01' });
  const saidaFutura = lancamento({ id: 'c', kind: 'expense', status: 'pending', date: '2026-09-30' });
  const entradaAtrasada = lancamento({ id: 'd', kind: 'income', status: 'pending', date: '2026-09-01' });

  const todos = [saidaAtrasada, saidaPaga, saidaFutura, entradaAtrasada];
  const filtrar = (recorte: RecorteDaLista) =>
    todos.filter((e) => passaNoRecorte(e, recorte, HOJE)).map((e) => e.id);

  it('saídas e atrasados, juntos, deixam só a saída atrasada', () => {
    expect(filtrar({ tipo: 'expense', situacao: 'atrasado' })).toEqual(['a']);
  });

  it('cada eixo sozinho continua valendo', () => {
    expect(filtrar({ tipo: 'expense', situacao: 'tudo' })).toEqual(['a', 'b', 'c']);
    expect(filtrar({ tipo: 'tudo', situacao: 'atrasado' })).toEqual(['a', 'd']);
  });

  it('sem recorte nenhum, passa tudo', () => {
    expect(filtrar(RECORTE_ABERTO)).toEqual(['a', 'b', 'c', 'd']);
    expect(temRecorte(RECORTE_ABERTO)).toBe(false);
    expect(temRecorte({ tipo: 'expense', situacao: 'tudo' })).toBe(true);
  });

  it('atrasado é em aberto com data passada, e não qualquer data passada', () => {
    expect(passaNoRecorte(saidaPaga, { tipo: 'tudo', situacao: 'atrasado' }, HOJE)).toBe(false);
    expect(passaNoRecorte(saidaFutura, { tipo: 'tudo', situacao: 'atrasado' }, HOJE)).toBe(false);
  });

  it('o que vence hoje ainda não está atrasado', () => {
    const hoje = lancamento({ status: 'pending', date: HOJE });
    expect(passaNoRecorte(hoje, { tipo: 'tudo', situacao: 'atrasado' }, HOJE)).toBe(false);
    expect(passaNoRecorte(hoje, { tipo: 'tudo', situacao: 'em-aberto' }, HOJE)).toBe(true);
  });

  it('confirmado e em aberto se dividem sem sobra', () => {
    for (const entrada of todos) {
      const confirmado = passaNoRecorte(entrada, { tipo: 'tudo', situacao: 'confirmado' }, HOJE);
      const aberto = passaNoRecorte(entrada, { tipo: 'tudo', situacao: 'em-aberto' }, HOJE);
      expect(confirmado).toBe(!aberto);
    }
  });
});

describe('os atalhos do painel viram posição nos dois eixos', () => {
  it('cada atalho cai onde deve', () => {
    expect(dimensoesDoAtalho('all')).toEqual(RECORTE_ABERTO);
    expect(dimensoesDoAtalho('expense')).toEqual({ tipo: 'expense', situacao: 'tudo' });
    expect(dimensoesDoAtalho('pending')).toEqual({ tipo: 'tudo', situacao: 'em-aberto' });
    expect(dimensoesDoAtalho('atrasados')).toEqual({ tipo: 'tudo', situacao: 'atrasado' });
  });

  /*
   * O atalho de "atrasados" no painel precisa continuar trazendo exatamente o
   * que o aviso contou, senão o número do aviso e o tamanho da lista brigam.
   */
  it('o atalho de atrasados dá a mesma lista que o aviso do painel', () => {
    const entradas = [
      lancamento({ id: 'a', status: 'pending', date: '2026-09-01' }),
      lancamento({ id: 'b', status: 'settled', date: '2026-09-01' }),
      lancamento({ id: 'c', status: 'pending', date: '2026-09-30' }),
    ];
    const pelaLista = entradas.filter((e) => passaNoRecorte(e, dimensoesDoAtalho('atrasados'), HOJE));
    const peloAviso = entradas.filter((e) => e.status === 'pending' && e.date < HOJE);
    expect(pelaLista).toEqual(peloAviso);
  });
});

describe('descreverRecorte', () => {
  it('diz os dois eixos quando os dois estão postos', () => {
    expect(descreverRecorte({ tipo: 'expense', situacao: 'atrasado' })).toBe('saídas · atrasados');
  });

  it('diz só o que está posto', () => {
    expect(descreverRecorte({ tipo: 'expense', situacao: 'tudo' })).toBe('saídas');
    expect(descreverRecorte({ tipo: 'tudo', situacao: 'em-aberto' })).toBe('em aberto');
    expect(descreverRecorte(RECORTE_ABERTO)).toBe('');
  });
});
