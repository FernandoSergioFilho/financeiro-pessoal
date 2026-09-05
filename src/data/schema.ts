/** Versão do formato salvo e validação do que volta do armazenamento. */

import type { Account, Category, FinanceData, RecurringRule, Tombstone } from '../domain/types.ts';

/** 2 acrescentou `updatedAt` em contas e categorias, e a lista de exclusões. */
export const SCHEMA_VERSION = 2;

/** Carimbo para registros anteriores à sincronização, que não tinham data. */
const EPOCH = '1970-01-01T00:00:00.000Z';

export function emptyData(): FinanceData {
  return {
    version: SCHEMA_VERSION,
    accounts: [],
    categories: [],
    entries: [],
    recurring: [],
    purchases: [],
    tombstones: [],
  };
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

/**
 * Normaliza o que veio do armazenamento (ou de um arquivo importado) para o
 * formato atual — o lugar único onde a conversão entre versões acontece,
 * em vez de espalhada pelos componentes.
 *
 * Contas e categorias salvas na versão 1 não tinham `updatedAt`. Elas entram
 * com a data mais antiga possível de propósito: assim, na primeira
 * sincronização, qualquer versão vinda de outro aparelho é considerada mais
 * nova, e nada que já foi editado por lá é sobrescrito por um dado velho.
 */
export function migrate(raw: unknown): FinanceData {
  if (!raw || typeof raw !== 'object') return emptyData();
  const input = raw as Partial<FinanceData>;

  return {
    version: SCHEMA_VERSION,
    accounts: asArray<Account>(input.accounts).map((account) => ({
      ...account,
      updatedAt: account?.updatedAt ?? EPOCH,
    })),
    categories: asArray<Category>(input.categories).map((category) => ({
      ...category,
      updatedAt: category?.updatedAt ?? EPOCH,
    })),
    entries: asArray(input.entries),
    recurring: asArray<RecurringRule>(input.recurring).map((rule) => ({
      ...rule,
      skippedDates: asArray<string>(rule?.skippedDates),
    })),
    purchases: asArray(input.purchases),
    tombstones: asArray<Tombstone>(input.tombstones),
  };
}

/** Checagem mínima antes de aceitar um arquivo importado. */
export function looksLikeFinanceData(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return false;
  const input = raw as Record<string, unknown>;
  return ['accounts', 'categories', 'entries'].every((key) => Array.isArray(input[key]));
}
