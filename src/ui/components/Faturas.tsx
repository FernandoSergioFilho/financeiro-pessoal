/**
 * As faturas abertas dos cartões.
 *
 * Com quatro cartões, "saldo do cartão" não responde nada. O que decide é
 * quanto está na fatura que fecha agora e quando ela vence — e isso é uma
 * linha por cartão, não um gráfico: são poucos itens, cada um com nome e duas
 * datas, e a comparação entre eles não é o ponto.
 */

import { formatDate } from '../../domain/date.ts';
import type { Fatura } from '../../domain/faturas.ts';
import { formatMoney } from '../../domain/money.ts';
import { Dot } from './primitives.tsx';

export function ListaDeFaturas({
  faturas,
  hoje,
  onAbrir,
}: {
  faturas: readonly Fatura[];
  hoje: string;
  onAbrir?: (accountId: string) => void;
}) {
  if (faturas.length === 0) {
    return (
      <p className="dim" style={{ fontSize: '0.86rem' }}>
        Nenhum cartão de crédito com dia de fechamento configurado. Em Ajustes, informe o fechamento e o vencimento
        para a fatura aparecer aqui.
      </p>
    );
  }

  const total = faturas.reduce((soma, fatura) => soma + fatura.total, 0);

  return (
    <div className="bars">
      {faturas.map((fatura) => {
        const diasAteVencer = Math.round(
          (Date.parse(`${fatura.vence}T00:00:00Z`) - Date.parse(`${hoje}T00:00:00Z`)) / 86_400_000,
        );
        const urgente = diasAteVencer <= 5;
        const abrivel = Boolean(onAbrir);

        return (
          <div
            key={fatura.conta.id}
            className={abrivel ? 'bar-row clicavel' : 'bar-row'}
            role={abrivel ? 'button' : undefined}
            tabIndex={abrivel ? 0 : undefined}
            aria-label={abrivel ? `Ver lançamentos de ${fatura.conta.name}` : undefined}
            onClick={abrivel ? () => onAbrir!(fatura.conta.id) : undefined}
            onKeyDown={
              abrivel
                ? (event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onAbrir!(fatura.conta.id);
                    }
                  }
                : undefined
            }
          >
            <span className="bar-label">
              <Dot color={fatura.conta.color} />
              <span className="text">
                {fatura.conta.institution ? `${fatura.conta.institution} · ` : ''}
                {fatura.conta.name}
              </span>
            </span>
            <span className="bar-value num" style={{ fontWeight: 620 }}>
              {formatMoney(fatura.total)}
            </span>
            <span className="dim" style={{ gridColumn: '1 / -1', fontSize: '0.76rem', marginTop: -2 }}>
              Fecha {formatDate(fatura.fecha)} · vence {formatDate(fatura.vence)}
              {urgente && diasAteVencer >= 0 && (
                <strong className="bad">
                  {' '}
                  · {diasAteVencer === 0 ? 'vence hoje' : `em ${diasAteVencer} ${diasAteVencer === 1 ? 'dia' : 'dias'}`}
                </strong>
              )}
              {' · '}
              {fatura.lancamentos} {fatura.lancamentos === 1 ? 'compra' : 'compras'}
            </span>
          </div>
        );
      })}

      {faturas.length > 1 && (
        <div className="row" style={{ borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 2 }}>
          <span className="dim" style={{ fontSize: '0.82rem' }}>Somando os cartões</span>
          <span className="spacer" />
          <span className="num" style={{ fontWeight: 660 }}>{formatMoney(total)}</span>
        </div>
      )}
    </div>
  );
}
