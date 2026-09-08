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
import type { CategoryChange, CategoryTotal, DayPoint, MonthPoint } from '../../domain/summary.ts';
import { formatDayMonth, formatMonthKey } from '../../domain/date.ts';
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

/* --------------------------------------------- saldo ao longo do mês */

/**
 * A linha do saldo, dia a dia, até o fim do mês.
 *
 * Uma linha só, então não há legenda: o título nomeia a série. O que precisa
 * ser distinguido é o trecho já acontecido do que ainda é previsão — e isso vai
 * por traço (contínuo × tracejado) mais rótulo direto, não por cor. Assim
 * continua legível impresso, em preto e branco e para quem não distingue cores.
 */
export function SaldoDoMes({ data }: { data: DayPoint[] }) {
  const [ativo, setAtivo] = useState<number | null>(null);
  if (data.length < 2) return null;

  const A = 150;
  const PAD = { top: 12, right: 10, bottom: 20, left: 10 };

  const valores = data.map((p) => p.balance);
  const max = Math.max(...valores, 0);
  const min = Math.min(...valores, 0);
  const amplitude = max - min || 1;

  const x = (i: number) => PAD.left + (i / (data.length - 1)) * (100 - PAD.left - PAD.right);
  const y = (v: number) => PAD.top + (1 - (v - min) / amplitude) * (A - PAD.top - PAD.bottom);

  const caminho = (pontos: DayPoint[], desde: number) =>
    pontos.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(desde + i).toFixed(2)} ${y(p.balance).toFixed(2)}`).join(' ');

  const corteVirada = data.findIndex((p) => p.projected);
  const realizado = corteVirada === -1 ? data : data.slice(0, corteVirada);
  // A previsão começa no último ponto realizado, senão a linha aparece cortada.
  const previsto = corteVirada === -1 ? [] : data.slice(Math.max(corteVirada - 1, 0));
  const inicioPrevisto = Math.max(corteVirada - 1, 0);

  const zero = min < 0 && max > 0 ? y(0) : null;
  const fim = data.at(-1)!;
  const p = ativo === null ? null : data[ativo];

  return (
    <div className="chart">
      <div className="linha-saldo">
        <svg viewBox={`0 0 100 ${A}`} preserveAspectRatio="none" role="img"
          aria-label={`Saldo dia a dia, terminando o mês em ${formatMoney(fim.balance)}`}>
          {zero !== null && (
            <line x1={PAD.left} x2={100 - PAD.right} y1={zero} y2={zero}
              stroke="var(--border-strong)" strokeWidth="0.4" strokeDasharray="1.5 1.5" vectorEffect="non-scaling-stroke" />
          )}
          {realizado.length > 1 && (
            <path d={caminho(realizado, 0)} fill="none" stroke="var(--accent)" strokeWidth="2"
              strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          )}
          {previsto.length > 1 && (
            <path d={caminho(previsto, inicioPrevisto)} fill="none" stroke="var(--accent)" strokeWidth="2"
              strokeDasharray="4 3" opacity="0.65" strokeLinejoin="round" strokeLinecap="round"
              vectorEffect="non-scaling-stroke" />
          )}
          {p && (
            <>
              <line x1={x(ativo!)} x2={x(ativo!)} y1={PAD.top} y2={A - PAD.bottom}
                stroke="var(--border-strong)" strokeWidth="0.4" vectorEffect="non-scaling-stroke" />
              <circle cx={x(ativo!)} cy={y(p.balance)} r="3.5" fill="var(--accent)"
                stroke="var(--surface)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
            </>
          )}
          {/* Faixas invisíveis: o alvo do toque é bem maior que a linha. */}
          {data.map((_, i) => (
            <rect key={i} x={x(i) - 1.5} y={0} width={3} height={A} fill="transparent"
              onMouseEnter={() => setAtivo(i)} onMouseLeave={() => setAtivo(null)}
              onTouchStart={() => setAtivo(i)} />
          ))}
        </svg>

        {p && (
          <div className="linha-saldo-dica" style={{ left: `${x(ativo!)}%` }}>
            <strong className="num">{formatMoney(p.balance)}</strong>
            <span className="dim">
              {formatDayMonth(p.date)}
              {p.projected ? ' · previsto' : ''}
            </span>
          </div>
        )}
      </div>

      {/* Rótulo direto no lugar de legenda: uma série só, dois trechos. */}
      <div className="row wrap" style={{ gap: 14, fontSize: '0.76rem' }}>
        <span className="legend-item">
          <span className="traco-cheio" aria-hidden="true" /> Já aconteceu
        </span>
        <span className="legend-item">
          <span className="traco-pontilhado" aria-hidden="true" /> Previsto
        </span>
        <span className="spacer" />
        <span className={fim.balance < 0 ? 'bad' : 'muted'}>
          Fecha em <strong className="num">{formatMoney(fim.balance)}</strong>
        </span>
      </div>
    </div>
  );
}

/* ------------------------------- o que mudou em relação ao mês anterior */

/**
 * Barras divergentes: gastou mais para a direita, menos para a esquerda.
 *
 * A cor não é verde/vermelho de propósito. O validador de paleta reprovou esse
 * par para daltonismo (ΔE 5.7 no tema escuro, abaixo do piso); azul e laranja
 * passam com folga nos dois temas. E, de qualquer forma, quem carrega o sentido
 * aqui é o lado do eixo, não a cor.
 */
export function ComparativoCategorias({ data, limit = 6 }: { data: CategoryChange[]; limit?: number }) {
  if (data.length === 0) return null;

  const linhas = data.slice(0, limit);
  const maior = Math.max(...linhas.map((l) => Math.abs(l.diff)), 1);

  return (
    <div className="comparativo">
      {linhas.map((linha) => {
        const largura = (Math.abs(linha.diff) / maior) * 50;
        const subiu = linha.diff > 0;
        return (
          <div className="comparativo-linha" key={linha.category?.id ?? 'sem'}>
            <span className="bar-label">
              <span className="text">{linha.category?.name ?? 'Sem categoria'}</span>
            </span>
            <span className="comparativo-eixo">
              <span
                className="comparativo-barra"
                style={{
                  width: `${largura}%`,
                  [subiu ? 'left' : 'right']: '50%',
                  background: subiu ? 'var(--series-orange)' : 'var(--series-blue)',
                }}
              />
            </span>
            {/* O número usa cor de texto, não a da barra: a cor identifica a
                marca, e repeti-la no texto só reduz o contraste da leitura. O
                sinal e o lado do eixo já dizem se subiu ou caiu. */}
            <span className="comparativo-valor num muted">
              {subiu ? '+' : '−'}
              {formatMoney(Math.abs(linha.diff))}
            </span>
          </div>
        );
      })}
      <p className="hint">
        Comparado ao mês anterior. À direita, em laranja, o que subiu; à esquerda, em azul, o que caiu.
      </p>
    </div>
  );
}
