/** Lista de lançamentos agrupada por dia, com ações rápidas. */

import { Fragment } from 'react';

import { formatDate, formatDayMonth, today } from '../../domain/date.ts';
import { formatMoney, formatSigned } from '../../domain/money.ts';
import type { DisplayEntry, ProjectedEntry } from '../../domain/types.ts';
import { useLookups } from '../../state/selectors.ts';
import { useFinance } from '../../state/store.tsx';
import { Dot, EmptyState } from './primitives.tsx';

function isProjection(entry: DisplayEntry): entry is ProjectedEntry {
  return 'projected' in entry && entry.projected === true;
}

function amountText(entry: DisplayEntry): string {
  if (entry.kind === 'transfer') return formatMoney(entry.amount);
  return `${entry.kind === 'income' ? '+' : '−'}${formatMoney(entry.amount)}`;
}

function amountClass(entry: DisplayEntry): string {
  if (entry.kind === 'transfer') return 'muted';
  return entry.kind === 'income' ? 'good' : '';
}

export function EntryRow({
  entry,
  onOpen,
  showDate = true,
}: {
  entry: DisplayEntry;
  onOpen: (entry: DisplayEntry) => void;
  showDate?: boolean;
}) {
  const { api } = useFinance();
  const { accountName, categoryById } = useLookups();
  const category = categoryById(entry.categoryId);
  const pending = entry.status === 'pending';
  const overdue = pending && entry.date < today();

  /** Confirmar um previsto: a projeção vira lançamento, o real muda de estado. */
  function settle() {
    if (isProjection(entry)) api.materialize(entry, { status: 'settled' });
    else api.updateEntry(entry.id, { status: 'settled' });
  }

  return (
    <div
      className={showDate ? 'entry' : 'entry no-date'}
      role="button"
      tabIndex={0}
      onClick={() => onOpen(entry)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen(entry);
        }
      }}
    >
      {showDate && <span className="entry-date num">{formatDayMonth(entry.date)}</span>}

      <span className="entry-main">
        <span className="entry-title">
          <Dot color={category?.color} />
          <span className="text">{entry.description}</span>
          {entry.installmentNumber && (
            <span className="tag installment">
              {entry.installmentNumber}/{entry.installmentTotal}
            </span>
          )}
          {entry.recurringId && <span className="tag recurring">🔁</span>}
        </span>
        <span className="entry-meta">
          <span>{category?.name ?? 'Sem categoria'}</span>
          <span aria-hidden="true">·</span>
          <span>
            {accountName(entry.accountId)}
            {entry.kind === 'transfer' && ` → ${accountName(entry.toAccountId)}`}
          </span>
          {pending && (
            <span className={overdue ? 'tag pending bad' : 'tag pending'}>
              {overdue ? 'Atrasado' : 'Previsto'}
            </span>
          )}
        </span>
      </span>

      <span className={`entry-amount num ${amountClass(entry)}${isProjection(entry) ? ' projected' : ''}`}>
        {amountText(entry)}
      </span>

      <span className="entry-actions">
        {pending && (
          <button
            type="button"
            className="btn ghost icon"
            title="Marcar como efetivado"
            aria-label={`Marcar ${entry.description} como efetivado`}
            onClick={(event) => {
              event.stopPropagation();
              settle();
            }}
          >
            ✓
          </button>
        )}
      </span>
    </div>
  );
}

export function EntryList({
  entries,
  onOpen,
  groupByDay = true,
  emptyAction,
}: {
  entries: DisplayEntry[];
  onOpen: (entry: DisplayEntry) => void;
  groupByDay?: boolean;
  emptyAction?: React.ReactNode;
}) {
  if (entries.length === 0) {
    return (
      <EmptyState emoji="🗒️" title="Nenhum lançamento aqui" action={emptyAction}>
        Registre uma saída, uma entrada ou cadastre uma conta que se repete todo mês.
      </EmptyState>
    );
  }

  if (!groupByDay) {
    return (
      <div className="entries">
        {entries.map((entry) => (
          <EntryRow key={entry.id} entry={entry} onOpen={onOpen} />
        ))}
      </div>
    );
  }

  const days = new Map<string, DisplayEntry[]>();
  for (const entry of entries) {
    const list = days.get(entry.date);
    if (list) list.push(entry);
    else days.set(entry.date, [entry]);
  }

  return (
    <div className="entries">
      {[...days.entries()].map(([date, list]) => {
        const net = list.reduce(
          (sum, entry) =>
            entry.kind === 'income' ? sum + entry.amount : entry.kind === 'expense' ? sum - entry.amount : sum,
          0,
        );
        return (
          <Fragment key={date}>
            <div className="day-heading">
              <span>{formatDate(date)}</span>
              <span className={`total num ${net < 0 ? '' : 'good'}`}>{formatSigned(net)}</span>
            </div>
            {list.map((entry) => (
              <EntryRow key={entry.id} entry={entry} onOpen={onOpen} showDate={false} />
            ))}
          </Fragment>
        );
      })}
    </div>
  );
}
