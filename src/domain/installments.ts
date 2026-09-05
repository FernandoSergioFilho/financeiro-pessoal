/**
 * Compras parceladas.
 *
 * Diferente da recorrente, o total é finito e conhecido no cadastro, então
 * as parcelas viram lançamentos reais na hora: dá para editar a parcela de
 * março isoladamente sem precisar de um modelo de exceções, e a fatura
 * futura já nasce completa.
 */

import { addMonths, today } from './date.ts';
import { splitInstallments } from './money.ts';
import type { Entry, InstallmentPurchase } from './types.ts';

export interface PurchaseDraft {
  description: string;
  totalAmount: number;
  installments: number;
  firstDate: string;
  accountId: string;
  categoryId?: string | null;
}

/**
 * Monta a compra e suas parcelas. As parcelas caem no mesmo dia do mês da
 * primeira; meses curtos puxam para o último dia (31/01 → 28/02).
 */
export function buildPurchase(
  draft: PurchaseDraft,
  newId: () => string,
  now = new Date().toISOString(),
): { purchase: InstallmentPurchase; entries: Entry[] } {
  const purchase: InstallmentPurchase = {
    id: newId(),
    description: draft.description,
    totalAmount: draft.totalAmount,
    installments: draft.installments,
    firstDate: draft.firstDate,
    accountId: draft.accountId,
    categoryId: draft.categoryId ?? null,
    createdAt: now,
    updatedAt: now,
  };

  const amounts = splitInstallments(draft.totalAmount, draft.installments);
  const currentDay = today();

  const entries: Entry[] = amounts.map((amount, i) => {
    const date = addMonths(draft.firstDate, i);
    return {
      id: newId(),
      date,
      description: draft.description,
      amount,
      kind: 'expense',
      accountId: draft.accountId,
      toAccountId: null,
      categoryId: draft.categoryId ?? null,
      // Parcelas que já venceram entram como pagas; as futuras, previstas.
      status: date <= currentDay ? 'settled' : 'pending',
      recurringId: null,
      occurrenceDate: null,
      purchaseId: purchase.id,
      installmentNumber: i + 1,
      installmentTotal: draft.installments,
      createdAt: now,
      updatedAt: now,
    };
  });

  return { purchase, entries };
}

export interface PurchaseProgress {
  paid: number;
  total: number;
  paidAmount: number;
  remainingAmount: number;
  nextDate: string | null;
}

export function purchaseProgress(
  purchase: InstallmentPurchase,
  entries: readonly Entry[],
): PurchaseProgress {
  const own = entries
    .filter((e) => e.purchaseId === purchase.id)
    .sort((a, b) => a.date.localeCompare(b.date));

  const settled = own.filter((e) => e.status === 'settled');
  const pending = own.filter((e) => e.status === 'pending');

  return {
    paid: settled.length,
    total: own.length || purchase.installments,
    paidAmount: settled.reduce((sum, e) => sum + e.amount, 0),
    remainingAmount: pending.reduce((sum, e) => sum + e.amount, 0),
    nextDate: pending[0]?.date ?? null,
  };
}

/** "3/10" — sufixo de parcela na descrição do lançamento. */
export function installmentLabel(entry: Entry): string | null {
  if (!entry.installmentNumber || !entry.installmentTotal) return null;
  return `${entry.installmentNumber}/${entry.installmentTotal}`;
}
