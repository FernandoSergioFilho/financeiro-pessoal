import { describe, expect, it } from 'vitest';

import { conciliar, resumirConciliacao, sugerirCategoria, type LinhaDeExtrato } from './conciliacao.ts';
import type { Entry } from './types.ts';

const STAMP = '2026-09-01T00:00:00.000Z';

function entry(over: Partial<Entry> = {}): Entry {
  return {
    id: 'e1', date: '2026-09-07', description: 'Mercado', amount: 9200,
    kind: 'expense', accountId: 'a1', toAccountId: null, categoryId: null,
    status: 'settled', recurringId: null, occurrenceDate: null, purchaseId: null,
    installmentNumber: null, installmentTotal: null,
    createdAt: STAMP, updatedAt: STAMP, ...over,
  };
}

function linha(over: Partial<LinhaDeExtrato> = {}): LinhaDeExtrato {
  return { data: '2026-09-07', descricao: 'Mercado', valor: -9200, identificador: null, linha: 2, ...over };
}

const CONTA = { accountId: 'a1' };

describe('conciliar', () => {
  it('o que não existe entra como novo', () => {
    const [proposta] = conciliar([], [linha()], CONTA);
    expect(proposta).toMatchObject({ veredito: 'nova', kind: 'expense', valorAbsoluto: 9200 });
  });

  it('o sinal decide se é entrada ou saída', () => {
    expect(conciliar([], [linha({ valor: 780000 })], CONTA)[0]!.kind).toBe('income');
    expect(conciliar([], [linha({ valor: -780000 })], CONTA)[0]!.kind).toBe('expense');
  });

  // A fatura do cartão vem com tudo positivo: sem isto, importar uma fatura
  // inteira criaria um mês de receita fantasma.
  it('na fatura de cartão, tudo é gasto mesmo vindo positivo', () => {
    const [proposta] = conciliar([], [linha({ valor: 6490, descricao: 'Ifood' })], { ...CONTA, tudoEhGasto: true });
    expect(proposta).toMatchObject({ kind: 'expense', valorAbsoluto: 6490 });
  });

  it('reconhece o que já foi digitado à mão e deixa desmarcado', () => {
    const [proposta] = conciliar([entry()], [linha()], CONTA);
    expect(proposta!.veredito).toBe('repetida');
    expect(proposta!.jaExiste?.id).toBe('e1');
  });

  it('reconhece mesmo com dois dias de diferença — banco e pessoa datam diferente', () => {
    const [proposta] = conciliar([entry({ date: '2026-09-05' })], [linha()], CONTA);
    expect(proposta!.veredito).toBe('repetida');
  });

  it('não confunde com um lançamento de semanas antes', () => {
    expect(conciliar([entry({ date: '2026-08-20' })], [linha()], CONTA)[0]!.veredito).toBe('nova');
  });

  it('valor diferente é outra coisa, mesmo no mesmo dia', () => {
    expect(conciliar([entry({ amount: 9201 })], [linha()], CONTA)[0]!.veredito).toBe('nova');
  });

  it('entrada não cancela saída do mesmo valor', () => {
    expect(conciliar([entry({ kind: 'income' })], [linha()], CONTA)[0]!.veredito).toBe('nova');
  });

  /*
   * O caso real: a pessoa digitou "Mercado" e o banco escreve
   * "PAG*SUPERMERCADOX". Mesmo valor, mesmo dia, descrição irreconhecível.
   * Fica em dúvida e desmarcado — duplicar em silêncio é pior que faltar.
   */
  it('mesmo valor no mesmo dia com outra descrição fica em dúvida', () => {
    const [proposta] = conciliar([entry()], [linha({ descricao: 'PAG*SUPERMERCADOX' })], CONTA);
    expect(proposta!.veredito).toBe('talvez');
    expect(proposta!.motivo).toContain('Mercado');
  });

  it('a descrição do banco que engloba a digitada casa como repetida', () => {
    const [proposta] = conciliar([entry()], [linha({ descricao: 'Compra no débito - MERCADO SAO JOAO' })], CONTA);
    expect(proposta!.veredito).toBe('repetida');
  });

  // "Mercado" está dentro de "supermercadox" como pedaço de texto, mas não
  // como palavra. Casar por pedaço declararia repetido o que não é.
  it('não casa palavra que é só um pedaço de outra', () => {
    const [proposta] = conciliar([entry()], [linha({ descricao: 'PAG*SUPERMERCADOX' })], CONTA);
    expect(proposta!.veredito).toBe('talvez');
  });

  /*
   * Duas compras iguais no mesmo dia são duas compras. Um lançamento existente
   * só pode explicar uma linha do extrato — senão a segunda sumia.
   */
  it('um lançamento existente explica uma linha só', () => {
    const propostas = conciliar([entry()], [linha({ linha: 2 }), linha({ linha: 3 })], CONTA);
    expect(propostas.map((p) => p.veredito)).toEqual(['repetida', 'nova']);
  });

  it('reimportar o mesmo arquivo não propõe nada de novo', () => {
    const linhas = [linha({ linha: 2 }), linha({ linha: 3, descricao: 'Farmácia', valor: -3300 })];
    const jaGravados = [entry({ id: 'g1' }), entry({ id: 'g2', description: 'Farmácia', amount: 3300 })];
    expect(resumirConciliacao(conciliar(jaGravados, linhas, CONTA))).toEqual({ novas: 0, repetidas: 2, talvez: 0 });
  });
});

describe('sugerirCategoria', () => {
  const historico = [
    entry({ id: '1', description: 'Uber para o centro', categoryId: 'transporte' }),
    entry({ id: '2', description: 'Uber aeroporto', categoryId: 'transporte' }),
    entry({ id: '3', description: 'Padaria da esquina', categoryId: 'alimentacao' }),
  ];

  it('aprende do histórico: "UBER *TRIP" vira Transporte', () => {
    expect(sugerirCategoria(historico, 'UBER *TRIP 4832', 'expense')).toBe('transporte');
  });

  it('não chuta quando nada no histórico se parece', () => {
    expect(sugerirCategoria(historico, 'PAGAMENTO DIVERSOS', 'expense')).toBeNull();
  });

  it('não sugere categoria de saída para uma entrada', () => {
    expect(sugerirCategoria(historico, 'Uber crédito', 'income')).toBeNull();
  });

  it('palavra curta demais não decide nada — "de", "da", "com"', () => {
    expect(sugerirCategoria([entry({ description: 'de', categoryId: 'x' })], 'de tudo', 'expense')).toBeNull();
  });
});
