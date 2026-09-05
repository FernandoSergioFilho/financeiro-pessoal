import { describe, expect, it } from 'vitest';
import { buildPurchase, installmentLabel, purchaseProgress } from './installments.ts';
import type { Entry } from './types.ts';

function ids() {
  let n = 0;
  return () => `id${++n}`;
}

const draft = {
  description: 'Notebook',
  totalAmount: 450000,
  installments: 10,
  firstDate: '2026-03-15',
  accountId: 'cartao',
  categoryId: 'eletronicos',
};

describe('buildPurchase', () => {
  it('gera uma parcela por mês, na mesma data-base', () => {
    const { entries } = buildPurchase(draft, ids());
    expect(entries).toHaveLength(10);
    expect(entries.map((e) => e.date).slice(0, 3)).toEqual(['2026-03-15', '2026-04-15', '2026-05-15']);
    expect(entries.at(-1)!.date).toBe('2026-12-15');
  });

  it('mantém a soma das parcelas igual ao total da compra', () => {
    const { entries } = buildPurchase({ ...draft, totalAmount: 99999, installments: 7 }, ids());
    expect(entries.reduce((sum, e) => sum + e.amount, 0)).toBe(99999);
  });

  it('numera as parcelas e liga todas à mesma compra', () => {
    const { purchase, entries } = buildPurchase(draft, ids());
    expect(entries.map((e) => e.installmentNumber)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(entries.every((e) => e.installmentTotal === 10)).toBe(true);
    expect(entries.every((e) => e.purchaseId === purchase.id)).toBe(true);
  });

  it('encolhe o dia nos meses curtos', () => {
    const { entries } = buildPurchase({ ...draft, firstDate: '2026-01-31', installments: 3 }, ids());
    expect(entries.map((e) => e.date)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
  });

  it('marca como pagas as parcelas já vencidas e prevê as futuras', () => {
    const { entries } = buildPurchase({ ...draft, firstDate: '2020-01-10', installments: 3 }, ids());
    expect(entries.every((e) => e.status === 'settled')).toBe(true);

    const future = buildPurchase({ ...draft, firstDate: '2099-01-10', installments: 3 }, ids());
    expect(future.entries.every((e) => e.status === 'pending')).toBe(true);
  });

  it('lança toda parcela como despesa na conta escolhida', () => {
    const { entries } = buildPurchase(draft, ids());
    expect(entries.every((e) => e.kind === 'expense' && e.accountId === 'cartao')).toBe(true);
  });
});

describe('purchaseProgress', () => {
  it('resume o quanto já foi pago e o que falta', () => {
    const { purchase, entries } = buildPurchase({ ...draft, totalAmount: 30000, installments: 3 }, ids());
    const mixed: Entry[] = entries.map((e, i) => ({ ...e, status: i === 0 ? 'settled' : 'pending' }));

    expect(purchaseProgress(purchase, mixed)).toEqual({
      paid: 1,
      total: 3,
      paidAmount: 10000,
      remainingAmount: 20000,
      nextDate: '2026-04-15',
    });
  });

  it('não aponta próxima parcela quando tudo está pago', () => {
    const { purchase, entries } = buildPurchase({ ...draft, installments: 2 }, ids());
    const paid: Entry[] = entries.map((e) => ({ ...e, status: 'settled' }));
    expect(purchaseProgress(purchase, paid).nextDate).toBeNull();
  });

  it('ignora lançamentos de outras compras', () => {
    const { purchase, entries } = buildPurchase({ ...draft, installments: 2 }, ids());
    const outro: Entry = { ...entries[0]!, id: 'x', purchaseId: 'outra', amount: 999999 };
    expect(purchaseProgress(purchase, [...entries, outro]).total).toBe(2);
  });
});

describe('installmentLabel', () => {
  it('descreve a posição da parcela', () => {
    const { entries } = buildPurchase(draft, ids());
    expect(installmentLabel(entries[2]!)).toBe('3/10');
  });

  it('devolve null para lançamento avulso', () => {
    const { entries } = buildPurchase(draft, ids());
    const avulso: Entry = { ...entries[0]!, installmentNumber: null, installmentTotal: null };
    expect(installmentLabel(avulso)).toBeNull();
  });
});
