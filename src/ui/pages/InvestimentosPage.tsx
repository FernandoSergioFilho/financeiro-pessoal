/**
 * A guia de investimentos: aportar, retirar e registrar rendimento.
 *
 * Três botões e uma conta que fecha. A regra que sustenta a tela está em
 * `domain/investimentos.ts`, e vale repetir aqui porque é o que a pessoa vê:
 * **o rendimento não entra no caixa do mês**. Ele engorda o patrimônio e vira
 * dinheiro no dia do resgate — que é uma retirada, e essa sim aparece no fluxo.
 *
 * A identidade `saldo = abertura + aportado − retirado + rendimento` fica
 * escrita na tela, e não só no teste: é ela que deixa conferir com o extrato da
 * corretora sem precisar acreditar no app.
 */

import { useMemo, useState } from 'react';

import { formatDate, today } from '../../domain/date.ts';
import {
  ROTULOS, resumoGeralDeInvestimentos, type MovimentoDeInvestimento,
} from '../../domain/investimentos.ts';
import { formatMoney } from '../../domain/money.ts';
import { INICIO_DOS_TEMPOS, FIM_DOS_TEMPOS } from '../../domain/period.ts';
import type { Account } from '../../domain/types.ts';
import { entriesInRange, useLookups } from '../../state/selectors.ts';
import { useFinance } from '../../state/store.tsx';
import { EntryList } from '../components/EntryList.tsx';
import { Card, Dialog, EmptyState, Field, MoneyInput } from '../components/primitives.tsx';
import type { IrPara } from '../navegacao.ts';

