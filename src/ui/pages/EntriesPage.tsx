/** Lista do período aberto na barra, com busca e filtros. */

import { useEffect, useMemo, useState } from 'react';

import { FILTRO_VAZIO, casaComFiltro, type FiltroBasico } from '../../domain/filtros.ts';
import { formatMoney } from '../../domain/money.ts';
import { rotuloDoPeriodo, type Periodo } from '../../domain/period.ts';
import { periodTotals } from '../../domain/summary.ts';
import type { DisplayEntry, EntryKind } from '../../domain/types.ts';
import { usePeriodEntries } from '../../state/selectors.ts';
import { EntryList } from '../components/EntryList.tsx';
import { BarraDeFiltros, ContagemFiltrada } from '../components/Filtros.tsx';
import { Card } from '../components/primitives.tsx';

type Filter = 'all' | EntryKind | 'pending';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'Tudo' },
  { value: 'expense', label: 'Saídas' },
  { value: 'income', label: 'Entradas' },
  { value: 'transfer', label: 'Transferências' },
  { value: 'pending', label: 'Previstos' },
];

export function EntriesPage({
  periodo,
  foco,
  onOpenEntry,
  onNew,
}: {
  periodo: Periodo;
  /** Conta que outra tela mandou abrir aqui — "ver os lançamentos desta conta". */
  foco: { conta: string; token: number } | null;
  onOpenEntry: (entry: DisplayEntry) => void;
  onNew: () => void;
}) {
  const entries = usePeriodEntries(periodo);
  const [filter, setFilter] = useState<Filter>('all');
  const [busca, setBusca] = useState<FiltroBasico>(FILTRO_VAZIO);

  // O `token` muda a cada pedido, para que clicar de novo no mesmo botão
  // volte a aplicar o filtro depois de o usuário tê-lo limpado à mão.
  useEffect(() => {
    if (!foco) return;
    setBusca({ ...FILTRO_VAZIO, accountId: foco.conta });
    setFilter('all');
  }, [foco]);

  const filtered = useMemo(
    () =>
      entries.filter((entry) => {
        if (filter === 'pending' ? entry.status !== 'pending' : filter !== 'all' && entry.kind !== filter) return false;
        return casaComFiltro(entry, busca);
      }),
    [entries, filter, busca],
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
