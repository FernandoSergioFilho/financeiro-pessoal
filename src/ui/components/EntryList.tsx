/** Lista de lançamentos agrupada por dia, com ações rápidas. */

import { Fragment, useRef, useState } from 'react';

import { formatDate, formatDayMonth, today } from '../../domain/date.ts';
import { formatMoney, formatSigned } from '../../domain/money.ts';
import type { DisplayEntry, ProjectedEntry } from '../../domain/types.ts';
import { useLookups } from '../../state/selectors.ts';
import { useFinance } from '../../state/store.tsx';
import { deslocamentoVisual, direcaoDoGesto, passouDoLimiar } from '../gestos.ts';
import { Dot, EmptyState } from './primitives.tsx';

function isProjection(entry: DisplayEntry): entry is ProjectedEntry {
  return 'projected' in entry && entry.projected === true;
}

function amountText(entry: DisplayEntry): string {
  if (entry.kind === 'transfer') return formatMoney(entry.amount);
  return `${entry.kind === 'income' ? '+' : '−'}${formatMoney(entry.amount)}`;
}

function amountClass(entry: DisplayEntry): string {
  if (entry.kind === 'transfer') return 'muted';
  return entry.kind === 'income' ? 'good' : '';
}

export function EntryRow({
  entry,
  onOpen,
  showDate = true,
  selecao,
}: {
  entry: DisplayEntry;
  onOpen: (entry: DisplayEntry) => void;
  showDate?: boolean;
  /**
   * Quando presente, a lista está em modo de seleção: a linha marca em vez de
   * abrir. É um modo, e não uma caixa a mais na linha, porque a linha já tem a
   * caixa de "pago" e o gesto de arrastar — três controles no mesmo lugar
   * seria erro garantido no celular.
   */
  selecao?: { marcada: boolean; onAlternar: () => void };
}) {
  const { api } = useFinance();
  const { accountName, categoryById } = useLookups();
  const category = categoryById(entry.categoryId);
  const pending = entry.status === 'pending';
  const overdue = pending && entry.date < today();

  /**
   * Marcar e desmarcar como pago.
   *
   * Vai e volta de propósito: antes só dava para confirmar, e um ✓ dado por
   * engano não tinha desfazer nenhum a não ser abrir o lançamento e mexer no
   * formulário. Nada no app decide sozinho que algo foi pago — quem diz é
   * quem pagou, aqui.
   */
  function alternarPago() {
    if (isProjection(entry)) {
      // A ocorrência prevista de uma recorrente só existe como projeção;
      // confirmar é o que a transforma em lançamento gravado.
      api.materialize(entry, { status: 'settled' });
      return;
    }
    api.updateEntry(entry.id, { status: pending ? 'settled' : 'pending' });
  }

  /*
   * Arrastar a linha para marcar como pago.
   *
   * No celular, a caixinha tem 20px e mira-se com um dedo de 10mm; abrir o
   * lançamento só para dizer "paguei" é caro quando há trinta contas
   * atrasadas. O gesto vale para os dois lados de propósito — não há
   * convenção para lembrar, e a etiqueta que aparece atrás diz o que vai
   * acontecer. As regras do gesto estão em `ui/gestos.ts`.
   */
  const [arrasto, setArrasto] = useState(0);
  const gesto = useRef<{ x: number; y: number; direcao: 'indefinido' | 'horizontal' | 'vertical' } | null>(null);
  const arrastou = useRef(false);

  function aoTocar(event: React.TouchEvent) {
    const toque = event.touches[0];
    if (!toque) return;
    gesto.current = { x: toque.clientX, y: toque.clientY, direcao: 'indefinido' };
    arrastou.current = false;
  }

  function aoMover(event: React.TouchEvent) {
    const toque = event.touches[0];
    if (!gesto.current || !toque) return;
    const dx = toque.clientX - gesto.current.x;
    const dy = toque.clientY - gesto.current.y;

    if (gesto.current.direcao === 'indefinido') {
      gesto.current.direcao = direcaoDoGesto(dx, dy);
    }
    // Uma vez que o gesto virou rolagem, ele continua rolagem até o dedo
    // sair: reavaliar no meio faria a linha pular durante a rolagem.
    if (gesto.current.direcao !== 'horizontal') return;

    arrastou.current = true;
    setArrasto(deslocamentoVisual(dx));
  }

  function aoSoltar() {
    const valeu = gesto.current?.direcao === 'horizontal' && passouDoLimiar(arrasto);
    gesto.current = null;
    setArrasto(0);
    if (valeu) alternarPago();
  }

  const puxando = Math.abs(arrasto) > 4;
  const vaiValer = passouDoLimiar(arrasto);
  const selecionando = Boolean(selecao);

  return (
    <div className="entry-swipe">
      {puxando && (
        <span
          className={`entry-swipe-fundo ${arrasto > 0 ? 'direita' : 'esquerda'} ${vaiValer ? 'pronto' : ''}`}
          aria-hidden="true"
        >
          {pending ? '✓ Marcar pago' : '↩ Voltar a pagar'}
        </span>
      )}
      <div
        className={showDate ? 'entry' : 'entry no-date'}
        role="button"
        tabIndex={0}
        style={arrasto === 0 ? undefined : { transform: `translateX(${arrasto}px)`, transition: 'none' }}
        onTouchStart={selecionando ? undefined : aoTocar}
        onTouchMove={selecionando ? undefined : aoMover}
        onTouchEnd={selecionando ? undefined : aoSoltar}
        onTouchCancel={selecionando ? undefined : aoSoltar}
        onClick={() => {
          if (selecao) {
            selecao.onAlternar();
            return;
          }
          // Depois de um arrasto o navegador ainda dispara o clique; abrir o
          // lançamento aqui seria o gesto fazendo duas coisas de uma vez.
          if (arrastou.current) {
            arrastou.current = false;
            return;
          }
          onOpen(entry);
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          if (selecao) selecao.onAlternar();
          else onOpen(entry);
        }}
      >
        {selecao && (
          <span className="entry-selecao">
            <input
              type="checkbox"
              className="check-selecao"
              checked={selecao.marcada}
              aria-label={`Selecionar ${entry.description}`}
              onClick={(event) => event.stopPropagation()}
              onChange={selecao.onAlternar}
            />
          </span>
        )}
      {showDate && <span className="entry-date num">{formatDayMonth(entry.date)}</span>}

      {/* Título e detalhe são filhos diretos da grade: dentro de um invólucro,
          a coluna deles encolhia a zero em cartões estreitos e o valor acabava
          impresso por cima do nome da conta. */}
      <span className="entry-title">
        <Dot color={category?.color} />
        <span className="text">{entry.description}</span>
      </span>
      {/* As etiquetas ficam na segunda linha, e não junto da descrição: na
          largura de um celular elas comiam o espaço dela e "Supermercado"
          virava "Sup…" — o nome é justamente o que se procura na lista. */}
      <span className="entry-meta">
        <span className="text cat">{category?.name ?? 'Sem categoria'}</span>
        <span aria-hidden="true">·</span>
        <span className="text acc">
          {accountName(entry.accountId)}
          {entry.kind === 'transfer' && ` → ${accountName(entry.toAccountId)}`}
        </span>
        {entry.installmentNumber && (
          <span className="tag installment">
            {entry.installmentNumber}/{entry.installmentTotal}
          </span>
        )}
        {entry.recurringId && (
          <span className="tag recurring" title="Conta que se repete todo mês">
            🔁
          </span>
        )}
        {pending && (
          <span className={overdue ? 'tag pending bad' : 'tag pending'}>
            {overdue ? 'Atrasado' : 'Previsto'}
          </span>
        )}
      </span>

      <span className={`entry-amount num ${amountClass(entry)}${isProjection(entry) ? ' projected' : ''}`}>
        {amountText(entry)}
      </span>

      {/* No modo de seleção a caixa de "pago" sai da linha: duas caixas de
          seleção lado a lado, uma marcando e outra pagando, é erro garantido.
          Sai de verdade, e não com `hidden` — o atributo não vence o
          `display: grid` que ela própria tem. */}
      <span className="entry-actions">
        {!selecionando && (
        <input
          type="checkbox"
          className="check-pago"
          checked={!pending}
          title={pending ? 'Marcar como pago' : 'Desmarcar: voltar a "a pagar"'}
          aria-label={`${entry.description}: ${pending ? 'marcar como pago' : 'desmarcar, voltar a a pagar'}`}
          onClick={(event) => event.stopPropagation()}
          onChange={alternarPago}
        />
        )}
      </span>
      </div>
    </div>
  );
}

