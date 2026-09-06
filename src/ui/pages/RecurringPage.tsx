/** Contas que se repetem: assinaturas, aluguel, salário, mensalidades. */

import { useMemo, useState } from 'react';

import { addMonths, formatDate, today } from '../../domain/date.ts';
import { formatMoney } from '../../domain/money.ts';
import { describeFrequency, occurrenceDates } from '../../domain/recurrence.ts';
import type { RecurringRule } from '../../domain/types.ts';
import { useLookups } from '../../state/selectors.ts';
import { useFinance } from '../../state/store.tsx';
import { RecurringDialog } from '../components/EntryForms.tsx';
import { Card, Dot, EmptyState } from '../components/primitives.tsx';

function nextDate(rule: RecurringRule): string | null {
  const from = today();
  return occurrenceDates(rule, from, addMonths(from, 24))[0] ?? null;
}

/** Custo aproximado por mês, para comparar regras de frequências diferentes. */
function monthlyCost(rule: RecurringRule): number {
  const perMonth =
    rule.frequency === 'weekly' ? 52 / 12 / rule.interval : rule.frequency === 'yearly' ? 1 / 12 / rule.interval : 1 / rule.interval;
  return Math.round(rule.amount * perMonth);
}

/**
 * Consulta das contas que se repetem. Não tem botão de cadastrar: isso mora
 * num lugar só, o "+ Novo lançamento". Editar, pausar e apagar acontecem
 * clicando na linha, que abre o mesmo diálogo do cadastro.
 */
export function RecurringPage({ onNew }: { onNew: () => void }) {
  const { data } = useFinance();
  const { accountName, categoryById } = useLookups();
  const [editing, setEditing] = useState<RecurringRule | null>(null);

  const rules = useMemo(
    () => [...data.recurring].sort((a, b) => Number(b.active) - Number(a.active) || a.description.localeCompare(b.description)),
    [data.recurring],
  );

  const monthly = rules
    .filter((rule) => rule.active)
    .reduce(
      (acc, rule) => {
        const value = monthlyCost(rule);
        if (rule.kind === 'income') acc.income += value;
        else if (rule.kind === 'expense') acc.expense += value;
        return acc;
      },
      { income: 0, expense: 0 },
    );

  return (
    <>
      <div className="grid cols-3 keep">
        <div className="card stat">
          <span className="stat-label">Entradas fixas</span>
          <span className="stat-value sm num good">{formatMoney(monthly.income)}</span>
          <span className="stat-hint">Média por mês</span>
        </div>
        <div className="card stat">
          <span className="stat-label">Saídas fixas</span>
          <span className="stat-value sm num bad">{formatMoney(monthly.expense)}</span>
          <span className="stat-hint">Média por mês</span>
        </div>
        <div className="card stat">
          <span className="stat-label">Sobra fixa</span>
          <span className={`stat-value sm num ${monthly.income - monthly.expense < 0 ? 'bad' : ''}`}>
            {formatMoney(monthly.income - monthly.expense)}
          </span>
          <span className="stat-hint">Antes dos gastos variáveis</span>
        </div>
      </div>

      <Card title="Contas recorrentes" tight>
        {rules.length === 0 ? (
          <EmptyState
            emoji="🔁"
            title="Nenhuma conta recorrente"
            action={
              <button type="button" className="btn primary" onClick={onNew}>
                Criar a primeira
              </button>
            }
          >
            Cadastre aluguel, salário, assinaturas e mensalidades uma vez — os vencimentos aparecem sozinhos todo mês.
            Use o botão de novo lançamento e escolha "Recorrente".
          </EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Descrição</th>
                  <th>Repetição</th>
                  <th>Próximo</th>
                  <th className="right">Valor</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((rule) => {
                  const category = categoryById(rule.categoryId);
                  const next = nextDate(rule);
                  return (
                    <tr
                      key={rule.id}
                      className="clicavel"
                      tabIndex={0}
                      role="button"
                      aria-label={`Editar ${rule.description}`}
                      onClick={() => setEditing(rule)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setEditing(rule);
                        }
                      }}
                      style={rule.active ? undefined : { opacity: 0.55 }}
                    >
                      <td>
                        <div className="row" style={{ gap: 8 }}>
                          <Dot color={category?.color} />
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 560 }}>{rule.description}</div>
                            <div className="dim" style={{ fontSize: '0.78rem' }}>
                              {category?.name ?? 'Sem categoria'} · {accountName(rule.accountId)}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>
                        {describeFrequency(rule)}
                        {!rule.active && <span className="tag" style={{ marginLeft: 6 }}>Pausada</span>}
                        {rule.endDate && (
                          <div className="dim" style={{ fontSize: '0.76rem' }}>até {formatDate(rule.endDate)}</div>
                        )}
                        {rule.maxOccurrences && (
                          <div className="dim" style={{ fontSize: '0.76rem' }}>{rule.maxOccurrences}× no total</div>
                        )}
                      </td>
                      <td className="num">{next ? formatDate(next) : <span className="dim">Encerrada</span>}</td>
                      <td className={`right num ${rule.kind === 'income' ? 'good' : ''}`} style={{ fontWeight: 600 }}>
                        {rule.kind === 'income' ? '+' : '−'}
                        {formatMoney(rule.amount)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {editing && <RecurringDialog rule={editing} onClose={() => setEditing(null)} />}
    </>
  );
}
