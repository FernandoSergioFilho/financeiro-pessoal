/** Painel do mês: onde o dinheiro está, para onde foi e o que ainda vem. */

import { useMemo } from 'react';

import { addMonthsToKey, formatDate, monthEnd, today } from '../../domain/date.ts';
import { formatMoney } from '../../domain/money.ts';
import {
  accountBalance,
  monthlySeries,
  netWorth,
  periodTotals,
  totalsByCategory,
} from '../../domain/summary.ts';
import type { DisplayEntry } from '../../domain/types.ts';
import { entriesInRange, useLookups, useMonthEntries, useOverdue } from '../../state/selectors.ts';
import { useFinance } from '../../state/store.tsx';
import { CategoryBars, MonthlyBars } from '../components/charts.tsx';
import { EntryList } from '../components/EntryList.tsx';
import { Card, Dot, EmptyState } from '../components/primitives.tsx';

const SERIES_MONTHS = 6;

export function Dashboard({
  month,
  onOpenEntry,
  onNew,
  onNavigate,
}: {
  month: string;
  onOpenEntry: (entry: DisplayEntry) => void;
  onNew: () => void;
  onNavigate: (page: string) => void;
}) {
  const { data, cloud } = useFinance();
  const { accounts, categories } = useLookups();
  const monthEntries = useMonthEntries(month);
  const overdue = useOverdue();

  const totals = useMemo(() => periodTotals(monthEntries), [monthEntries]);
  const byCategory = useMemo(
    () => totalsByCategory(monthEntries, categories, 'expense'),
    [monthEntries, categories],
  );

  // O saldo de hoje conta só o que já aconteceu; a projeção soma o que ainda
  // está previsto até o fim do mês — a diferença é o que dá ou não para gastar.
  const balanceNow = useMemo(
    () => netWorth(accounts, data.entries, { onlySettled: true, upTo: today() }),
    [accounts, data.entries],
  );
  const projected = useMemo(() => {
    const end = monthEnd(month);
    const upToEnd = entriesInRange(data, '0000-01-01', end);
    return netWorth(accounts, upToEnd, { upTo: end });
  }, [accounts, data, month]);

  const series = useMemo(() => {
    const months = Array.from({ length: SERIES_MONTHS }, (_, i) => addMonthsToKey(month, i - (SERIES_MONTHS - 1)));
    const range = entriesInRange(data, `${months[0]}-01`, monthEnd(months.at(-1)!));
    return monthlySeries(range, months);
  }, [data, month]);

  const recent = useMemo(() => [...monthEntries].reverse().slice(0, 8), [monthEntries]);

  if (data.entries.length === 0 && data.recurring.length === 0) {
    // Sem o ramo "entre para sincronizar" que existia aqui: com o portão de
    // login, ninguém deslogado chega a esta tela na versão publicada.
    const ondeFicaSalvo = cloud.enabled
      ? 'Tudo fica salvo neste aparelho e sincronizado com os seus outros.'
      : 'Tudo fica salvo só neste navegador.';

    return (
      <Card>
        <EmptyState
          emoji="👋"
          title="Vamos começar"
          action={
            <button type="button" className="btn primary" onClick={onNew}>
              Criar o primeiro lançamento
            </button>
          }
        >
          Registre entradas e saídas, cadastre as contas que se repetem todo mês e as compras parceladas.{' '}
          {ondeFicaSalvo}
        </EmptyState>
      </Card>
    );
  }

  return (
    <>
      {overdue.length > 0 && (
        <div className="banner warn">
          <span className="emoji" aria-hidden="true">
            ⏰
          </span>
          <span>
            <strong>
              {overdue.length === 1
                ? '1 conta venceu e continua como prevista'
                : `${overdue.length} contas venceram e continuam como previstas`}
            </strong>
            <br />
            <span className="dim">
              A mais antiga é {overdue[0]!.description}, de {formatDate(overdue[0]!.date)}. Confirme no ✓ da lista se já pagou.
            </span>
          </span>
        </div>
      )}

      <div className="grid cols-4 keep">
        <div className="card stat">
          <span className="stat-label">Saldo hoje</span>
          <span className={`stat-value num ${balanceNow < 0 ? 'bad' : ''}`}>{formatMoney(balanceNow)}</span>
          <span className="stat-hint">Somando o que já entrou e saiu</span>
        </div>
        <div className="card stat">
          <span className="stat-label">Entradas do mês</span>
          <span className="stat-value num good">{formatMoney(totals.income)}</span>
          <span className="stat-hint">
            {totals.pendingIncome > 0 ? `${formatMoney(totals.pendingIncome)} ainda previstos` : 'Tudo confirmado'}
          </span>
        </div>
        <div className="card stat">
          <span className="stat-label">Saídas do mês</span>
          <span className="stat-value num bad">{formatMoney(totals.expense)}</span>
          <span className="stat-hint">
            {totals.pendingExpense > 0 ? `${formatMoney(totals.pendingExpense)} a pagar` : 'Tudo confirmado'}
          </span>
        </div>
        <div className="card stat">
          <span className="stat-label">Sobra do mês</span>
          <span className={`stat-value num ${totals.net < 0 ? 'bad' : 'good'}`}>{formatMoney(totals.net)}</span>
          <span className="stat-hint">Saldo projetado: {formatMoney(projected)}</span>
        </div>
      </div>

      <div className="grid split">
        <Card
          title="Últimos lançamentos"
          action={
            <button type="button" className="btn sm ghost" onClick={() => onNavigate('lancamentos')}>
              Ver todos
            </button>
          }
          tight
        >
          <EntryList entries={recent} onOpen={onOpenEntry} groupByDay={false} />
        </Card>

        <div className="grid" style={{ alignContent: 'start' }}>
          <Card title="Gastos por categoria">
            {byCategory.length > 0 ? (
              <CategoryBars data={byCategory} />
            ) : (
              <p className="dim" style={{ fontSize: '0.86rem' }}>
                Nenhuma saída registrada neste mês.
              </p>
            )}
          </Card>

          <Card title="Entradas e saídas por mês">
            <MonthlyBars data={series} currentKey={month} />
          </Card>
        </div>
      </div>

      <Card title="Saldo por conta">
        <div className="grid cols-3">
          {accounts
            .filter((account) => !account.archived)
            .map((account) => {
              const balance = accountBalance(account, data.entries, { onlySettled: true });
              const withPending = accountBalance(account, entriesInRange(data, '0000-01-01', monthEnd(month)), {
                upTo: monthEnd(month),
              });
              return (
                <div key={account.id} className="row" style={{ alignItems: 'flex-start', gap: 10 }}>
                  <Dot color={account.color} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 560 }}>{account.name}</div>
                    <div className={`num ${balance < 0 ? 'bad' : ''}`} style={{ fontSize: '1.05rem', fontWeight: 620 }}>
                      {formatMoney(balance)}
                    </div>
                    {withPending !== balance && (
                      <div className="dim" style={{ fontSize: '0.76rem' }}>
                        {formatMoney(withPending)} com os previstos
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
        </div>
      </Card>
    </>
  );
}
