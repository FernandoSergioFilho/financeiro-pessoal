/**
 * A leitura do período, como um relatório de fechamento.
 *
 * A conta está em `domain/analise.ts`, junto com o porquê de ela ser calculada
 * aqui e não pedida a um modelo de linguagem. Esta tela só apresenta: primeiro
 * os indicadores, depois os achados na ordem em que devem ser lidos — o mais
 * grave no topo.
 */

import { useMemo, useState } from 'react';

import { analisar, type Achado, type Tom } from '../../domain/analise.ts';
import { rotuloDoPeriodo, type Periodo } from '../../domain/period.ts';
import type { DisplayEntry } from '../../domain/types.ts';
import { useLookups } from '../../state/selectors.ts';
import { useFinance } from '../../state/store.tsx';
import { Dialog } from './primitives.tsx';

const EMOJI: Record<Tom, string> = {
  bom: '✅',
  atencao: '⚠️',
  ruim: '🔴',
  neutro: '📊',
};

const CLASSE: Record<Tom, string> = {
  bom: 'good',
  atencao: '',
  ruim: 'bad',
  neutro: 'muted',
};

export function AnaliseDialog({
  periodo,
  entradas,
  onClose,
}: {
  periodo: Periodo;
  entradas: readonly DisplayEntry[];
  onClose: () => void;
}) {
  const { data } = useFinance();
  const { categories } = useLookups();
  const analise = useMemo(() => analisar(data, entradas, categories), [data, entradas, categories]);

  return (
    <Dialog
      title={`Análise de ${rotuloDoPeriodo(periodo).toLowerCase()}`}
      onClose={onClose}
      wide
      footer={
        <>
          <span className="spacer" />
          <button type="button" className="btn primary" onClick={onClose}>
            Fechar
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {analise.indicadores.length > 0 && (
          <div className="grid contadores">
            {analise.indicadores.map((indicador) => (
              <div key={indicador.rotulo} className="card stat">
                <span className="stat-label">{indicador.rotulo}</span>
                <span className={`stat-value sm num ${CLASSE[indicador.tom]}`}>{indicador.valor}</span>
                <span className="stat-hint">{indicador.detalhe}</span>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {analise.achados.map((item) => (
            <Leitura key={item.id} achado={item} />
          ))}
        </div>

        <p className="hint">
          Calculado aqui no seu aparelho, a partir dos seus lançamentos — nada é enviado para lugar nenhum, e o
          resultado é o mesmo toda vez. Quanto mais meses fechados, mais a análise consegue dizer sobre o que é
          normal para você: hoje são {analise.mesesDeHistorico}.
        </p>
      </div>
    </Dialog>
  );
}

function Leitura({ achado }: { achado: Achado }) {
  return (
    <div className="banner" style={{ alignItems: 'flex-start' }}>
      <span className="emoji" aria-hidden="true">
        {EMOJI[achado.tom]}
      </span>
      <span>
        <strong>{achado.titulo}</strong>
        <br />
        <span className="dim">{achado.texto}</span>
      </span>
    </div>
  );
}

/** O botão que abre a análise, para a barra de ações do painel. */
export function BotaoDeAnalise({
  periodo,
  entradas,
}: {
  periodo: Periodo;
  entradas: readonly DisplayEntry[];
}) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <button type="button" className="btn sm" onClick={() => setAberto(true)}>
        🔎 Analisar
      </button>
      {aberto && <AnaliseDialog periodo={periodo} entradas={entradas} onClose={() => setAberto(false)} />}
    </>
  );
}
