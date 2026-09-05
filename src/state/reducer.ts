/**
 * Reducer puro: todas as regras de "o que acontece com o resto quando isto
 * muda" vivem aqui, e não espalhadas pelos formulários. Ids e horários vêm
 * prontos nas ações, o que mantém a função determinística e testável.
 */

import type {
  Account,
  Category,
  Entry,
  FinanceData,
  InstallmentPurchase,
  RecurringRule,
  TableName,
  Tombstone,
} from '../domain/types.ts';

export type Action =
  | { type: 'data/replace'; data: FinanceData }
  | { type: 'entry/create'; entry: Entry }
  | { type: 'entry/update'; id: string; patch: Partial<Entry>; updatedAt: string }
  | { type: 'entry/delete'; id: string; deletedAt: string }
  | { type: 'occurrence/skip'; recurringId: string; date: string; updatedAt: string }
  | { type: 'recurring/create'; rule: RecurringRule }
  | { type: 'recurring/update'; id: string; patch: Partial<RecurringRule>; updatedAt: string }
  | { type: 'recurring/delete'; id: string; deletedAt: string }
  | { type: 'purchase/create'; purchase: InstallmentPurchase; entries: Entry[] }
  | { type: 'purchase/delete'; id: string; deletedAt: string }
  | { type: 'account/create'; account: Account }
  | { type: 'account/update'; id: string; patch: Partial<Account>; updatedAt: string }
  | { type: 'account/delete'; id: string; deletedAt: string }
  | { type: 'category/create'; category: Category }
  | { type: 'category/update'; id: string; patch: Partial<Category>; updatedAt: string }
  | { type: 'category/delete'; id: string; deletedAt: string };

/**
 * Registra a exclusão para que os outros aparelhos fiquem sabendo.
 * Sem esse rastro, a próxima sincronização traria o registro de volta.
 */
function withTombstones(
  state: FinanceData,
  deletedAt: string,
  ...targets: [TableName, string][]
): Tombstone[] {
  const novos = targets
    .filter(([table, id]) => !state.tombstones.some((t) => t.table === table && t.id === id))
    .map(([table, id]) => ({ table, id, deletedAt }));
  return novos.length ? [...state.tombstones, ...novos] : state.tombstones;
}

/** Marca a ocorrência como pulada para que a projeção não a ressuscite. */
function skipOccurrence(
  rules: readonly RecurringRule[],
  recurringId: string,
  date: string,
  updatedAt: string,
): RecurringRule[] {
  return rules.map((rule) =>
    rule.id === recurringId && !rule.skippedDates.includes(date)
      ? { ...rule, skippedDates: [...rule.skippedDates, date], updatedAt }
      : rule,
  );
}

/** Uma conta só pode sumir de vez se nada mais apontar para ela. */
export function accountInUse(data: FinanceData, id: string): boolean {
  return (
    data.entries.some((e) => e.accountId === id || e.toAccountId === id) ||
    data.recurring.some((r) => r.accountId === id || r.toAccountId === id) ||
    data.purchases.some((p) => p.accountId === id)
  );
}

export function reducer(state: FinanceData, action: Action): FinanceData {
  switch (action.type) {
    case 'data/replace':
      return action.data;

    case 'entry/create':
      return { ...state, entries: [...state.entries, action.entry] };

    case 'entry/update':
      return {
        ...state,
        entries: state.entries.map((entry) =>
          entry.id === action.id ? { ...entry, ...action.patch, updatedAt: action.updatedAt } : entry,
        ),
      };

    case 'entry/delete': {
      const target = state.entries.find((entry) => entry.id === action.id);
      const entries = state.entries.filter((entry) => entry.id !== action.id);
      // Apagar a ocorrência de uma recorrente só "gruda" se a regra também
      // souber que aquele mês foi dispensado.
      const recurring =
        target?.recurringId && target.occurrenceDate
          ? skipOccurrence(state.recurring, target.recurringId, target.occurrenceDate, action.deletedAt)
          : state.recurring;
      return {
        ...state,
        entries,
        recurring,
        tombstones: withTombstones(state, action.deletedAt, ['entries', action.id]),
      };
    }

    case 'occurrence/skip':
      return {
        ...state,
        recurring: skipOccurrence(state.recurring, action.recurringId, action.date, action.updatedAt),
      };

    case 'recurring/create':
      return { ...state, recurring: [...state.recurring, action.rule] };

    case 'recurring/update':
      return {
        ...state,
        recurring: state.recurring.map((rule) =>
          rule.id === action.id ? { ...rule, ...action.patch, updatedAt: action.updatedAt } : rule,
        ),
      };

    case 'recurring/delete':
      return {
        ...state,
        recurring: state.recurring.filter((rule) => rule.id !== action.id),
        // O que já aconteceu é histórico e fica; só perde o vínculo com a
        // regra que deixou de existir. O `updatedAt` novo faz a alteração
        // viajar para os outros aparelhos junto com a exclusão.
        entries: state.entries.map((entry) =>
          entry.recurringId === action.id
            ? { ...entry, recurringId: null, occurrenceDate: null, updatedAt: action.deletedAt }
            : entry,
        ),
        tombstones: withTombstones(state, action.deletedAt, ['recurring', action.id]),
      };

    case 'purchase/create':
      return {
        ...state,
        purchases: [...state.purchases, action.purchase],
        entries: [...state.entries, ...action.entries],
      };

    case 'purchase/delete': {
      // Cada parcela apagada precisa do próprio rastro: para o outro
      // aparelho, sumir a compra e sumir as parcelas são fatos distintos.
      const parcelas = state.entries.filter((entry) => entry.purchaseId === action.id);
      return {
        ...state,
        purchases: state.purchases.filter((purchase) => purchase.id !== action.id),
        entries: state.entries.filter((entry) => entry.purchaseId !== action.id),
        tombstones: withTombstones(
          state,
          action.deletedAt,
          ['purchases', action.id],
          ...parcelas.map((entry) => ['entries', entry.id] as [TableName, string]),
        ),
      };
    }

    case 'account/create':
      return { ...state, accounts: [...state.accounts, action.account] };

    case 'account/update':
      return {
        ...state,
        accounts: state.accounts.map((account) =>
          account.id === action.id ? { ...account, ...action.patch, updatedAt: action.updatedAt } : account,
        ),
      };

    case 'account/delete':
      // Com movimento na conta, apagar apagaria histórico junto: arquiva.
      return accountInUse(state, action.id)
        ? reducer(state, {
            type: 'account/update',
            id: action.id,
            patch: { archived: true },
            updatedAt: action.deletedAt,
          })
        : {
            ...state,
            accounts: state.accounts.filter((account) => account.id !== action.id),
            tombstones: withTombstones(state, action.deletedAt, ['accounts', action.id]),
          };

    case 'category/create':
      return { ...state, categories: [...state.categories, action.category] };

    case 'category/update':
      return {
        ...state,
        categories: state.categories.map((category) =>
          category.id === action.id ? { ...category, ...action.patch, updatedAt: action.updatedAt } : category,
        ),
      };

    case 'category/delete':
      return {
        ...state,
        categories: state.categories.filter((category) => category.id !== action.id),
        entries: state.entries.map((entry) =>
          entry.categoryId === action.id
            ? { ...entry, categoryId: null, updatedAt: action.deletedAt }
            : entry,
        ),
        recurring: state.recurring.map((rule) =>
          rule.categoryId === action.id
            ? { ...rule, categoryId: null, updatedAt: action.deletedAt }
            : rule,
        ),
        tombstones: withTombstones(state, action.deletedAt, ['categories', action.id]),
      };
  }
}
