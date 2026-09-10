/** Painel do período: onde o dinheiro está, para onde foi e o que ainda vem. */

import { useMemo, useState } from 'react';

import { addDays, addMonthsToKey, formatDate, monthEnd, monthKey, today } from '../../domain/date.ts';
import { agruparPorInstituicao } from '../../domain/institutions.ts';
import { RECORTES, filtrarPorSituacao, sufixoDoRecorte, type RecorteDeSituacao } from '../../domain/situacao.ts';
import { formatMoney } from '../../domain/money.ts';
import {
  INICIO_DOS_TEMPOS,
  intervaloVisivel,
  moverPeriodo,
  podeMover,
  rotuloDoPeriodo,
  type Periodo,
} from '../../domain/period.ts';
import {
  accountBalance,
  balanceWalk,
  categoryChanges,
  monthlySeries,
  netWorth,
  periodTotals,
  totalsByCategory,
} from '../../domain/summary.ts';
import type { DisplayEntry } from '../../domain/types.ts';
import { entriesInRange, useLookups, useOverdue, usePeriodEntries } from '../../state/selectors.ts';
import { useFinance } from '../../state/store.tsx';
import { BotaoDeAnalise } from '../components/Analise.tsx';
import { CategoryBars, ComparativoCategorias, MonthlyBars, SaldoDoMes } from '../components/charts.tsx';
import { EntryList } from '../components/EntryList.tsx';
import { Card, Dot, EmptyState } from '../components/primitives.tsx';

/** Quantas barras cabem no gráfico de entradas e saídas por mês. */
const MAX_BARRAS = 12;

