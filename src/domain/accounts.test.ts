import { describe, expect, it } from 'vitest';

import { contaEmUso, descreverUso, limparComprasOrfas, moverConta, usoDaConta } from './accounts.ts';
import type { Entry, FinanceData, InstallmentPurchase, RecurringRule } from './types.ts';

const AGORA = '2026-09-08T10:00:00.000Z';

function base(over: Partial<FinanceData> = {}): FinanceData {
  return {
    version: 1,
    accounts: [],
    categories: [],
    entries: [],
    recurring: [],
    purchases: [],
    tombstones: [],
    ...over,
  };
}

function lancamento(over: Partial<Entry> = {}): Entry {
  return {
    id: 'e1',
    date: '2026-09-10',
    description: 'Mercado',
    amount: 15000,
    kind: 'expense',
    accountId: 'a1',
    toAccountId: null,
    categoryId: null,
    status: 'settled',
    recurringId: null,
    occurrenceDate: null,
    purchaseId: null,
    installmentNumber: null,
    installmentTotal: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...over,
  };
}

function regra(over: Partial<RecurringRule> = {}): RecurringRule {
  return {
    id: 'r1',
    description: 'Aluguel',
    amount: 200000,
    kind: 'expense',
    accountId: 'a1',
    toAccountId: null,
    categoryId: null,
    frequency: 'monthly',
    interval: 1,
    startDate: '2026-01-05',
    endDate: null,
    maxOccurrences: null,
    skippedDates: [],
    active: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

function compra(over: Partial<InstallmentPurchase> = {}): InstallmentPurchase {
  return {
    id: 'p1',
    description: 'Geladeira',
    totalAmount: 300000,
    installments: 10,
    firstDate: '2026-03-05',
    accountId: 'a1',
    categoryId: null,
    createdAt: '2026-03-01T00:00:00.000Z',
    updatedAt: '2026-03-01T00:00:00.000Z',
    ...over,
  };
}

describe('usoDaConta', () => {
  it('conta zero para uma conta que ninguém usa', () => {
    const data = base({ entries: [lancamento()], recurring: [regra()] });
    expect(usoDaConta(data, 'a2').total).toBe(0);
    expect(contaEmUso(data, 'a2')).toBe(false);
  });

  it('separa lançamentos, recorrentes e compras em vez de dizer só "tem"', () => {
    const data = base({
      entries: [lancamento({ id: 'e1' }), lancamento({ id: 'e2', purchaseId: 'p1' })],
      recurring: [regra()],
      purchases: [compra()],
    });
    expect(usoDaConta(data, 'a1')).toEqual({
      lancamentos: 2,
      recorrentes: 1,
      compras: 1,
      comprasOrfas: 0,
      total: 4,
    });
  });

  it('conta a ponta de destino de uma transferência', () => {
    const data = base({ entries: [lancamento({ kind: 'transfer', accountId: 'a1', toAccountId: 'a2' })] });
    expect(usoDaConta(data, 'a2').lancamentos).toBe(1);
  });

  // O bug: apagar as parcelas uma a uma deixava a compra sem parcela nenhuma,
  // invisível na prática, e a conta ficava presa para sempre.
  it('acusa a compra que ficou sem nenhuma parcela', () => {
    const data = base({ purchases: [compra()] });
    expect(usoDaConta(data, 'a1')).toMatchObject({ compras: 0, comprasOrfas: 1, total: 1 });
  });
});

describe('descreverUso', () => {
  it('escreve em português, com singular e plural certos', () => {
    expect(descreverUso(usoDaConta(base({ entries: [lancamento()] }), 'a1'))).toBe('1 lançamento');
    expect(
      descreverUso(usoDaConta(base({ entries: [lancamento({ id: 'e1' }), lancamento({ id: 'e2' })] }), 'a1')),
    ).toBe('2 lançamentos');
  });

  it('junta as partes com vírgula e "e"', () => {
    const data = base({ entries: [lancamento()], recurring: [regra()], purchases: [compra({ id: 'p9' })] });
    expect(descreverUso(usoDaConta(data, 'a1'))).toBe(
      '1 lançamento, 1 conta recorrente e 1 compra parcelada sem parcelas',
    );
  });

  it('diz "nada" quando não há nada', () => {
    expect(descreverUso(usoDaConta(base(), 'a1'))).toBe('nada');
  });
});

describe('moverConta', () => {
  it('leva lançamentos, recorrentes e compras para a conta escolhida', () => {
    const data = base({ entries: [lancamento()], recurring: [regra()], purchases: [compra()] });
    const { data: novo, movidos } = moverConta(data, 'a1', 'a2', AGORA);
    expect(movidos).toBe(3);
    expect(novo.entries[0]!.accountId).toBe('a2');
    expect(novo.recurring[0]!.accountId).toBe('a2');
    expect(novo.purchases[0]!.accountId).toBe('a2');
    expect(usoDaConta(novo, 'a1').total).toBe(0);
  });

  it('leva também a ponta de destino de uma transferência', () => {
    const data = base({ entries: [lancamento({ kind: 'transfer', accountId: 'a3', toAccountId: 'a1' })] });
    const { data: novo } = moverConta(data, 'a1', 'a2', AGORA);
    expect(novo.entries[0]!.toAccountId).toBe('a2');
  });

  // Uma transferência de A para B, depois de fundir A em B, seria dinheiro
  // saindo e voltando para o mesmo lugar: some, com rastro para os outros
  // aparelhos não a ressuscitarem.
  it('descarta a transferência cujas duas pontas viraram a mesma conta', () => {
    const data = base({ entries: [lancamento({ kind: 'transfer', accountId: 'a1', toAccountId: 'a2' })] });
    const { data: novo, transferenciasDescartadas } = moverConta(data, 'a1', 'a2', AGORA);
    expect(transferenciasDescartadas).toBe(1);
    expect(novo.entries).toHaveLength(0);
    expect(novo.tombstones).toEqual([{ table: 'entries', id: 'e1', deletedAt: AGORA }]);
  });

  it('carimba updatedAt no que mudou, senão a sincronização ignora a mudança', () => {
    const data = base({ entries: [lancamento()] });
    const { data: novo } = moverConta(data, 'a1', 'a2', AGORA);
    expect(novo.entries[0]!.updatedAt).toBe(AGORA);
  });

  it('não mexe em quem não é da conta de origem', () => {
    const data = base({ entries: [lancamento({ id: 'outro', accountId: 'a9' })] });
    const { data: novo, movidos } = moverConta(data, 'a1', 'a2', AGORA);
    expect(movidos).toBe(0);
    expect(novo).toBe(data); // mesma referência: nada a fazer
  });

  it('mover para a mesma conta não faz nada', () => {
    const data = base({ entries: [lancamento()] });
    expect(moverConta(data, 'a1', 'a1', AGORA).data).toBe(data);
  });

  it('aplicar de novo não muda mais nada', () => {
    const data = base({ entries: [lancamento()], recurring: [regra()], purchases: [compra()] });
    const primeira = moverConta(data, 'a1', 'a2', AGORA);
    const segunda = moverConta(primeira.data, 'a1', 'a2', AGORA);
    expect(segunda.data).toBe(primeira.data);
  });
});

describe('limparComprasOrfas', () => {
  it('remove a compra sem parcelas e deixa rastro', () => {
    const data = base({ purchases: [compra()] });
    const { data: novo, removidas } = limparComprasOrfas(data, AGORA);
    expect(removidas).toBe(1);
    expect(novo.purchases).toHaveLength(0);
    expect(novo.tombstones).toEqual([{ table: 'purchases', id: 'p1', deletedAt: AGORA }]);
  });

  it('não toca na compra que ainda tem parcela', () => {
    const data = base({ purchases: [compra()], entries: [lancamento({ purchaseId: 'p1' })] });
    expect(limparComprasOrfas(data, AGORA).data).toBe(data);
  });
});
