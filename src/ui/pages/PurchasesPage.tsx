/** Compras parceladas e o quanto delas ainda pesa nos próximos meses. */

import { useMemo, useState } from 'react';

import { addMonthsToKey, currentMonthKey, formatDate, formatMonthKey, monthKey } from '../../domain/date.ts';
import { formatMoney } from '../../domain/money.ts';
import { purchaseProgress } from '../../domain/installments.ts';
import type { InstallmentPurchase } from '../../domain/types.ts';
import { useLookups } from '../../state/selectors.ts';
import { useFinance } from '../../state/store.tsx';
import { Card, ConfirmDialog, Dot, EmptyState } from '../components/primitives.tsx';

const HORIZON = 6;

export function PurchasesPage({ onNew }: { onNew: () => void }) {
  const { data, api } = useFinance();
  const { accountName, categoryById } = useLookups();
  const [removing, setRemoving] = useState<InstallmentPurchase | null>(null);

  const rows = useMemo(
    () =>
      data.purchases
        .map((purchase) => ({ purchase, progress: purchaseProgress(purchase, data.entries) }))
        .sort((a, b) => Number(Boolean(b.progress.nextDate)) - Number(Boolean(a.progress.nextDate))
          || (a.progress.nextDate ?? '').localeCompare(b.progress.nextDate ?? '')),
    [data.purchases, data.entries],
  );

  /** Quanto de parcela cai em cada um dos próximos meses. */
  const upcoming = useMemo(() => {
    const start = currentMonthKey();
    const months = Array.from({ length: HORIZON }, (_, i) => addMonthsToKey(start, i));
    const totals = new Map(months.map((key) => [key, 0]));
    for (const entry of data.entries) {
      if (!entry.purchaseId) continue;
      const key = monthKey(entry.date);
      if (totals.has(key)) totals.set(key, totals.get(key)! + entry.amount);
    }
    return months.map((key) => ({ key, amount: totals.get(key)! }));
  }, [data.entries]);

  const remaining = rows.reduce((sum, row) => sum + row.progress.remainingAmount, 0);
  const maxUpcoming = Math.max(...upcoming.map((item) => item.amount), 1);

  return (
    <>
      <div className="grid split">
        <div className="card stat" style={{ alignSelf: 'start' }}>
          <span className="stat-label">Ainda a pagar</span>
          <span className="stat-value num">{formatMoney(remaining)}</span>
          <span className="stat-hint">
            Somando as parcelas futuras de {rows.filter((row) => row.progress.nextDate).length}{' '}
            {rows.filter((row) => row.progress.nextDate).length === 1 ? 'compra' : 'compras'} em aberto
          </span>
        </div>

        <Card title="Parcelas nos próximos meses">
          <div className="bars">
            {upcoming.map((item) => (
              <div className="bar-row" key={item.key}>
                <span className="bar-label">
                  <span className="text">{formatMonthKey(item.key)}</span>
                </span>
                <span className="bar-value num">{formatMoney(item.amount)}</span>
                <span className="bar-track">
                  <span
                    className="bar-fill"
                    style={{ width: `${Math.max((item.amount / maxUpcoming) * 100, 1)}%`, background: 'var(--series-orange)' }}
                  />
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card
        title="Compras parceladas"
        action={
          <button type="button" className="btn primary sm" onClick={onNew}>
            Nova compra
          </button>
        }
        tight
      >
        {rows.length === 0 ? (
          <EmptyState
            emoji="🧾"
            title="Nenhuma compra parcelada"
            action={
              <button type="button" className="btn primary" onClick={onNew}>
                Cadastrar compra parcelada
              </button>
            }
          >
            Informe o valor total e o número de parcelas: cada parcela vira um lançamento nos meses seguintes,
            somando exatamente o total.
          </EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Compra</th>
                  <th>Andamento</th>
                  <th>Próxima</th>
                  <th className="right">Falta</th>
                  <th className="right">Total</th>
                  <th className="right" />
                </tr>
              </thead>
              <tbody>
                {rows.map(({ purchase, progress }) => {
                  const category = categoryById(purchase.categoryId);
                  const done = progress.total > 0 ? progress.paid / progress.total : 0;
                  return (
                    <tr key={purchase.id} style={progress.nextDate ? undefined : { opacity: 0.6 }}>
                      <td>
                        <div className="row" style={{ gap: 8 }}>
                          <Dot color={category?.color} />
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 560 }}>{purchase.description}</div>
                            <div className="dim" style={{ fontSize: '0.78rem' }}>
                              {accountName(purchase.accountId)} · {purchase.installments}×{' '}
                              {formatMoney(Math.round(purchase.totalAmount / purchase.installments))}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td style={{ minWidth: 130 }}>
                        <div className="progress" title={`${progress.paid} de ${progress.total} parcelas pagas`}>
                          <span style={{ width: `${done * 100}%` }} />
                        </div>
                        <div className="dim num" style={{ fontSize: '0.76rem', marginTop: 4 }}>
                          {progress.paid}/{progress.total} pagas
                        </div>
                      </td>
                      <td className="num">
                        {progress.nextDate ? formatDate(progress.nextDate) : <span className="dim">Quitada</span>}
                      </td>
                      <td className="right num" style={{ fontWeight: 600 }}>
                        {formatMoney(progress.remainingAmount)}
                      </td>
                      <td className="right num muted">{formatMoney(purchase.totalAmount)}</td>
                      <td className="right">
                        <button type="button" className="btn ghost sm" onClick={() => setRemoving(purchase)}>
                          Apagar
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {removing && (
        <ConfirmDialog
          title="Apagar compra parcelada"
          message={`Todas as parcelas de "${removing.description}" saem dos lançamentos, inclusive as já pagas.`}
          onConfirm={() => {
            api.deletePurchase(removing.id);
            setRemoving(null);
          }}
          onCancel={() => setRemoving(null)}
        />
      )}
    </>
  );
}
