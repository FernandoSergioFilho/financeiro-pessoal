/** Painel do período: onde o dinheiro está, para onde foi e o que ainda vem. */

import { useMemo, useState } from 'react';

import { addDays, addMonthsToKey, formatDate, monthEnd, monthKey, today } from '../../domain/date.ts';
import {
  HORIZONTE_DE_CAIXA, dividaDosCartoes, ehContaDeCaixa, lerCaixa, saldoDisponivel, saldoInvestido,
} from '../../domain/caixa.ts';
import { faturasAbertas } from '../../domain/faturas.ts';
import { agruparPorInstituicao } from '../../domain/institutions.ts';
import { calcularOrcamento } from '../../domain/orcamento.ts';
import { RECORTES, filtrarPorSituacao, sufixoDoRecorte, type RecorteDeSituacao } from '../../domain/situacao.ts';
import { formatMoney } from '../../domain/money.ts';
import {
  INICIO_DOS_TEMPOS,
  intervaloVisivel,
  periodoDoMes,
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
  periodTotals,
  totalsByCategory,
} from '../../domain/summary.ts';
import type { DisplayEntry } from '../../domain/types.ts';
import type { LeituraDoCaixa } from '../../domain/caixa.ts';
import { entriesInRange, useLookups, useOverdue, usePeriodEntries, useUpcoming } from '../../state/selectors.ts';
import { useFinance } from '../../state/store.tsx';
import { BotaoDeAnalise } from '../components/Analise.tsx';
import { ListaDeFaturas } from '../components/Faturas.tsx';
import { CartaoDisponivel, MedidorDeRitmo } from '../components/Orcamento.tsx';
import { CategoryBars, ComparativoCategorias, MonthlyBars, SaldoDoMes } from '../components/charts.tsx';
import { EntryList } from '../components/EntryList.tsx';
import { Card, Dot, EmptyState } from '../components/primitives.tsx';
import type { IrPara } from '../navegacao.ts';

/** Quantas barras cabem no gráfico de entradas e saídas por mês. */
const MAX_BARRAS = 12;

/** A janela de "vence nos próximos dias" — uma semana é o que se planeja. */
const DIAS_A_FRENTE = 7;

/**
 * A frase que um fluxo de caixa existe para produzir.
 *
 * O gráfico de saldo já mostrava a linha cruzando o zero, mas ninguém lê um
 * gráfico procurando isso — e ele só desenha o período aberto, enquanto o
 * aperto costuma estar dois meses adiante, onde as parcelas se acumulam. Aqui
 * a data está escrita, e o clique leva para os lançamentos daquele dia.
 *
 * Quando não há vermelho nenhum, o aviso ainda tem o que dizer: o pior dia do
 * trimestre. Terminar com R$ 40 no fundo do poço não é negativo, e é
 * exatamente a hora de não parcelar mais nada.
 */
function AvisoDeCaixa({ fluxo, irPara }: { fluxo: LeituraDoCaixa; irPara: IrPara }) {
  const { primeiroNegativo, menorSaldo } = fluxo;
  if (!menorSaldo) return null;

  const alvo = primeiroNegativo ?? menorSaldo;
  const apertado = !primeiroNegativo && menorSaldo.balance < APERTO;
  if (!primeiroNegativo && !apertado) return null;

  return (
    <button
      type="button"
      className={`banner clicavel ${primeiroNegativo ? 'grave' : 'warn'}`}
      style={{ alignItems: 'flex-start', width: '100%', textAlign: 'left' }}
      onClick={() =>
        irPara({ pagina: 'lancamentos', periodo: { grao: 'dia', ancora: alvo.date } })
      }
    >
      <span className="emoji" aria-hidden="true">{primeiroNegativo ? '🔴' : '⚠️'}</span>
      <span>
        <strong>
          {primeiroNegativo
            ? `Em ${formatDate(alvo.date)} o dinheiro acaba`
            : `Em ${formatDate(alvo.date)} sobra pouco`}
        </strong>
        <br />
        <span className="dim">
          {primeiroNegativo
            ? `Contando o que está previsto, o saldo fica em ${formatMoney(alvo.balance)} nesse dia. `
            : `É o dia mais apertado dos próximos ${HORIZONTE_DE_CAIXA} dias: ${formatMoney(alvo.balance)}. `}
          Toque para ver o que cai nesse dia.
        </span>
      </span>
    </button>
  );
}

