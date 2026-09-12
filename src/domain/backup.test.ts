import { describe, expect, it } from 'vitest';

import {
  descreverCopia, motivoParaCopiar, quantidadeDeRegistros, rotuloDoMotivo, PRECIOSIDADE,
} from './backup.ts';
import type { Entry, FinanceData } from './types.ts';

const STAMP = '2026-09-08T12:00:00.000Z';

function lancamento(id: string): Entry {
  return {
    id, date: '2026-09-10', description: 'x', amount: 100, kind: 'expense',
    accountId: 'a1', toAccountId: null, categoryId: null, status: 'settled',
    recurringId: null, occurrenceDate: null, purchaseId: null,
    installmentNumber: null, installmentTotal: null, createdAt: STAMP, updatedAt: STAMP,
  };
}

function carteira(quantos: number): FinanceData {
  return {
    version: 2,
    accounts: [], categories: [],
    entries: Array.from({ length: quantos }, (_, i) => lancamento(`e${i}`)),
    recurring: [], purchases: [], tombstones: [],
  };
}

const vazia = carteira(0);

describe('quantidadeDeRegistros', () => {
  it('soma todas as tabelas, e não só os lançamentos', () => {
    const data = carteira(3);
    data.accounts = [{ id: 'a', name: 'x', kind: 'checking', openingBalance: 0, color: 'blue', updatedAt: STAMP }];
    expect(quantidadeDeRegistros(data)).toBe(4);
  });
});

describe('motivoParaCopiar', () => {
  it('não copia carteira vazia — não há o que proteger', () => {
    expect(motivoParaCopiar(vazia, carteira(50), null, STAMP)).toBeNull();
  });

  it('a primeira cópia de rotina sai assim que existe conteúdo', () => {
    expect(motivoParaCopiar(carteira(50), carteira(51), null, STAMP)).toBe('rotina');
  });

  it('não copia de novo antes das horas combinadas', () => {
    const tresHorasAntes = '2026-09-08T09:00:00.000Z';
    expect(motivoParaCopiar(carteira(50), carteira(51), tresHorasAntes, STAMP)).toBeNull();
  });

  it('copia de novo depois das horas combinadas', () => {
    const ontem = '2026-09-07T12:00:00.000Z';
    expect(motivoParaCopiar(carteira(50), carteira(51), ontem, STAMP)).toBe('rotina');
  });

  /*
   * O caso que justifica tudo: "apagar tudo" no botão errado, uma importação
   * torta, uma sincronização que trouxe a carteira vazia por cima da cheia.
   * Aqui a cópia não pode esperar as seis horas.
   */
  it('esvaziar a carteira é queda, mesmo tendo copiado agora há pouco', () => {
    const agoraMesmo = '2026-09-08T11:59:00.000Z';
    expect(motivoParaCopiar(carteira(50), vazia, agoraMesmo, STAMP)).toBe('queda');
  });

  it('perder mais de um terço é queda', () => {
    const agoraMesmo = '2026-09-08T11:59:00.000Z';
    expect(motivoParaCopiar(carteira(100), carteira(60), agoraMesmo, STAMP)).toBe('queda');
  });

  /*
   * Antes, perder pouco não guardava nada: apagar 5 de 300 em lote deixava a
   * pessoa sem caminho de volta. Agora guarda, mas numa gaveta própria — ver
   * o teste da preciosidade logo abaixo, que é o que faz isso ser seguro.
   */
  it('perder pouco também guarda cópia, na gaveta do lote', () => {
    const agoraMesmo = '2026-09-08T11:59:00.000Z';
    expect(motivoParaCopiar(carteira(100), carteira(99), agoraMesmo, STAMP)).toBe('lote');
  });

  it('apagar 5 de 300 em lote guarda cópia', () => {
    const agoraMesmo = '2026-09-08T11:59:00.000Z';
    expect(motivoParaCopiar(carteira(300), carteira(295), agoraMesmo, STAMP)).toBe('lote');
  });

  it('perda grande continua sendo queda, e não lote', () => {
    const agoraMesmo = '2026-09-08T11:59:00.000Z';
    expect(motivoParaCopiar(carteira(300), carteira(10), agoraMesmo, STAMP)).toBe('queda');
  });

  it('a queda é a mais preciosa, e a rotina a que se sacrifica primeiro', () => {
    expect(PRECIOSIDADE).toEqual(['queda', 'lote', 'rotina']);
  });

  it('crescer nunca é queda', () => {
    const agoraMesmo = '2026-09-08T11:59:00.000Z';
    expect(motivoParaCopiar(carteira(10), carteira(400), agoraMesmo, STAMP)).toBeNull();
  });

  it('data de rotina ilegível não trava a cópia para sempre', () => {
    expect(motivoParaCopiar(carteira(50), carteira(51), 'isto não é data', STAMP)).toBeNull();
  });
});

describe('descreverCopia', () => {
  it('diz quanto tem e de quando é', () => {
    const texto = descreverCopia({
      gravadaEm: new Date(2026, 8, 8, 14, 32).toISOString(),
      motivo: 'rotina',
      registros: 312,
      data: vazia,
    });
    expect(texto).toBe('312 registros, de 08/09/2026 às 14:32');
  });

  it('escreve no singular quando é um só', () => {
    const texto = descreverCopia({
      gravadaEm: new Date(2026, 8, 8, 9, 5).toISOString(),
      motivo: 'queda',
      registros: 1,
      data: vazia,
    });
    expect(texto).toBe('1 registro, de 08/09/2026 às 09:05');
  });
});

describe('rotuloDoMotivo', () => {
  it('cada gaveta diz de que susto protege', () => {
    expect(rotuloDoMotivo('queda')).toBe('Antes de uma perda grande');
    expect(rotuloDoMotivo('lote')).toBe('Antes da última exclusão');
    expect(rotuloDoMotivo('rotina')).toBe('De rotina');
  });
});