export function InvestimentosPage({ irPara }: { irPara: IrPara }) {
  const { data } = useFinance();
  const { accounts } = useLookups();
  const [movimento, setMovimento] = useState<{ tipo: MovimentoDeInvestimento; conta: Account } | null>(null);

  // Tudo, desde sempre: um investimento é um acumulado, e olhar só o mês
  // aberto mostraria saldo zero em toda conta que não recebeu aporte agora.
  const tudo = useMemo(() => entriesInRange(data, INICIO_DOS_TEMPOS, FIM_DOS_TEMPOS), [data]);
  const geral = useMemo(() => resumoGeralDeInvestimentos(accounts, tudo), [accounts, tudo]);

  const doInvestimento = useMemo(() => {
    const ids = new Set(geral.contas.map((c) => c.conta.id));
    return tudo
      .filter((e) => ids.has(e.accountId) || (e.toAccountId ? ids.has(e.toAccountId) : false))
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 40);
  }, [geral.contas, tudo]);

  if (geral.contas.length === 0) {
    return (
      <Card>
        <EmptyState
          emoji="📈"
          title="Nenhuma conta de investimento"
          action={
            <button type="button" className="btn primary" onClick={() => irPara({ pagina: 'ajustes' })}>
              Cadastrar em Ajustes
            </button>
          }
        >
          Cadastre a conta da corretora, do Tesouro ou do CDB em Ajustes, marcando o tipo
          <strong> Investimento</strong>. Ela aparece aqui, separada do dinheiro do dia a dia.
        </EmptyState>
      </Card>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="grid cols-4 keep">
        <div className="card stat">
          <span className="stat-label">Investido hoje</span>
          <span className="stat-value num">{formatMoney(geral.saldo)}</span>
          <span className="stat-hint">Fora do caixa do mês</span>
        </div>
        <div className="card stat">
          <span className="stat-label">Já aportado</span>
          <span className="stat-value sm num">{formatMoney(geral.aportado)}</span>
          <span className="stat-hint">Saiu da conta e veio para cá</span>
        </div>
        <div className="card stat">
          <span className="stat-label">Já resgatado</span>
          <span className="stat-value sm num">{formatMoney(geral.retirado)}</span>
          <span className="stat-hint">Voltou para a conta</span>
        </div>
        <div className="card stat">
          <span className="stat-label">Rendimento</span>
          <span className={`stat-value sm num ${geral.rendimento < 0 ? 'bad' : 'good'}`}>
            {formatMoney(geral.rendimento)}
          </span>
          <span className="stat-hint">Só vira dinheiro ao resgatar</span>
        </div>
      </div>

      <Card title="Suas contas">
        <div className="lista-investimentos">
          {geral.contas.map((r) => (
            <div key={r.conta.id} className="investimento">
              <div className="row wrap" style={{ gap: 8, alignItems: 'baseline' }}>
                <strong style={{ fontSize: '1rem' }}>{r.conta.name}</strong>
                {r.conta.institution && <span className="dim">{r.conta.institution}</span>}
                <span className="spacer" />
                <span className="num" style={{ fontSize: '1.1rem', fontWeight: 620 }}>
                  {formatMoney(r.saldo)}
                </span>
              </div>

              {/* A conta que fecha, à vista: é ela que deixa conferir com o
                  extrato da corretora sem precisar acreditar no app. */}
              <p className="hint" style={{ margin: '4px 0 0' }}>
                {formatMoney(r.conta.openingBalance)} de abertura + {formatMoney(r.aportado)} aportado −{' '}
                {formatMoney(r.retirado)} resgatado{' '}
                {r.rendimento < 0 ? '−' : '+'} {formatMoney(Math.abs(r.rendimento))} de rendimento
                {r.retorno !== null && (
                  <> · rendeu <strong>{(r.retorno * 100).toFixed(1).replace('.', ',')}%</strong> sobre o aportado</>
                )}
              </p>

              <div className="row wrap" style={{ gap: 8, marginTop: 8 }}>
                {(['aporte', 'retirada', 'rendimento'] as MovimentoDeInvestimento[]).map((tipo) => (
                  <button
                    key={tipo}
                    type="button"
                    className={tipo === 'aporte' ? 'btn primary sm' : 'btn sm'}
                    onClick={() => setMovimento({ tipo, conta: r.conta })}
                  >
                    {ROTULOS[tipo].titulo}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Movimentos">
        {doInvestimento.length === 0 ? (
          <p className="hint">Nada ainda. Comece por um aporte.</p>
        ) : (
          <EntryList entries={doInvestimento} onOpen={() => undefined} />
        )}
      </Card>

      {movimento && (
        <DialogoDeMovimento
          tipo={movimento.tipo}
          conta={movimento.conta}
          onClose={() => setMovimento(null)}
        />
      )}
    </div>
  );
}

/**
 * O formulário dos três movimentos.
 *
 * É um só porque os três têm os mesmos campos — valor, data, observação —, e
 * o que muda é para onde o lançamento vai. Três diálogos separados seriam três
 * lugares para o mesmo defeito aparecer.
 */
function DialogoDeMovimento({
  tipo,
  conta,
  onClose,
}: {
  tipo: MovimentoDeInvestimento;
  conta: Account;
  onClose: () => void;
}) {
  const { api } = useFinance();
  const { accounts } = useLookups();

  // De onde sai o aporte, ou para onde volta o resgate: só contas de caixa.
  const deCaixa = accounts.filter((c) => !c.archived && ['checking', 'savings', 'cash'].includes(c.kind));
  const [contraparte, setContraparte] = useState(deCaixa[0]?.id ?? '');
  const [valor, setValor] = useState(0);
  const [date, setDate] = useState(today());
  const [descricao, setDescricao] = useState('');
  const [erro, setErro] = useState('');

  const precisaDeConta = tipo !== 'rendimento';

  function gravar() {
    if (valor <= 0) { setErro('Informe um valor maior que zero.'); return; }
    if (precisaDeConta && !contraparte) { setErro('Escolha a conta de onde o dinheiro sai ou para onde volta.'); return; }

    const comum = {
      date,
      amount: valor,
      categoryId: null,
      status: 'settled' as const,
      recurringId: null,
      occurrenceDate: null,
      purchaseId: null,
      installmentNumber: null,
      installmentTotal: null,
    };

    if (tipo === 'rendimento') {
      api.addEntry({
        ...comum,
        // Entrada na conta de investimento. Negativa vira saída, que é a taxa.
        kind: 'income',
        description: descricao.trim() || 'Rendimento',
        accountId: conta.id,
        toAccountId: null,
      });
    } else {
      const aportando = tipo === 'aporte';
      api.addEntry({
        ...comum,
        kind: 'transfer',
        description: descricao.trim() || (aportando ? 'Aporte' : 'Resgate'),
        accountId: aportando ? contraparte : conta.id,
        toAccountId: aportando ? conta.id : contraparte,
      });
    }
    onClose();
  }

  return (
    <Dialog
      title={`${ROTULOS[tipo].titulo} — ${conta.name}`}
      onClose={onClose}
      footer={
        <>
          <span className="spacer" />
          <button type="button" className="btn ghost" onClick={onClose}>Cancelar</button>
          <button type="button" className="btn primary" onClick={gravar}>
            {ROTULOS[tipo].titulo}
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <p className="hint" style={{ margin: 0 }}>{ROTULOS[tipo].ajuda}</p>

        <div className="grid cols-2">
          <Field label="Valor">
            {(id) => <MoneyInput id={id} value={valor} onChange={(c) => setValor(c ?? 0)} />}
          </Field>
          <Field label="Data">
            {(id) => (
              <input id={id} type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
            )}
          </Field>
        </div>

        {precisaDeConta && (
          <Field label={tipo === 'aporte' ? 'Sai da conta' : 'Volta para a conta'}>
            {(id) => (
              <select id={id} className="input" value={contraparte} onChange={(e) => setContraparte(e.target.value)}>
                {deCaixa.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            )}
          </Field>
        )}

        <Field label="Observação">
          {(id) => (
            <input
              id={id}
              className="input"
              placeholder={tipo === 'rendimento' ? 'Rendimento de setembro' : 'Opcional'}
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
            />
          )}
        </Field>

        {tipo === 'rendimento' && (
          <div className="banner">
            <span className="emoji" aria-hidden="true">💡</span>
            <span className="dim">
              Para lançar uma <strong>taxa</strong> (custódia, corretagem), registre o rendimento do
              mês já descontado dela — ou lance a taxa como um rendimento negativo em outro mês.
            </span>
          </div>
        )}

        {erro && <p className="error">{erro}</p>}
        <p className="hint" style={{ margin: 0 }}>
          Entra com a data de {formatDate(date)}.
        </p>
      </div>
    </Dialog>
  );
}
