/**
 * Gráficos do painel.
 *
 * Duas formas, escolhidas pelo trabalho que fazem: barras horizontais com
 * rótulo direto para comparar magnitude entre categorias, e barras
 * divergentes (entrada acima do eixo, saída abaixo) para a evolução mensal,
 * onde a posição já codifica a polaridade e a cor apenas reforça — o que
 * mantém o gráfico legível para quem não distingue verde de vermelho.
 */

import { useState } from 'react';

import { formatCompact, formatMoney } from '../../domain/money.ts';
import type { CategoryTotal, MonthPoint } from '../../domain/summary.ts';
import { formatMonthKey } from '../../domain/date.ts';
import { colorVar } from './primitives.tsx';

export function CategoryBars({ data, limit = 7 }: { data: CategoryTotal[]; limit?: number }) {
  if (data.length === 0) return null;

  // Além do limite as fatias viram uma linha "Outras": mais barras não
  // acrescentam informação, só ruído no fim da lista.
  const head = data.slice(0, limit);
  const tail = data.slice(limit);
  const rows = tail.length
    ? [...head, { category: null, amount: tail.reduce((s, t) => s + t.amount, 0), share: tail.reduce((s, t) => s + t.share, 0) }]
    : head;

  const max = Math.max(...rows.map((row) => row.amount), 1);

  return (
    <div className="bars">
      {rows.map((row, index) => {
        const name = row.category?.name ?? (index >= limit ? 'Outras' : 'Sem categoria');
        return (
          <div className="bar-row" key={row.category?.id ?? `rest-${index}`}>
            <span className="bar-label">
              <span aria-hidden="true">{row.category?.emoji ?? '•'}</span>
              <span className="text">{name}</span>
              <span className="bar-share num">{Math.round(row.share * 100)}%</span>
            </span>
            <span className="bar-value num">{formatMoney(row.amount)}</span>
            <span className="bar-track">
              <span
                className="bar-fill"
                style={{
                  width: `${Math.max((row.amount / max) * 100, 1.5)}%`,
                  background: row.category ? colorVar(row.category.color) : 'var(--text-3)',
                }}
                title={`${name}: ${formatMoney(row.amount)}`}
              />
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function MonthlyBars({ data, currentKey }: { data: MonthPoint[]; currentKey: string }) {
  const [focus, setFocus] = useState<string | null>(null);
  const max = Math.max(...data.flatMap((point) => [point.income, point.expense]), 1);
  const active = data.find((point) => point.key === focus) ?? data.find((point) => point.key === currentKey);

  return (
    <div className="chart">
      <div className="row" style={{ minHeight: 22 }}>
        <div className="legend">
          <span className="legend-item">
            <span className="dot" style={{ background: 'var(--good)' }} aria-hidden="true" /> Entradas
          </span>
          <span className="legend-item">
            <span className="dot" style={{ background: 'var(--bad)' }} aria-hidden="true" /> Saídas
          </span>
        </div>
        <span className="spacer" />
        {active && (
          <span className="dim num" style={{ fontSize: '0.78rem' }}>
            {formatMonthKey(active.key)}: <span className="good">{formatCompact(active.income)}</span> ·{' '}
            <span className="bad">{formatCompact(active.expense)}</span>
          </span>
        )}
      </div>

      <div className="months" onMouseLeave={() => setFocus(null)}>
        {data.map((point) => (
          <div
            key={point.key}
            className={point.key === currentKey ? 'month-col current' : 'month-col'}
            onMouseEnter={() => setFocus(point.key)}
            onFocus={() => setFocus(point.key)}
            tabIndex={0}
            title={`${formatMonthKey(point.key)} — entradas ${formatMoney(point.income)}, saídas ${formatMoney(point.expense)}`}
          >
            <div className="month-bars">
              <div className="month-half">
                <div className="month-bar in" style={{ height: `${(point.income / max) * 100}%` }} />
              </div>
              <div className="month-axis" />
              <div className="month-half out">
                <div className="month-bar out" style={{ height: `${(point.expense / max) * 100}%` }} />
              </div>
            </div>
            <span className="month-label">{point.key.slice(5)}/{point.key.slice(2, 4)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
