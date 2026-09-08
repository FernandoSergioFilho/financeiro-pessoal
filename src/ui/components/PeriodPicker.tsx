/**
 * Seletor de período da barra do topo.
 *
 * Substitui a navegação que só sabia andar de mês em mês. As setas continuam
 * ali — é o gesto que já estava no dedo —, mas agora andam no grão escolhido,
 * e existe "Tudo", que é o único jeito de ver um lançamento marcado para daqui
 * a oito meses ou de dois anos atrás.
 */

import { useEffect, useRef, useState } from 'react';

import {
  ehPeriodoAtual,
  periodoDeHoje,
  podeMover,
  moverPeriodo,
  rotuloCurto,
  rotuloDoPeriodo,
  trocarGrao,
  type Grao,
  type Periodo,
} from '../../domain/period.ts';

const GRAOS: { valor: Grao; rotulo: string }[] = [
  { valor: 'dia', rotulo: 'Dia' },
  { valor: 'mes', rotulo: 'Mês' },
  { valor: 'trimestre', rotulo: 'Trimestre' },
  { valor: 'ano', rotulo: 'Ano' },
  { valor: 'tudo', rotulo: 'Tudo' },
  { valor: 'livre', rotulo: 'Escolher datas' },
];

export function PeriodPicker({
  periodo,
  onChange,
}: {
  periodo: Periodo;
  onChange: (periodo: Periodo) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);

  // Fechar clicando fora é o que se espera de um menu; sem isso ele fica
  // preso aberto no celular, cobrindo a tela.
  useEffect(() => {
    if (!aberto) return;
    const fora = (event: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(event.target as Node)) setAberto(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setAberto(false);
    };
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', fora);
      document.removeEventListener('keydown', escape);
    };
  }, [aberto]);

  const movel = podeMover(periodo);

  return (
    <div className="periodo" ref={caixa}>
      <div className="month-nav">
        <button
          type="button"
          onClick={() => onChange(moverPeriodo(periodo, -1))}
          disabled={!movel}
          aria-label="Período anterior"
        >
          ‹
        </button>
        <button
          type="button"
          className="label"
          onClick={() => setAberto((estava) => !estava)}
          aria-haspopup="true"
          aria-expanded={aberto}
          title="Escolher o período"
        >
          <span className="longo">{rotuloDoPeriodo(periodo)}</span>
          <span className="curto">{rotuloCurto(periodo)}</span>
          <span className="seta" aria-hidden="true">
            ▾
          </span>
        </button>
        <button
          type="button"
          onClick={() => onChange(moverPeriodo(periodo, 1))}
          disabled={!movel}
          aria-label="Próximo período"
        >
          ›
        </button>
      </div>

      {!ehPeriodoAtual(periodo) && (
        <button type="button" className="btn sm ghost" onClick={() => onChange(periodoDeHoje(periodo))}>
          Hoje
        </button>
      )}

      {aberto && (
        <div className="periodo-menu" role="menu">
          {GRAOS.map(({ valor, rotulo }) => (
            <button
              key={valor}
              type="button"
              role="menuitemradio"
              aria-checked={periodo.grao === valor}
              className={periodo.grao === valor ? 'ativo' : ''}
              onClick={() => {
                onChange(trocarGrao(periodo, valor));
                if (valor !== 'livre') setAberto(false);
              }}
            >
              {rotulo}
            </button>
          ))}

          {periodo.grao === 'livre' && (
            <div className="periodo-datas">
              <label>
                <span className="dim">De</span>
                <input
                  type="date"
                  value={periodo.de ?? ''}
                  onChange={(event) => onChange({ ...periodo, de: event.target.value })}
                />
              </label>
              <label>
                <span className="dim">Até</span>
                <input
                  type="date"
                  value={periodo.ate ?? ''}
                  onChange={(event) => onChange({ ...periodo, ate: event.target.value })}
                />
              </label>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

