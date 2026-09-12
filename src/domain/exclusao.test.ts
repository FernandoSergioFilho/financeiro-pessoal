import { describe, expect, it } from 'vitest';

import {
  descreverImpacto,
  descreverImpactoEmLancamentos,
  impactoDeApagarCompras,
  impactoDeApagarLancamentos,
  impactoDeApagarRecorrentes,
} from './exclusao.ts';
import type { DisplayEntry, Entry, FinanceData, InstallmentPurchase, RecurringRule } from './types.ts';

const STAMP = '2026-01-01T00:00:00.000Z';

const compra = (id: string): InstallmentPurchase => ({
  id, description: id, totalAmount: 10000, installments: 2, firstDate: '2026-09-01',
  accountId: 'a1', categoryId: null, createdAt: STAMP, updatedAt: STAMP,
});

const regra = (id: string): RecurringRule => ({
  id, description: id, amount: 1000, kind: 'expense', accountId: 'a1', toAccountId: null,
  categoryId: null, frequency: 'monthly', interval: 1, startDate: '2026-01-01',
  endDate: null, maxOccurrences: null, skippedDates: [], active: true,
  createdAt: STAMP, updatedAt: STAMP,
});

const lanc = (id: string, over: Partial<Entry> = {}): Entry => ({
  id, date: '2026-09-01', description: id, amount: 1000, kind: 'expense',
  accountId: 'a1', toAccountId: null, categoryId: null, status: 'pending',
  recurringId: null, occurrenceDate: null, purchaseId: null,
  installmentNumber: null, installmentTotal: null, createdAt: STAMP, updatedAt: STAMP, ...over,
});

const carteira = (over: Partial<FinanceData> = {}): FinanceData => ({
  version: 2, accounts: [], categories: [], entries: [], recurring: [], purchases: [], tombstones: [], ...over,
});

describe('impactoDeApagarCompras', () => {
  it('conta as parcelas que somem junto', () => {
    const data = carteira({
      purchases: [compra('p1'), compra('p2')],
      entries: [lanc('a', { purchaseId: 'p1' }), lanc('b', { purchaseId: 'p1' }), lanc('c', { purchaseId: 'p2' })],
    });
    expect(impactoDeApagarCompras(data, new Set(['p1']))).toEqual({
      itens: 1, lancamentosApagados: 2, lancamentosDesvinculados: 0,
    });
  });

  it('ignora id que não existe mais', () => {
    const data = carteira({ purchases: [compra('p1')] });
    expect(impactoDeApagarCompras(data, new Set(['p1', 'sumiu'])).itens).toBe(1);
  });

  it('seleção vazia não impacta nada', () => {
    const data = carteira({ purchases: [compra('p1')], entries: [lanc('a', { purchaseId: 'p1' })] });
    expect(impactoDeApagarCompras(data, new Set())).toEqual({
      itens: 0, lancamentosApagados: 0, lancamentosDesvinculados: 0,
    });
  });
});

describe('impactoDeApagarRecorrentes', () => {
  /*
   * A diferença que a confirmação precisa deixar clara: a regra some, mas o
   * que ela já gerou é histórico e fica. Tratar as duas ações como iguais
   * faria alguém apagar meio ano de lançamentos achando que limpava cadastro.
   */
  it('os lançamentos já gerados ficam — são desvinculados, não apagados', () => {
    const data = carteira({
      recurring: [regra('r1')],
      entries: [lanc('a', { recurringId: 'r1' }), lanc('b', { recurringId: 'r1' }), lanc('c')],
    });
    expect(impactoDeApagarRecorrentes(data, new Set(['r1']))).toEqual({
      itens: 1, lancamentosApagados: 0, lancamentosDesvinculados: 2,
    });
  });

  it('regra sem ocorrência gerada não mexe em lançamento nenhum', () => {
    const data = carteira({ recurring: [regra('r1')], entries: [lanc('a')] });
    expect(impactoDeApagarRecorrentes(data, new Set(['r1'])).lancamentosDesvinculados).toBe(0);
  });
});

