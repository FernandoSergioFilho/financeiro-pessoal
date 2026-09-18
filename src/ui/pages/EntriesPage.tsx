/** Lista do período aberto na barra, com busca e filtros. */

import { useEffect, useMemo, useState } from 'react';

import { today } from '../../domain/date.ts';
import { descreverImpactoEmLancamentos, impactoDeApagarLancamentos } from '../../domain/exclusao.ts';
import { FILTRO_VAZIO, casaComFiltro, type FiltroBasico } from '../../domain/filtros.ts';
import {
  RECORTE_ABERTO, SITUACOES, TIPOS, descreverRecorte, dimensoesDoAtalho, passaNoRecorte, temRecorte,
  type RecorteDaLista,
} from '../../domain/recorte-lista.ts';
import { formatMoney } from '../../domain/money.ts';
import { rotuloDoPeriodo, type Periodo } from '../../domain/period.ts';
import { periodTotals } from '../../domain/summary.ts';
import type { DisplayEntry } from '../../domain/types.ts';
import { usePeriodEntries } from '../../state/selectors.ts';
import { useFinance } from '../../state/store.tsx';
import { EntryList } from '../components/EntryList.tsx';
import { BarraDeFiltros, ContagemFiltrada } from '../components/Filtros.tsx';
import { BarraDeSelecao } from '../components/Selecao.tsx';
import { Card, ConfirmDialog } from '../components/primitives.tsx';
import type { DestinoAplicado } from '../navegacao.ts';