export interface SelecaoDaLista {
  marcados: ReadonlySet<string>;
  onAlternar: (entry: DisplayEntry) => void;
}

export function EntryList({
  entries,
  onOpen,
  groupByDay = true,
  emptyAction,
  selecao,
}: {
  entries: DisplayEntry[];
  onOpen: (entry: DisplayEntry) => void;
  groupByDay?: boolean;
  emptyAction?: React.ReactNode;
  selecao?: SelecaoDaLista;
}) {
  const daLinha = (entry: DisplayEntry) =>
    selecao ? { marcada: selecao.marcados.has(entry.id), onAlternar: () => selecao.onAlternar(entry) } : undefined;
  if (entries.length === 0) {
    return (
      <EmptyState emoji="🗒️" title="Nenhum lançamento aqui" action={emptyAction}>
        Registre uma saída, uma entrada ou cadastre uma conta que se repete todo mês.
      </EmptyState>
    );
  }

  if (!groupByDay) {
    return (
      <div className="entries">
        {entries.map((entry) => (
          <EntryRow key={entry.id} entry={entry} onOpen={onOpen} selecao={daLinha(entry)} />
        ))}
      </div>
    );
  }

  const days = new Map<string, DisplayEntry[]>();
  for (const entry of entries) {
    const list = days.get(entry.date);
    if (list) list.push(entry);
    else days.set(entry.date, [entry]);
  }

  return (
    <div className="entries">
      {[...days.entries()].map(([date, list]) => {
        const net = list.reduce(
          (sum, entry) =>
            entry.kind === 'income' ? sum + entry.amount : entry.kind === 'expense' ? sum - entry.amount : sum,
          0,
        );
        return (
          <Fragment key={date}>
            <div className="day-heading">
              <span>{formatDate(date)}</span>
              <span className={`total num ${net < 0 ? '' : 'good'}`}>{formatSigned(net)}</span>
            </div>
            {list.map((entry) => (
              <EntryRow key={entry.id} entry={entry} onOpen={onOpen} showDate={false} selecao={daLinha(entry)} />
            ))}
          </Fragment>
        );
      })}
    </div>
  );
}
