/** Versão do formato salvo e validação do que volta do armazenamento. */

import type { FinanceData, RecurringRule } from '../domain/types.ts';

export const SCHEMA_VERSION = 1;

export function emptyData(): FinanceData {
  return {
    version: SCHEMA_VERSION,
    accounts: [],
    categories: [],
    entries: [],
    recurring: [],
    purchases: [],
  };
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

/**
 * Normaliza o que veio do armazenamento (ou de um arquivo importado) para o
 * formato atual. Hoje só há a versão 1; quando houver a 2, é aqui que a
 * conversão entra, e não espalhada pelos componentes.
 */
export function migrate(raw: unknown): FinanceData {
  if (!raw || typeof raw !== 'object') return emptyData();
  const input = raw as Partial<FinanceData>;

  return {
    version: SCHEMA_VERSION,
    accounts: asArray(input.accounts),
    categories: asArray(input.categories),
    entries: asArray(input.entries),
    recurring: asArray<RecurringRule>(input.recurring).map((rule) => ({
      ...rule,
      skippedDates: asArray<string>(rule?.skippedDates),
    })),
    purchases: asArray(input.purchases),
  };
}

/** Checagem mínima antes de aceitar um arquivo importado. */
export function looksLikeFinanceData(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return false;
  const input = raw as Record<string, unknown>;
  return ['accounts', 'categories', 'entries'].every((key) => Array.isArray(input[key]));
}