export function Dashboard({
  periodo,
  onOpenEntry,
  onNew,
  onNavigate,
}: {
  periodo: Periodo;
  onOpenEntry: (entry: DisplayEntry) => void;
  onNew: () => void;
  onNavigate: (page: string) => void;
}) {
  const { data, cloud } = useFinance();
  const { accounts, categories } = useLookups();
  const doPeriodo = usePeriodEntries(periodo);
  const overdue = useOverdue();

  // O recorte é aplicado antes de qualquer conta, para que todo indicador da
  // tela fale do mesmo conjunto — e não um do total e outro só do realizado.
  const [recorte, setRecorte] = useState<RecorteDeSituacao>('tudo');
  const entradas = useMemo(() => filtrarPorSituacao(doPeriodo, recorte), [doPeriodo, recorte]);
  const sufixo = sufixoDoRecorte(recorte);
  const sufixoSingular = sufixoDoRecorte(recorte, 'singular');

  // O eixo do gráfico não pode ir do ano zero ao ano 9999: com "Tudo", o
  // intervalo encolhe para o que existe de verdade.
  const janela = useMemo(
    () => intervaloVisivel(periodo, data.entries.map((entry) => entry.date)),
    [periodo, data.entries],
  );

  const totals = useMemo(() => periodTotals(entradas), [entradas]);
  const byCategory = useMemo(
    () => totalsByCategory(entradas, categories, 'expense'),
    [entradas, categories],
  );

  // O saldo de hoje conta só o que já aconteceu; a projeção soma o que ainda
  // está previsto até o fim do período — a diferença é o que dá ou não para gastar.
  const balanceNow = useMemo(
    () => netWorth(accounts, data.entries, { onlySettled: true, upTo: today() }),
    [accounts, data.entries],
  );
  const projected = useMemo(() => {
    const upToEnd = entriesInRange(data, INICIO_DOS_TEMPOS, janela.ate);
    return netWorth(accounts, upToEnd, { upTo: janela.ate });
  }, [accounts, data, janela.ate]);

  // O saldo com que o período começou: tudo que aconteceu antes do primeiro dia.
  const saldoDeAbertura = useMemo(() => {
    const vespera = addDays(janela.de, -1);
    const anterior = entriesInRange(data, INICIO_DOS_TEMPOS, vespera);
    return netWorth(accounts, anterior, { upTo: vespera });
  }, [accounts, data, janela.de]);

  const percurso = useMemo(
    () => balanceWalk(entradas, janela.de, janela.ate, saldoDeAbertura, today()),
    [entradas, janela.de, janela.ate, saldoDeAbertura],
  );

  // Sempre os doze meses que terminam no período aberto: um mês sozinho não
  // conta história nenhuma, e é a comparação que mostra o que fugiu do normal.
  const series = useMemo(() => {
    const ultimo = monthKey(janela.ate);
    const meses = Array.from({ length: MAX_BARRAS }, (_, i) => addMonthsToKey(ultimo, i - (MAX_BARRAS - 1)));
    const range = filtrarPorSituacao(entriesInRange(data, `${meses[0]}-01`, monthEnd(meses.at(-1)!)), recorte);
    return monthlySeries(range, meses);
  }, [data, janela.ate, recorte]);

  const comparavel = podeMover(periodo);
  const anterior = useMemo(() => {
    if (!comparavel) return [];
    const passado = moverPeriodo(periodo, -1);
    const { de, ate } = intervaloVisivel(passado, []);
    return filtrarPorSituacao(entriesInRange(data, de, ate), recorte);
  }, [comparavel, data, periodo, recorte]);

  const mudancas = useMemo(
    () => (comparavel ? categoryChanges(entradas, anterior, categories) : []),
    [comparavel, entradas, anterior, categories],
  );

  const recent = useMemo(() => [...entradas].reverse().slice(0, 8), [entradas]);

  if (data.entries.length === 0 && data.recurring.length === 0) {
    // Sem o ramo "entre para sincronizar" que existia aqui: com o portão de
    // login, ninguém deslogado chega a esta tela na versão publicada.
    const ondeFicaSalvo = cloud.enabled
      ? 'Tudo fica salvo neste aparelho e sincronizado com os seus outros.'
      : 'Tudo fica salvo só neste navegador.';

    return (
      <Card>
        <EmptyState
          emoji="👋"
          title="Vamos começar"
          action={
            <button type="button" className="btn primary" onClick={onNew}>
              Criar o primeiro lançamento
            </button>
          }
        >
          Registre entradas e saídas, cadastre as contas que se repetem todo mês e as compras parceladas.{' '}
          {ondeFicaSalvo}
        </EmptyState>
      </Card>
    );
  }

  const nomeDoPeriodo = periodo.grao === 'tudo' ? 'de tudo' : `de ${rotuloDoPeriodo(periodo).toLowerCase()}`;

  return (
    <>
      {overdue.length > 0 && (
        <div className="banner warn">
          <span className="emoji" aria-hidden="true">
            ⏰
          </span>
          <span>
            <strong>
              {overdue.length === 1
                ? '1 conta venceu e continua como prevista'
                : `${overdue.length} contas venceram e continuam como previstas`}
            </strong>
            <br />
            <span className="dim">
              A mais antiga é {overdue[0]!.description}, de {formatDate(overdue[0]!.date)}. Confirme no ✓ da lista se já pagou.
            </span>
          </span>
        </div>
      )}

      {/* O recorte por situação e a leitura do período ficam juntos, e ao lado
          dos números: quem olha o painel é quem quer saber o que fazer com ele. */}
      <div className="row wrap">
        <div className="segmented scroll-x">
          {RECORTES.map((opcao) => (
            <button
              key={opcao.valor}
              type="button"
              aria-pressed={recorte === opcao.valor}
              title={opcao.explicacao}
              onClick={() => setRecorte(opcao.valor)}
            >
              {opcao.rotulo}
            </button>
          ))}
        </div>
        <span className="spacer" />
        <BotaoDeAnalise periodo={periodo} entradas={entradas} />
      </div>

      <div className="grid cols-4 keep">
        <div className="card stat">
          <span className="stat-label">Saldo hoje</span>
          <span className={`stat-value num ${balanceNow < 0 ? 'bad' : ''}`}>{formatMoney(balanceNow)}</span>
          <span className="stat-hint">Somando o que já entrou e saiu</span>
        </div>
        <div className="card stat">
          <span className="stat-label">Entradas{sufixo}</span>
          <span className="stat-value num good">{formatMoney(totals.income)}</span>
          <span className="stat-hint">
            {recorte !== 'tudo'
              ? `${entradas.filter((e) => e.kind === 'income').length} lançamentos`
              : totals.pendingIncome > 0
                ? `${formatMoney(totals.pendingIncome)} ainda previstos`
                : 'Tudo confirmado'}
          </span>
        </div>
        <div className="card stat">
          <span className="stat-label">Saídas{sufixo}</span>
          <span className="stat-value num bad">{formatMoney(totals.expense)}</span>
          <span className="stat-hint">
            {recorte !== 'tudo'
              ? `${entradas.filter((e) => e.kind === 'expense').length} lançamentos`
              : totals.pendingExpense > 0
                ? `${formatMoney(totals.pendingExpense)} a pagar`
                : 'Tudo confirmado'}
          </span>
        </div>
        <div className="card stat">
          <span className="stat-label">Sobra{sufixoSingular}</span>
          <span className={`stat-value num ${totals.net < 0 ? 'bad' : 'good'}`}>{formatMoney(totals.net)}</span>
          <span className="stat-hint">Saldo projetado: {formatMoney(projected)}</span>
        </div>
      </div>

      {/* `start`: sem isto os dois cartões esticam até a altura do mais alto, e
          o gráfico de linha fica com um vazio enorme embaixo. */}
      <div className="grid split" style={{ alignItems: 'start' }}>
        <Card title={percurso.length > 1 ? `Saldo ao longo ${nomeDoPeriodo}` : 'Saldo no dia'}>
          {percurso.length > 1 ? (
            <SaldoDoMes data={percurso} />
          ) : (
            <p className="dim" style={{ fontSize: '0.86rem' }}>
              Um dia sozinho não tem percurso. O saldo ao fim de {formatDate(janela.ate)} é{' '}
              <strong className="num">{formatMoney(percurso[0]?.balance ?? saldoDeAbertura)}</strong>.
            </p>
          )}
        </Card>

        <Card title={comparavel ? 'O que mudou desde o período anterior' : 'O que mudou'}>
          {!comparavel ? (
            <p className="dim" style={{ fontSize: '0.86rem' }}>
              Escolha um dia, mês, trimestre ou ano para comparar com o período anterior.
            </p>
          ) : mudancas.length > 0 ? (
            <ComparativoCategorias data={mudancas} comparadoCom={`com ${rotuloDoPeriodo(moverPeriodo(periodo, -1)).toLowerCase()}`} />
          ) : (
            <p className="dim" style={{ fontSize: '0.86rem' }}>
              Nada mudou em relação ao período anterior — ou ainda não há com o que comparar.
            </p>
          )}
        </Card>
      </div>

      <div className="grid split">
        <Card
          title="Últimos lançamentos"
          action={
            <button type="button" className="btn sm ghost" onClick={() => onNavigate('lancamentos')}>
              Ver todos
            </button>
          }
          tight
        >
          <EntryList entries={recent} onOpen={onOpenEntry} groupByDay={false} />
        </Card>

        <div className="grid" style={{ alignContent: 'start' }}>
          <Card title="Gastos por categoria">
            {byCategory.length > 0 ? (
              <CategoryBars data={byCategory} />
            ) : (
              <p className="dim" style={{ fontSize: '0.86rem' }}>
                Nenhuma saída registrada neste período.
              </p>
            )}
          </Card>

          <Card title="Entradas e saídas por mês">
            <MonthlyBars data={series} currentKey={monthKey(today())} />
          </Card>
        </div>
      </div>

      <Card title="Saldo por conta">
        <div className="grid cols-3">
          {agruparPorInstituicao(accounts.filter((account) => !account.archived)).map((grupo) => {
            const saldos = grupo.contas.map((account) => ({
              account,
              balance: accountBalance(account, data.entries, { onlySettled: true }),
              withPending: accountBalance(account, entriesInRange(data, INICIO_DOS_TEMPOS, janela.ate), {
                upTo: janela.ate,
              }),
            }));
            // O subtotal do banco: o que sobra ali depois de pagar a fatura do
            // cartão, que é a pergunta que se faz olhando "Nubank" como um todo.
            const soma = saldos.reduce((total, linha) => total + linha.balance, 0);
            const agrupado = grupo.contas.length > 1;

            return (
              <div key={grupo.nome} style={{ minWidth: 0 }}>
                {agrupado && (
                  <div className="row" style={{ gap: 8, marginBottom: 4 }}>
                    <span className="dim" style={{ fontSize: '0.74rem', fontWeight: 640, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                      {grupo.nome}
                    </span>
                    <span className="spacer" />
                    <span className={`num ${soma < 0 ? 'bad' : ''}`} style={{ fontSize: '0.86rem', fontWeight: 620 }}>
                      {formatMoney(soma)}
                    </span>
                  </div>
                )}
                <div className="grid" style={{ gap: 8 }}>
                  {saldos.map(({ account, balance, withPending }) => (
                    <div key={account.id} className="row" style={{ alignItems: 'flex-start', gap: 10 }}>
                      <Dot color={account.color} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 560 }}>{account.name}</div>
                        <div className={`num ${balance < 0 ? 'bad' : ''}`} style={{ fontSize: '1.05rem', fontWeight: 620 }}>
                          {formatMoney(balance)}
                        </div>
                        {withPending !== balance && (
                          <div className="dim" style={{ fontSize: '0.76rem' }}>
                            {formatMoney(withPending)} com os previstos
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </>
  );
}