export function EntriesPage({
  periodo,
  destino,
  onOpenEntry,
  onNew,
}: {
  periodo: Periodo;
  /** O que outra tela mandou abrir aqui — ver `ui/navegacao.ts`. */
  destino: DestinoAplicado | null;
  onOpenEntry: (entry: DisplayEntry) => void;
  onNew: () => void;
}) {
  const { data, api } = useFinance();
  const entries = usePeriodEntries(periodo);
  const [recorte, setRecorte] = useState<RecorteDaLista>(RECORTE_ABERTO);
  const [busca, setBusca] = useState<FiltroBasico>(FILTRO_VAZIO);
  // Modo, e não uma caixa a mais na linha: a linha já tem a caixa de "pago" e
  // o gesto de arrastar, e três controles no mesmo lugar seria erro garantido.
  const [selecionando, setSelecionando] = useState(false);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [apagando, setApagando] = useState(false);

  // O `token` muda a cada pedido, para que clicar de novo no mesmo atalho
  // volte a aplicar o filtro depois de a pessoa tê-lo limpado à mão.
  useEffect(() => {
    if (!destino || destino.pagina !== 'lancamentos') return;
    setBusca({ ...FILTRO_VAZIO, ...destino.filtro });
    setRecorte(dimensoesDoAtalho(destino.recorte ?? 'all'));
  }, [destino]);

  const hoje = today();
  const filtered = useMemo(
    () => entries.filter((entry) => passaNoRecorte(entry, recorte, hoje) && casaComFiltro(entry, busca)),
    [entries, recorte, busca, hoje],
  );

  const totals = periodTotals(filtered);

  const selecionados = useMemo(
    () => filtered.filter((entry) => marcados.has(entry.id)),
    [filtered, marcados],
  );
  const impacto = impactoDeApagarLancamentos(data, selecionados);

  function alternar(entry: DisplayEntry) {
    setMarcados((atual) => {
      const proxima = new Set(atual);
      if (proxima.has(entry.id)) proxima.delete(entry.id);
      else proxima.add(entry.id);
      return proxima;
    });
  }

  function sairDaSelecao() {
    setSelecionando(false);
    setMarcados(new Set());
  }

  function apagarSelecionados() {
    for (const entry of selecionados) {
      // A ocorrência prevista não existe como registro: o que se apaga é
      // aquele mês da regra, e a regra continua nos outros.
      if ('projected' in entry && entry.projected && entry.recurringId && entry.occurrenceDate) {
        api.skipOccurrence(entry.recurringId, entry.occurrenceDate);
      } else {
        api.deleteEntry(entry.id);
      }
    }
    setApagando(false);
    sairDaSelecao();
  }

  return (
    <>
      <BarraDeFiltros valor={busca} onChange={setBusca} placeholder="Buscar lançamento…" />

      {/* Dois controles, e não um: tipo e situação são perguntas
          independentes, e a lista responde às duas ao mesmo tempo. Os rótulos
          à esquerda existem para que duas filas de botões não sejam lidas como
          um controle só quebrado no meio. */}
      <div className="eixos-do-recorte">
        <div className="eixo">
          <span className="rotulo-do-eixo">Tipo</span>
          <div className="segmented duas-linhas">
            {TIPOS.map((opcao) => (
              <button
                key={opcao.valor}
                type="button"
                aria-pressed={recorte.tipo === opcao.valor}
                onClick={() => setRecorte((r) => ({ ...r, tipo: opcao.valor }))}
              >
                {opcao.rotulo}
              </button>
            ))}
          </div>
        </div>
        <div className="eixo">
          <span className="rotulo-do-eixo">Situação</span>
          <div className="segmented duas-linhas">
            {SITUACOES.map((opcao) => (
              <button
                key={opcao.valor}
                type="button"
                aria-pressed={recorte.situacao === opcao.valor}
                title={opcao.explicacao}
                onClick={() => setRecorte((r) => ({ ...r, situacao: opcao.valor }))}
              >
                {opcao.rotulo}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="row wrap">
        {temRecorte(recorte) && (
          <button type="button" className="btn sm ghost" onClick={() => setRecorte(RECORTE_ABERTO)}>
            ✕ Limpar recorte
          </button>
        )}
        <span className="spacer" />
        <button
          type="button"
          className={selecionando ? 'btn sm' : 'btn sm ghost'}
          aria-pressed={selecionando}
          onClick={() => (selecionando ? sairDaSelecao() : setSelecionando(true))}
        >
          {selecionando ? 'Sair da seleção' : '☑️ Selecionar'}
        </button>
        <span className="dim num" style={{ fontSize: '0.82rem' }}>
          <ContagemFiltrada
            mostrando={filtered.length}
            total={entries.length}
            singular="lançamento"
            plural="lançamentos"
          />{' '}
          em {rotuloDoPeriodo(periodo)}
          {temRecorte(recorte) && <> · {descreverRecorte(recorte)}</>} ·{' '}
          <span className="good">{formatMoney(totals.income)}</span> ·{' '}
          <span className="bad">{formatMoney(totals.expense)}</span>
        </span>
      </div>

      {selecionando && (
        <BarraDeSelecao
          quantos={marcados.size}
          singular="lançamento"
          plural="lançamentos"
          genero="m"
          sempreVisivel
          onLimpar={() => setMarcados(new Set())}
          onApagar={() => setApagando(true)}
        >
          <button
            type="button"
            className="btn sm ghost"
            onClick={() =>
              setMarcados((atual) =>
                // "Todos" é o que a busca deixou na tela, e não o período inteiro.
                atual.size === filtered.length ? new Set() : new Set(filtered.map((e) => e.id)),
              )
            }
          >
            {marcados.size === filtered.length ? 'Desmarcar todos' : `Marcar os ${filtered.length} da lista`}
          </button>
          {impacto.previstos > 0 && (
            <span className="dim" style={{ fontSize: '0.82rem' }}>
              · {impacto.previstos} {impacto.previstos === 1 ? 'é previsto' : 'são previstos'}
            </span>
          )}
        </BarraDeSelecao>
      )}

      <Card tight>
        <EntryList
          entries={filtered}
          onOpen={onOpenEntry}
          selecao={selecionando ? { marcados, onAlternar: alternar } : undefined}
          emptyAction={
            <button type="button" className="btn primary" onClick={onNew}>
              Novo lançamento
            </button>
          }
        />
      </Card>

      {apagando && (
        <ConfirmDialog
          title={marcados.size === 1 ? 'Apagar lançamento' : `Apagar ${marcados.size} lançamentos`}
          confirmLabel={`Apagar ${marcados.size}`}
          message={descreverImpactoEmLancamentos(impacto)}
          onConfirm={apagarSelecionados}
          onCancel={() => setApagando(false)}
        />
      )}
    </>
  );
}
