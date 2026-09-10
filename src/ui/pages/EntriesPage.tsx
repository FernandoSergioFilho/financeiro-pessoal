/** Lista do período aberto na barra, com busca e filtros. */

import { useEffect, useMemo, useState } from 'react';

import { today } from '../../domain/date.ts';
import { FILTRO_VAZIO, casaComFiltro, type FiltroBasico } from '../../domain/filtros.ts';
import { formatMoney } from '../../domain/money.ts';
import { rotuloDoPeriodo, type Periodo } from '../../domain/period.ts';
import { periodTotals } from '../../domain/summary.ts';
import type { DisplayEntry } from '../../domain/types.ts';
import { usePeriodEntries } from '../../state/selectors.ts';
import { EntryList } from '../components/EntryList.tsx';
import { BarraDeFiltros, ContagemFiltrada } from '../components/Filtros.tsx';
import { Card } from '../components/primitives.tsx';
import type { DestinoAplicado, RecorteDaLista } from '../navegacao.ts';

const FILTERS: { value: RecorteDaLista; label: string }[] = [
  { value: 'all', label: 'Tudo' },
  { value: 'expense', label: 'Saídas' },
  { value: 'income', label: 'Entradas' },
  { value: 'transfer', label: 'Transferências' },
  { value: 'pending', label: 'A pagar' },
  { value: 'atrasados', label: 'Atrasados' },
];

/** O recorte aplicado a um lançamento. Atrasado = a pagar com data já passada. */
function passaNoRecorte(entry: DisplayEntry, recorte: RecorteDaLista, hoje: string): boolean {
  if (recorte === 'all') return true;
  if (recorte === 'pending') return entry.status === 'pending';
  if (recorte === 'atrasados') return entry.status === 'pending' && entry.date < hoje;
  return entry.kind === recorte;
}

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
  const entries = usePeriodEntries(periodo);
  const [filter, setFilter] = useState<RecorteDaLista>('all');
  const [busca, setBusca] = useState<FiltroBasico>(FILTRO_VAZIO);

  // O `token` muda a cada pedido, para que clicar de novo no mesmo atalho
  // volte a aplicar o filtro depois de a pessoa tê-lo limpado à mão.
  useEffect(() => {
    if (!destino || destino.pagina !== 'lancamentos') return;
    setBusca({ ...FILTRO_VAZIO, ...destino.filtro });
    setFilter(destino.recorte ?? 'all');
  }, [destino]);

  const hoje = today();
  const filtered = useMemo(
    () => entries.filter((entry) => passaNoRecorte(entry, filter, hoje) && casaComFiltro(entry, busca)),
    [entries, filter, busca, hoje],
  );

  const totals = periodTotals(filtered);

  return (
    <>
      <BarraDeFiltros valor={busca} onChange={setBusca} placeholder="Buscar lançamento…" />

      <div className="row wrap">
        <div className="segmented scroll-x">
          {FILTERS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={filter === option.value}
              onClick={() => setFilter(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <span className="spacer" />
        <span className="dim num" style={{ fontSize: '0.82rem' }}>
          <ContagemFiltrada
            mostrando={filtered.length}
            total={entries.length}
            singular="lançamento"
            plural="lançamentos"
          />{' '}
          em {rotuloDoPeriodo(periodo)} · <span className="good">{formatMoney(totals.income)}</span> ·{' '}
          <span className="bad">{formatMoney(totals.expense)}</span>
        </span>
      </div>

      <Card tight>
        <EntryList
          entries={filtered}
          onOpen={onOpenEntry}
          emptyAction={
            <button type="button" className="btn primary" onClick={onNew}>
              Novo lançamento
            </button>
          }
        />
      </Card>
    </>
  );
}
