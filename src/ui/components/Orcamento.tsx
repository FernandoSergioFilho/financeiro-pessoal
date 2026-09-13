/**
 * Os dois cartões que abrem o painel: quanto ainda dá para gastar, e se o
 * ritmo do mês está de pé.
 *
 * A forma de cada um vem do trabalho que ele faz. "Quanto posso gastar" é um
 * número só, e a decisão do dia depende dele — então é figura de destaque, e
 * não mais um cartão igual aos outros. "Estou gastando rápido demais?" é uma
 * razão contra um limite — então é medidor, com uma marca em onde o gasto
 * deveria estar a esta altura do mês.
 */

import { formatMoney } from '../../domain/money.ts';
import type { Orcamento } from '../../domain/orcamento.ts';

export function CartaoDisponivel({ orcamento }: { orcamento: Orcamento }) {
  const {
    disponivel, porDia, diasRestantes, emAndamento, saldoInicial, entradas, gastoRealizado, comprometido,
  } = orcamento;
  const negativo = disponivel < 0;

  return (
    <div className="card destaque">
      <span className="rotulo">{negativo ? 'Faltam para fechar o mês' : 'Ainda posso gastar'}</span>
      <span className={`valor num ${negativo ? 'bad' : 'good'}`}>{formatMoney(Math.abs(disponivel))}</span>
      <span className="apoio">
        {!emAndamento ? (
          'Período fora do mês corrente — este é o resultado final dele.'
        ) : negativo ? (
          <>
            O que está marcado já passa do que entra. Cortar {formatMoney(Math.abs(disponivel))} ou adiar alguma
            conta fecha a conta.
          </>
        ) : porDia !== null ? (
          <>
            <strong className="num">{formatMoney(porDia)} por dia</strong> nos {diasRestantes}{' '}
            {diasRestantes === 1 ? 'dia que falta' : 'dias que faltam'}
          </>
        ) : null}
      </span>
      {/* A conta de trás, parcela por parcela: sem ela o número grande é uma
          afirmação para acreditar, e com ela é uma conta para conferir. O saldo
          que abriu o período entra primeiro porque é o que faltava — quem tem
          R$ 4.500 na conta e recebe R$ 4.000 pode gastar R$ 8.500. */}
      <span className="dim" style={{ fontSize: '0.78rem', marginTop: 2 }}>
        {saldoInicial !== 0 && <>{formatMoney(saldoInicial)} já havia · </>}
        {formatMoney(entradas)} {entradas === 0 ? 'entrou' : 'entram'} ·{' '}
        {formatMoney(gastoRealizado)} já saíram · {formatMoney(comprometido)} ainda vão sair
      </span>
    </div>
  );
}

export function MedidorDeRitmo({ orcamento }: { orcamento: Orcamento }) {
  const { gastoRealizado, comprometido, gastoEsperado, desvioDoRitmo, fracaoDecorrida, emAndamento } = orcamento;
  const gastoTotal = gastoRealizado + comprometido;

  if (gastoTotal === 0) {
    return (
      <div className="card medidor">
        <span className="rotulo" style={{ fontSize: '0.74rem', fontWeight: 640, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--text-3)' }}>
          Ritmo do período
        </span>
        <p className="dim" style={{ fontSize: '0.86rem', margin: 0 }}>
          Nenhuma saída registrada ainda — sem gasto não há ritmo para medir.
        </p>
      </div>
    );
  }

  const fracaoGasta = gastoRealizado / gastoTotal;
  const acima = desvioDoRitmo !== null && desvioDoRitmo > 0.1;
  const abaixo = desvioDoRitmo !== null && desvioDoRitmo < -0.1;

  // A cor reforça, mas quem diz o que está acontecendo é a frase e a posição
  // da marca — assim continua legível para quem não distingue as cores.
  const cor = acima ? 'var(--bad)' : abaixo ? 'var(--good)' : 'var(--accent)';

  return (
    <div className="card medidor">
      <span style={{ fontSize: '0.74rem', fontWeight: 640, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--text-3)' }}>
        Ritmo do período
      </span>

      <div>
        <span className="num" style={{ fontSize: '1.15rem', fontWeight: 660 }}>
          {formatMoney(gastoRealizado)}
        </span>{' '}
        <span className="dim" style={{ fontSize: '0.86rem' }}>de {formatMoney(gastoTotal)} previstos</span>
      </div>

      <div
        className="medidor-trilho"
        role="img"
        aria-label={`Já pagou ${formatMoney(gastoRealizado)} de ${formatMoney(gastoTotal)}; a esta altura do período seriam ${formatMoney(gastoEsperado)}.`}
      >
        <span
          className="medidor-preenchido"
          style={{ width: `${Math.min(fracaoGasta * 100, 100)}%`, background: cor }}
        />
        {emAndamento && (
          <span
            className="medidor-marca"
            style={{ left: `calc(${Math.min(fracaoDecorrida * 100, 100)}% - 1px)` }}
            title={`A esta altura: ${formatMoney(gastoEsperado)}`}
          />
        )}
      </div>

      <span className="dim" style={{ fontSize: '0.82rem' }}>
        {desvioDoRitmo === null ? (
          'Ainda não há período decorrido para comparar.'
        ) : acima ? (
          <>
            <strong>{Math.round(desvioDoRitmo * 100)}% acima</strong> do que seria esperado a esta altura
            ({formatMoney(gastoEsperado)}).
          </>
        ) : abaixo ? (
          <>
            <strong>{Math.round(Math.abs(desvioDoRitmo) * 100)}% abaixo</strong> do esperado a esta altura
            ({formatMoney(gastoEsperado)}).
          </>
        ) : (
          <>Em dia com o esperado a esta altura ({formatMoney(gastoEsperado)}).</>
        )}
      </span>

      <span className="medidor-legenda">
        <span>▮ já pago</span>
        <span>│ onde deveria estar hoje</span>
      </span>
    </div>
  );
}