describe('descreverImpacto', () => {
  it('avisa que as parcelas somem junto', () => {
    const texto = descreverImpacto(
      { itens: 3, lancamentosApagados: 24, lancamentosDesvinculados: 0 },
      'compra', 'compras',
    );
    expect(texto).toContain('3 compras e 24 lançamentos');
    expect(texto).toContain('somem junto');
  });

  it('avisa que o histórico fica', () => {
    const texto = descreverImpacto(
      { itens: 2, lancamentosApagados: 0, lancamentosDesvinculados: 9 },
      'conta recorrente', 'contas recorrentes',
    );
    expect(texto).toContain('2 contas recorrentes');
    expect(texto).toContain('continuam no histórico');
  });

  it('concorda no singular', () => {
    expect(descreverImpacto({ itens: 1, lancamentosApagados: 1, lancamentosDesvinculados: 0 }, 'compra', 'compras'))
      .toContain('1 compra e 1 lançamento');
    expect(descreverImpacto({ itens: 1, lancamentosApagados: 0, lancamentosDesvinculados: 1 }, 'regra', 'regras'))
      .toContain('1 lançamento já gerado continua');
  });

  it('diz claramente quando nada mais é afetado', () => {
    expect(descreverImpacto({ itens: 2, lancamentosApagados: 0, lancamentosDesvinculados: 0 }, 'regra', 'regras'))
      .toBe('2 regras. Nenhum lançamento é afetado.');
  });
});

describe('impactoDeApagarLancamentos', () => {
  const previsto = (id: string): DisplayEntry =>
    ({ ...lanc(id), projected: true, recurringId: 'r1', occurrenceDate: '2026-09-01' }) as DisplayEntry;

  it('separa o que é gravado do que é só previsto', () => {
    const data = carteira({ entries: [lanc('a')] });
    const impacto = impactoDeApagarLancamentos(data, [lanc('a') as DisplayEntry, previsto('proj:r1:2026-09-01')]);
    expect(impacto).toMatchObject({ gravados: 1, previstos: 1 });
  });

  /*
   * A distinção que a confirmação precisa carregar: a ocorrência prevista não
   * é um registro, é gerada pela regra. "Apagar" ali dispensa aquele mês — e
   * chamar isso de apagar faria alguém achar que matou a conta de luz inteira.
   */
  it('a frase explica que a regra continua valendo', () => {
    const texto = descreverImpactoEmLancamentos({ gravados: 0, previstos: 3, comprasEsvaziadas: 0 });
    expect(texto).toContain('dispensadas');
    expect(texto).toContain('a regra continua valendo');
  });

  it('avisa quando a compra fica sem nenhuma parcela', () => {
    const data = carteira({
      purchases: [compra('p1')],
      entries: [lanc('a', { purchaseId: 'p1' }), lanc('b', { purchaseId: 'p1' })],
    });
    const todas = data.entries as DisplayEntry[];
    expect(impactoDeApagarLancamentos(data, todas).comprasEsvaziadas).toBe(1);
  });

  it('apagar só parte das parcelas não esvazia a compra', () => {
    const data = carteira({
      purchases: [compra('p1')],
      entries: [lanc('a', { purchaseId: 'p1' }), lanc('b', { purchaseId: 'p1' })],
    });
    expect(impactoDeApagarLancamentos(data, [data.entries[0] as DisplayEntry]).comprasEsvaziadas).toBe(0);
  });

  it('junta as três coisas numa frase só', () => {
    const texto = descreverImpactoEmLancamentos({ gravados: 5, previstos: 2, comprasEsvaziadas: 1 });
    expect(texto).toMatch(/^5 lançamentos serão apagados; /);
    expect(texto).toContain('; e 1 compra parcelada fica sem nenhuma parcela e some junto.');
  });

  it('seleção vazia não inventa frase', () => {
    expect(descreverImpactoEmLancamentos({ gravados: 0, previstos: 0, comprasEsvaziadas: 0 }))
      .toBe('Nada foi selecionado.');
  });
});