/** Abaixo disto o mês está apertado, ainda que no azul. */
const APERTO = 30000;

export function Dashboard({
  periodo,
  onOpenEntry,
  onNew,
  onNavigate,
  irPara,
}: {
  periodo: Periodo;
  onOpenEntry: (entry: DisplayEntry) => void;
  onNew: () => void;
  onNavigate: (page: string) => void;
  irPara: IrPara;
}) {
  const { data, cloud } = useFinance();
  const { accounts, categories } = useLookups();
  const doPeriodo = usePeriodEntries(periodo);
  const overdue = useOverdue();
  const proximos = useUpcoming(DIAS_A_FRENTE);

  // O recorte é aplicado antes de qualquer conta, para que todo indicador da
  // tela fale do mesmo conjunto — e não um do total e outro só do realizado.
  const [recorte, setRecorte] = useState<RecorteDeSituacao>('tudo');
  const entradas = useMemo(() => filtrarPorSituacao(doPeriodo, recorte), [doPeriodo, recorte]);
  const sufixo = sufixoDoRecorte(recorte);

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
  //
  // **Disponível, e não patrimônio.** Antes este número era `netWorth`: somava
  // o investimento (que não é caixa deste mês) e descontava a dívida do cartão
  // (que ainda vai aparecer sozinha como saída no dia do vencimento). Num fluxo
  // de caixa o número grande é o dinheiro que dá para gastar; o resto fica ao
  // lado, dito com todas as letras.
  const balanceNow = useMemo(
    () => saldoDisponivel(accounts, data.entries, { onlySettled: true, upTo: today() }),
    [accounts, data.entries],
  );
  const investido = useMemo(
    () => saldoInvestido(accounts, data.entries, { onlySettled: true, upTo: today() }),
    [accounts, data.entries],
  );
  const divida = useMemo(
    () => dividaDosCartoes(accounts, data.entries, { onlySettled: true, upTo: today() }),
    [accounts, data.entries],
  );

  /*
   * O fluxo dos próximos noventa dias, **independente do período aberto**.
   *
   * O gráfico de saldo segue o período que está na barra: olhando setembro, ele
   * mostra setembro. Mas o aperto costuma estar dois meses adiante, onde as
   * parcelas se acumulam — e ninguém troca o período para ir procurar um
   * problema que ainda não sabe que existe.
   */
  const fluxo = useMemo(() => {
    const de = today();
    const ate = addDays(de, HORIZONTE_DE_CAIXA);
    const abertura = saldoDisponivel(accounts, entriesInRange(data, INICIO_DOS_TEMPOS, addDays(de, -1)), {
      upTo: addDays(de, -1),
    });
    const soDeCaixa = entriesInRange(data, de, ate).filter((entrada) => {
      const conta = accounts.find((c) => c.id === entrada.accountId);
      // O que sai de uma conta de caixa, mais o que a fatura do cartão leva
      // embora no vencimento — que é justamente o que este fluxo existe para
      // mostrar chegando.
      return conta ? ehContaDeCaixa(conta) || conta.kind === 'credit_card' : false;
    });
    return lerCaixa(balanceWalk(soDeCaixa, de, ate, abertura, de));
  }, [accounts, data]);
  const projected = useMemo(() => {
    const upToEnd = entriesInRange(data, INICIO_DOS_TEMPOS, janela.ate);
    return saldoDisponivel(accounts, upToEnd, { upTo: janela.ate });
  }, [accounts, data, janela.ate]);

  // O saldo com que o período começou: tudo que aconteceu antes do primeiro dia.
  const saldoDeAbertura = useMemo(() => {
    const vespera = addDays(janela.de, -1);
    const anterior = entriesInRange(data, INICIO_DOS_TEMPOS, vespera);
    // Caixa, e não patrimônio: é o dinheiro com que o período começou, e é ele
    // que o gráfico de saldo percorre e que o orçamento tem por base. Somar o
    // investimento aqui faria o gráfico fechar em número que ninguém pode
    // gastar — e discordar do "Dinheiro disponível" logo ao lado.
    return saldoDisponivel(accounts, anterior, { upTo: vespera });
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

  // "Quanto ainda posso gastar" mede o período inteiro, e não o recorte: com
  // "Já pago" selecionado o comprometido some, e a resposta viraria mentira.
  const orcamento = useMemo(
    () => calcularOrcamento(doPeriodo, janela, today(), saldoDeAbertura),
    [doPeriodo, janela],
  );

  const faturas = useMemo(
    () => faturasAbertas(accounts, data.entries, today()),
    [accounts, data.entries],
  );

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
      {/* O aviso é um botão: ver que há 12 contas atrasadas sem poder ir até
          elas transforma a informação em cobrança. Um toque leva à lista já
          filtrada, no período que enxerga tudo. */}
      {overdue.length > 0 && (
        <button
          type="button"
          className="banner warn clicavel"
          onClick={() =>
            irPara({
              pagina: 'lancamentos',
              recorte: 'atrasados',
              periodo: { grao: 'tudo', ancora: today() },
            })
          }
        >
          <span className="emoji" aria-hidden="true">
            ⏰
          </span>
          <span>
            <strong>
              {overdue.length === 1
                ? '1 conta venceu e continua a pagar'
                : `${overdue.length} contas venceram e continuam a pagar`}
            </strong>
            <br />
            <span className="dim">
              A mais antiga é {overdue[0]!.description}, de {formatDate(overdue[0]!.date)}. Toque para ver todas e
              marcar o que já pagou.
            </span>
          </span>
          <span className="spacer" />
          <span aria-hidden="true" style={{ fontSize: '1.2rem', color: 'var(--text-3)' }}>
            ›
          </span>
        </button>
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

      <AvisoDeCaixa fluxo={fluxo} irPara={irPara} />

      {/* O que decide o dia vem primeiro e maior; o resto é contexto. */}
      <div className="grid split" style={{ alignItems: 'stretch' }}>
        <CartaoDisponivel orcamento={orcamento} />
        <MedidorDeRitmo orcamento={orcamento} />
      </div>

      <div className="grid cols-4 keep">
        {/* O rodapé não é enfeite: sem ele, quem tem R$ 26 mil no Tesouro acha
            que o app perdeu dinheiro quando o número encolheu. */}
        <div className="card stat">
          <span className="stat-label">Dinheiro disponível</span>
          <span className={`stat-value num ${balanceNow < 0 ? 'bad' : ''}`}>{formatMoney(balanceNow)}</span>
          <span className="stat-hint">
            Nas contas e na carteira
            {investido > 0 && <> · {formatMoney(investido)} investido, à parte</>}
            {divida > 0 && <> · {formatMoney(divida)} em faturas por vencer</>}
          </span>
        </div>
        <button
          type="button"
          className="card stat clicavel"
          onClick={() => irPara({ pagina: 'lancamentos', recorte: 'income' })}
        >
          <span className="stat-label">Entradas{sufixo}</span>
          <span className="stat-value num good">{formatMoney(totals.income)}</span>
          <span className="stat-hint">
            {recorte !== 'tudo'
              ? `${entradas.filter((e) => e.kind === 'income').length} lançamentos`
              : totals.pendingIncome > 0
                ? `${formatMoney(totals.pendingIncome)} ainda previstos`
                : 'Tudo confirmado'}
          </span>
        </button>
        <button
          type="button"
          className="card stat clicavel"
          onClick={() => irPara({ pagina: 'lancamentos', recorte: 'expense' })}
        >
          <span className="stat-label">Saídas{sufixo}</span>
          <span className="stat-value num bad">{formatMoney(totals.expense)}</span>
          <span className="stat-hint">
            {recorte !== 'tudo'
              ? `${entradas.filter((e) => e.kind === 'expense').length} lançamentos`
              : totals.pendingExpense > 0
                ? `${formatMoney(totals.pendingExpense)} a pagar`
                : 'Tudo confirmado'}
          </span>
        </button>
        {/* Este cartão já foi "Sobra", que repetia o número do destaque acima.
            Comprometido é o que falta acontecer — informação nova, e o caminho
            direto para a lista do que ainda há para pagar. */}
        <button
          type="button"
          className="card stat clicavel"
          onClick={() => irPara({ pagina: 'lancamentos', recorte: 'pending' })}
        >
          <span className="stat-label">Ainda vai sair</span>
          <span className="stat-value num">{formatMoney(orcamento.comprometido)}</span>
          <span className="stat-hint">
            {orcamento.comprometido === 0
              ? 'Nada marcado para este período'
              : `Saldo projetado: ${formatMoney(projected)}`}
          </span>
        </button>
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

        <Card
          title={comparavel ? 'O que mudou desde o período anterior' : 'O que mudou'}
          action={
            comparavel && mudancas.length > 0 ? (
              <button
                type="button"
                className="btn sm ghost"
                title={`Abrir ${rotuloDoPeriodo(moverPeriodo(periodo, -1))}`}
                onClick={() => irPara({ pagina: 'painel', periodo: moverPeriodo(periodo, -1) })}
              >
                Ver {rotuloDoPeriodo(moverPeriodo(periodo, -1)).toLowerCase()}
              </button>
            ) : undefined
          }
        >
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
              <CategoryBars
                data={byCategory}
                onAbrir={(categoryId) => irPara({ pagina: 'lancamentos', filtro: { categoryId } })}
              />
            ) : (
              <p className="dim" style={{ fontSize: '0.86rem' }}>
                Nenhuma saída registrada neste período.
              </p>
            )}
          </Card>

          <Card title="Entradas e saídas por mês">
            <MonthlyBars
              data={series}
              currentKey={monthKey(today())}
              onAbrir={(mes) => irPara({ pagina: 'painel', periodo: periodoDoMes(mes) })}
            />
          </Card>
        </div>
      </div>

      <div className="grid split" style={{ alignItems: 'start' }}>
        <Card
          title="Faturas em aberto"
          action={
            <button type="button" className="btn sm ghost" onClick={() => onNavigate('parceladas')}>
              Ver parcelas
            </button>
          }
        >
          <ListaDeFaturas
            faturas={faturas}
            hoje={today()}
            onAbrir={(accountId) => irPara({ pagina: 'lancamentos', filtro: { accountId } })}
          />
        </Card>

        {/* O que vence nos próximos dias, com a caixa de pago do lado: é a
            lista que se olha de manhã, e dá para resolver sem sair daqui. */}
        <Card
          title="Vence nos próximos dias"
          action={
            <button
              type="button"
              className="btn sm ghost"
              onClick={() =>
                irPara({ pagina: 'lancamentos', recorte: 'pending', periodo: { grao: 'tudo', ancora: today() } })
              }
            >
              Ver tudo a pagar
            </button>
          }
          tight
        >
          {proximos.length > 0 ? (
            <EntryList entries={proximos} onOpen={onOpenEntry} />
          ) : (
            <p className="dim" style={{ fontSize: '0.86rem', padding: '4px 14px 12px' }}>
              Nada a vencer nos próximos {DIAS_A_FRENTE} dias.
            </p>
          )}
        </Card>
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
                    <button
                      key={account.id}
                      type="button"
                      className="row clicavel linha-conta"
                      style={{ alignItems: 'flex-start', gap: 10 }}
                      onClick={() => irPara({ pagina: 'lancamentos', filtro: { accountId: account.id } })}
                    >
                      <Dot color={account.color} />
                      <div style={{ minWidth: 0, textAlign: 'left' }}>
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
                    </button>
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
