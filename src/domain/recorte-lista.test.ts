import { describe, expect, it } from 'vitest';

import {
  RECORTE_ABERTO, descreverRecorte, dimensoesDoAtalho, passaNoRecorte, temRecorte,
  type RecorteDaLista,
} from './recorte-lista.ts';
import { quandoSai } from './faturas.ts';
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

/*
 * O relato, com a tela na mão: a fatura que vence dia 28 aparecia inteira no
 * filtro de "Atrasados" no dia 24.
 *
 * A causa é a data que se olha. Uma compra no cartão tem DUAS datas: o dia em
 * que foi feita (20 de agosto) e o dia em que o dinheiro sai (28 de setembro,
 * quando a fatura vence). Olhando a primeira, toda compra do mês passado
 * parece atrasada no dia seguinte ao fechamento — mesmo com a fatura ainda por
 * vencer.
 *
 * A etiqueta na linha já fazia certo, com um comentário explicando justamente
 * isto. O filtro novo não seguiu a regra que já estava escrita ao lado.
 */
describe('atrasado é pela data em que o dinheiro SAI', () => {
  const HOJE_AQUI = '2026-09-24';
  const atrasado = (e: DisplayEntry) => passaNoRecorte(e, { tipo: 'tudo', situacao: 'atrasado' }, HOJE_AQUI);

  /** Compra de 20/08 na fatura que vence em 28/09 — não está atrasada. */
  const compraNoCartao = lancamento({
    id: 'cartao', status: 'pending', date: '2026-08-20', caixa: '2026-09-28',
  } as Partial<DisplayEntry>);

  it('a compra no cartão não atrasa antes de a fatura vencer', () => {
    expect(atrasado(compraNoCartao)).toBe(false);
  });

  it('e atrasa quando a fatura vence e continua em aberto', () => {
    const faturaVencida = lancamento({
      id: 'vencida', status: 'pending', date: '2026-07-20', caixa: '2026-08-28',
    } as Partial<DisplayEntry>);
    expect(atrasado(faturaVencida)).toBe(true);
  });

  it('a compra no cartão continua sendo "em aberto"', () => {
    // Ela não é atrasada, mas também não é confirmada: o dinheiro ainda vai
    // sair. Consertar o atraso não pode fazê-la sumir do outro filtro.
    expect(passaNoRecorte(compraNoCartao, { tipo: 'tudo', situacao: 'em-aberto' }, HOJE_AQUI)).toBe(true);
    expect(passaNoRecorte(compraNoCartao, { tipo: 'tudo', situacao: 'confirmado' }, HOJE_AQUI)).toBe(false);
  });

  it('sem data de caixa, vale a data do lançamento, como sempre', () => {
    const contaDeLuz = lancamento({ id: 'luz', status: 'pending', date: '2026-09-15' });
    expect(atrasado(contaDeLuz)).toBe(true);
    expect(atrasado(lancamento({ id: 'futura', status: 'pending', date: '2026-09-30' }))).toBe(false);
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
      // A compra no cartão, que é onde os dois discordavam.
      lancamento({ id: 'd', status: 'pending', date: '2026-08-20', caixa: '2026-09-28' } as Partial<DisplayEntry>),
    ];
    const pelaLista = entradas.filter((e) => passaNoRecorte(e, dimensoesDoAtalho('atrasados'), HOJE));
    // O aviso do painel conta o que `entriesInRange` devolveu até ontem, e essa
    // função recorta pela data de CAIXA — por isso o espelho aqui é `quandoSai`.
    const peloAviso = entradas.filter((e) => e.status === 'pending' && quandoSai(e) < HOJE);
    expect(pelaLista).toEqual(peloAviso);
    expect(pelaLista.map((e) => e.id)).toEqual(['a']); // e não ['a', 'd']
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
