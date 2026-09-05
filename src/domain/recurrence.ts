/**
 * Projeção de contas recorrentes.
 *
 * A regra é a fonte da verdade e as ocorrências futuras são calculadas na
 * hora. Uma ocorrência vira `Entry` gravada só quando o usuário confirma ou
 * edita aquele mês; até lá ela existe apenas como projeção. Isso mantém
 * "mudei o valor do aluguel" como uma edição em um lugar só, em vez de uma
 * varredura por centenas de lançamentos futuros já gravados.
 */

import { addDays, addMonths, parseISO } from './date.ts';
import type { ProjectedEntry, RecurringRule } from './types.ts';

/** Trava de segurança contra uma regra malformada gerar um laço infinito. */
const MAX_STEPS = 5000;

/** Data da n-ésima ocorrência, sempre medida a partir de `startDate`. */
export function occurrenceAt(rule: RecurringRule, index: number): string {
  const step = rule.interval * index;
  switch (rule.frequency) {
    case 'weekly':
      return addDays(rule.startDate, step * 7);
    case 'monthly':
      return addMonths(rule.startDate, step);
    case 'yearly':
      return addMonths(rule.startDate, step * 12);
  }
}

/** Salto aproximado até a janela pedida, para não iterar desde 2010. */
function firstIndexNear(rule: RecurringRule, from: string): number {
  const start = parseISO(rule.startDate);
  const target = parseISO(from);
  if (rule.frequency === 'weekly') {
    const days =
      (Date.UTC(target.year, target.month - 1, target.day) -
        Date.UTC(start.year, start.month - 1, start.day)) /
      86_400_000;
    return Math.max(0, Math.floor(days / (7 * rule.interval)) - 1);
  }
  const months = (target.year - start.year) * 12 + (target.month - start.month);
  const perStep = rule.frequency === 'yearly' ? rule.interval * 12 : rule.interval;
  return Math.max(0, Math.floor(months / perStep) - 1);
}

/**
 * Datas das ocorrências da regra dentro de `[from, to]`, já descontando as
 * que o usuário apagou individualmente.
 */
export function occurrenceDates(rule: RecurringRule, from: string, to: string): string[] {
  if (!rule.active) return [];

  const skipped = new Set(rule.skippedDates);
  const dates: string[] = [];
  const limit = rule.maxOccurrences ?? Infinity;

  let index = firstIndexNear(rule, from);
  for (let steps = 0; steps < MAX_STEPS; steps += 1, index += 1) {
    if (index >= limit) break;
    const date = occurrenceAt(rule, index);
    if (date > to) break;
    if (rule.endDate && date > rule.endDate) break;
    if (date >= from && !skipped.has(date)) dates.push(date);
  }
  return dates;
}

/**
 * Ocorrências da regra que ainda não viraram lançamento gravado, prontas
 * para a lista. `materialized` traz as `occurrenceDate` já existentes.
 */
export function projectRule(
  rule: RecurringRule,
  from: string,
  to: string,
  materialized: ReadonlySet<string>,
): ProjectedEntry[] {
  return occurrenceDates(rule, from, to)
    .filter((date) => !materialized.has(date))
    .map((date) => ({
      id: `proj:${rule.id}:${date}`,
      date,
      description: rule.description,
      amount: rule.amount,
      kind: rule.kind,
      accountId: rule.accountId,
      toAccountId: rule.toAccountId ?? null,
      categoryId: rule.categoryId ?? null,
      status: 'pending',
      recurringId: rule.id,
      occurrenceDate: date,
      purchaseId: null,
      installmentNumber: null,
      installmentTotal: null,
      projected: true,
    }));
}

/** Índice `regraId -> datas de ocorrência já materializadas`. */
export function materializedIndex(
  entries: readonly { recurringId?: string | null; occurrenceDate?: string | null }[],
): Map<string, Set<string>> {
  const index = new Map<string, Set<string>>();
  for (const entry of entries) {
    if (!entry.recurringId || !entry.occurrenceDate) continue;
    let set = index.get(entry.recurringId);
    if (!set) index.set(entry.recurringId, (set = new Set()));
    set.add(entry.occurrenceDate);
  }
  return index;
}

/** Projeções de todas as regras ativas na janela pedida. */
export function projectAll(
  rules: readonly RecurringRule[],
  entries: readonly { recurringId?: string | null; occurrenceDate?: string | null }[],
  from: string,
  to: string,
): ProjectedEntry[] {
  const index = materializedIndex(entries);
  const empty: ReadonlySet<string> = new Set();
  return rules.flatMap((rule) => projectRule(rule, from, to, index.get(rule.id) ?? empty));
}

const FREQUENCY_LABEL: Record<RecurringRule['frequency'], [string, string]> = {
  weekly: ['Toda semana', 'semanas'],
  monthly: ['Todo mês', 'meses'],
  yearly: ['Todo ano', 'anos'],
};

/** "Todo mês", "A cada 3 meses" — para o resumo da regra na lista. */
export function describeFrequency(rule: Pick<RecurringRule, 'frequency' | 'interval'>): string {
  const [single, plural] = FREQUENCY_LABEL[rule.frequency];
  return rule.interval === 1 ? single : `A cada ${rule.interval} ${plural}`;
}
