/**
 * Importar o extrato ou a fatura que o banco exporta em CSV.
 *
 * Diferente da planilha do próprio aplicativo: o arquivo vem de fora, com as
 * colunas do banco. A leitura está em `data/banco-csv.ts` e a comparação com o
 * que já existe, em `domain/conciliacao.ts`.
 *
 * Nada é gravado sem passar por aqui. Cada linha aparece com o veredito e o
 * motivo, e o que parece repetido vem **desmarcado**: um lançamento que faltou
 * a pessoa percebe e adiciona; um duplicado passa despercebido e envenena
 * todos os números.
 */

import { useMemo, useRef, useState } from 'react';

import { formatDate } from '../../domain/date.ts';
import { formatMoney } from '../../domain/money.ts';
import { conciliar, resumirConciliacao, type Proposta } from '../../domain/conciliacao.ts';
import { procurarComprasSemelhantes } from '../../domain/similar.ts';
import {
  FORMATOS_ACEITOS, formatoDoArquivo, lerArquivoDeBanco, lerTextoColado, type LeituraDeArquivo,
} from '../../data/banco.ts';
import { useLookups } from '../../state/selectors.ts';
import { useFinance, type EntryDraft } from '../../state/store.tsx';
import { Dialog, Field } from './primitives.tsx';

const ROTULO_DO_VEREDITO = {
  nova: 'Nova',
  repetida: 'Já existe',
  talvez: 'Em dúvida',
} as const;

export function ImportarDoBanco({ onClose }: { onClose: () => void }) {
  const { data, api } = useFinance();
  const { accounts, categories } = useLookups();

  const ativas = accounts.filter((conta) => !conta.archived);
  const [accountId, setAccountId] = useState(ativas[0]?.id ?? '');
  const [leitura, setLeitura] = useState<LeituraDeArquivo | null>(null);
  const [lendo, setLendo] = useState<'arquivo' | 'pdf' | 'imagem' | null>(null);
  const [progresso, setProgresso] = useState(0);
  const [colando, setColando] = useState(false);
  const [colado, setColado] = useState('');
  const [nomeArquivo, setNomeArquivo] = useState('');
  const [erro, setErro] = useState('');
  const [marcadas, setMarcadas] = useState<Set<number>>(new Set());
  const [categoriaPorLinha, setCategoriaPorLinha] = useState<Record<number, string | null>>({});
  // Quantas vezes cada linha deve virar. 1 = lançamento avulso, como sempre foi.
  const [parcelasPorLinha, setParcelasPorLinha] = useState<Record<number, number>>({});
  // Vindo do extrato, o dinheiro já saiu — mas quem diz que pagou é você.
  const [marcarComoPagos, setMarcarComoPagos] = useState(false);
  const [importados, setImportados] = useState<{ lancamentos: number; compras: number } | null>(null);
  const arquivo = useRef<HTMLInputElement>(null);

  const conta = accounts.find((c) => c.id === accountId);
  // Fatura de cartão vem com tudo positivo. Sem isto, importar uma fatura
  // criaria um mês inteiro de receita que nunca existiu.
  const [tudoEhGasto, setTudoEhGasto] = useState(false);
  const cartao = conta?.kind === 'credit_card';
  const gastoEfetivo = tudoEhGasto || (cartao && !(leitura?.linhas ?? []).some((l) => l.valor < 0));

  const propostas = useMemo<Proposta[]>(
    () => (leitura ? conciliar(data.entries, leitura.linhas, { accountId, tudoEhGasto: gastoEfetivo }) : []),
    [leitura, data.entries, accountId, gastoEfetivo],
  );

  const resumo = resumirConciliacao(propostas);

  /**
   * O miolo, comum a todos os formatos.
   *
   * Convergir aqui é o que faz a conferência, a detecção de repetidos e o
   * reconhecimento de parcelas valerem para CSV, planilha, PDF, print e texto
   * colado sem uma linha a mais.
   */
  function aoLerLeitura(lido: LeituraDeArquivo) {
        setLeitura(lido);
        // Só o que é novo entra marcado; repetido e em dúvida ficam de fora
        // até a pessoa olhar. Uma linha que o banco marcou como parcela de uma
        // compra que já está cadastrada também: importá-la criaria as N
        // parcelas em dobro.
        const novas = conciliar(data.entries, lido.linhas, { accountId, tudoEhGasto: gastoEfetivo })
          .filter((p) => {
            if (p.veredito !== 'nova') return false;
            const vezes = p.parcela?.total ?? 1;
            if (vezes <= 1) return true;
            return (
              procurarComprasSemelhantes(data.purchases, {
                description: p.linha.descricao,
                totalAmount: p.valorAbsoluto * vezes,
                installments: vezes,
                firstDate: p.linha.data,
              }).length === 0
            );
          })
          .map((p) => p.linha.linha);
        setMarcadas(new Set(novas));
        setCategoriaPorLinha({});
        setParcelasPorLinha({});
  }

  async function aoLer(file: File) {
    setErro('');
    setNomeArquivo(file.name);
    setLeitura(null);
    const formato = formatoDoArquivo(file.name, file.type);
    // O PDF baixa o leitor e o print baixa o modelo de idioma: sem dizer o que
    // está acontecendo, a tela parece travada por até um minuto no celular.
    setLendo(formato === 'imagem' ? 'imagem' : formato === 'pdf' ? 'pdf' : 'arquivo');
    setProgresso(0);
    try {
      aoLerLeitura(await lerArquivoDeBanco(file, setProgresso));
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : 'Não foi possível ler o arquivo.');
    } finally {
      setLendo(null);
    }
  }

  function aoColar() {
    setErro('');
    setNomeArquivo('texto colado');
    try {
      const lido = lerTextoColado(colado);
      if (lido.linhas.length === 0) {
        setErro(
          'Não achei nenhum lançamento nesse texto. Cada linha precisa ter uma data e um valor '
          + 'com centavos — por exemplo: 07/09/2026 MERCADO 145,30',
        );
        return;
      }
      aoLerLeitura(lido);
      setColando(false);
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : 'Não foi possível ler o texto.');
    }
  }

  function alternar(numero: number) {
    setMarcadas((atual) => {
      const proxima = new Set(atual);
      if (proxima.has(numero)) proxima.delete(numero);
      else proxima.add(numero);
      return proxima;
    });
  }

  /** Quantas parcelas a linha vira: o que a pessoa escolheu, ou o que o banco escreveu. */
  function vezesDe(proposta: Proposta): number {
    return parcelasPorLinha[proposta.linha.linha] ?? proposta.parcela?.total ?? 1;
  }

  function importar() {
    const escolhidas = propostas.filter((p) => marcadas.has(p.linha.linha));
    const avulsos: EntryDraft[] = [];
    let compras = 0;

    for (const p of escolhidas) {
      const categoryId = categoriaPorLinha[p.linha.linha] ?? p.categoriaSugerida;
      const vezes = vezesDe(p);

      if (vezes > 1) {
        // O valor da linha é o de **uma** parcela — é o que o extrato do
        // cartão mostra no mês. O total da compra é ele vezes o número de
        // parcelas, e as demais nascem nos meses seguintes.
        api.addPurchase({
          description: p.linha.descricao,
          totalAmount: p.valorAbsoluto * vezes,
          installments: vezes,
          firstDate: p.linha.data,
          accountId,
          categoryId,
        });
        compras += 1;
        continue;
      }

      avulsos.push({
        date: p.linha.data,
        description: p.linha.descricao,
        amount: p.valorAbsoluto,
        kind: p.kind,
        accountId,
        toAccountId: null,
        categoryId,
        status: marcarComoPagos ? 'settled' : 'pending',
        recurringId: null,
        occurrenceDate: null,
        purchaseId: null,
        installmentNumber: null,
        installmentTotal: null,
      });
    }

    setImportados({ lancamentos: api.importEntries(avulsos), compras });
  }

  return (
    <Dialog
      title="Importar do banco"
      onClose={onClose}
      larga
      footer={
        <>
          <span className="spacer" />
          <button type="button" className="btn ghost" onClick={onClose}>
            {importados === null ? 'Cancelar' : 'Fechar'}
          </button>
          {importados === null && marcadas.size > 0 && (
            <button type="button" className="btn primary" onClick={importar}>
              Importar {marcadas.size} {marcadas.size === 1 ? 'linha' : 'linhas'}
            </button>
          )}
        </>
      }
    >
      {importados !== null ? (
        <div className="banner">
          <span className="emoji" aria-hidden="true">
            ✅
          </span>
          <span>
            <strong>
              {[
                importados.lancamentos > 0 &&
                  `${importados.lancamentos} ${importados.lancamentos === 1 ? 'lançamento importado' : 'lançamentos importados'}`,
                importados.compras > 0 &&
                  `${importados.compras} ${importados.compras === 1 ? 'compra parcelada criada' : 'compras parceladas criadas'}`,
              ]
                .filter(Boolean)
                .join(' e ')}{' '}
              em {conta?.name}
            </strong>
            <br />
            <span className="dim">
              {marcarComoPagos
                ? 'Entraram como já pagos. '
                : 'Entraram como previstos — marque no ✓ da lista o que já foi pago. '}
              Já aparecem no painel e sobem na próxima sincronização.
            </span>
          </span>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p className="muted" style={{ fontSize: '0.88rem' }}>
            Exporte o extrato ou a fatura em CSV pelo aplicativo do banco e mande o arquivo aqui. O app descobre
            sozinho as colunas e compara com o que você já lançou, para não entrar nada duas vezes.
          </p>

          <div className="grid cols-2">
            <Field label="Lançar na conta">
              {(id) => (
                <select
                  id={id}
                  className="input select"
                  value={accountId}
                  onChange={(event) => setAccountId(event.target.value)}
                >
                  {ativas.map((outra) => (
                    <option key={outra.id} value={outra.id}>
                      {outra.name}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <div className="field">
              <label className="switch" style={{ marginTop: 22 }}>
                <input type="checkbox" checked={gastoEfetivo} onChange={(e) => setTudoEhGasto(e.target.checked)} />
                <span>
                  Tudo é gasto
                  <span className="hint" style={{ display: 'block' }}>
                    Marque para fatura de cartão, onde os valores vêm sem sinal.
                  </span>
                </span>
              </label>
              <label className="switch" style={{ marginTop: 10 }}>
                <input
                  type="checkbox"
                  checked={marcarComoPagos}
                  onChange={(e) => setMarcarComoPagos(e.target.checked)}
                />
                <span>
                  Marcar como já pagos
                  <span className="hint" style={{ display: 'block' }}>
                    Desmarcado, tudo entra como previsto e você confirma no ✓ da lista. Marque se o extrato já é
                    prova de que o dinheiro saiu.
                  </span>
                </span>
              </label>
            </div>
          </div>

          <div className="row wrap">
            <button type="button" className="btn" disabled={lendo !== null} onClick={() => arquivo.current?.click()}>
              📄 Escolher arquivo
            </button>
            <button type="button" className="btn" disabled={lendo !== null} onClick={() => setColando((c) => !c)}>
              📋 Colar texto
            </button>
            {nomeArquivo && !colando && <span className="dim trunc">{nomeArquivo}</span>}
          </div>
          <p className="hint">Aceita {FORMATOS_ACEITOS}.</p>
          <input
            ref={arquivo}
            type="file"
            accept=".csv,.txt,.xlsx,.xlsm,.pdf,image/*,text/csv,application/pdf"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void aoLer(file);
              event.target.value = '';
            }}
          />

          {/* Colar resolve o que nenhum arquivo resolve: o aplicativo do banco
              que não exporta nada, mas de onde dá para copiar a lista. */}
          {colando && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <textarea
                className="input"
                style={{ minHeight: '9rem', fontFamily: 'ui-monospace, monospace', fontSize: '0.8rem' }}
                placeholder={'07/09/2026 MERCADO BOM PRECO 145,30\n08/09/2026 UBER 21,40'}
                value={colado}
                onChange={(e) => setColado(e.target.value)}
                spellCheck={false}
              />
              <div className="row wrap" style={{ gap: 8 }}>
                <button type="button" className="btn primary sm" disabled={!colado.trim()} onClick={aoColar}>
                  Ler o texto
                </button>
                <span className="hint">Uma linha por lançamento, com data e valor. O resto vira a descrição.</span>
              </div>
            </div>
          )}

          {lendo && (
            <div className="banner">
              <span className="emoji" aria-hidden="true">⏳</span>
              <span>
                <strong>
                  {lendo === 'imagem'
                    ? `Lendo o texto da imagem${progresso > 0 ? ` — ${Math.round(progresso * 100)}%` : ''}`
                    : lendo === 'pdf'
                      ? 'Abrindo o PDF'
                      : 'Lendo o arquivo'}
                </strong>
                {lendo === 'imagem' && (
                  <>
                    <br />
                    <span className="dim">
                      Na primeira vez o app baixa o reconhecedor de texto em português, o que pede
                      internet e leva um pouco. Depois disso fica no aparelho.
                    </span>
                  </>
                )}
              </span>
            </div>
          )}

          {erro && <p className="error">{erro}</p>}

          {/* Reconhecimento de texto erra, e erra em dígito — que é o pior
              lugar para errar. A conferência linha a linha já existe logo
              abaixo; o aviso é para ninguém confiar no automático. */}
          {leitura?.formatoDeEntrada === 'imagem' && leitura.linhas.length > 0 && (
            <div className="banner warn">
              <span className="emoji" aria-hidden="true">👀</span>
              <span>
                <strong>Confira valor por valor antes de importar</strong>
                <br />
                <span className="dim">
                  Isto veio de leitura de imagem, que troca dígito de vez em quando. O que estiver
                  errado, desmarque e lance à mão.
                </span>
              </span>
            </div>
          )}

          {leitura && leitura.ignoradas > 0 && (
            <p className="hint">
              {leitura.ignoradas === 1 ? '1 linha não parecia lançamento' : `${leitura.ignoradas} linhas não pareciam lançamento`}{' '}
              (cabeçalho, rodapé, saldo) e {leitura.ignoradas === 1 ? 'foi ignorada' : 'foram ignoradas'}.
            </p>
          )}

          {leitura?.formato && (
            <p className="hint">
              Li usando <strong>{leitura.formato.colunaData}</strong> como data,{' '}
              <strong>{leitura.formato.colunaDescricao}</strong> como descrição e{' '}
              <strong>{leitura.formato.colunaValor}</strong> como valor.
            </p>
          )}

          {leitura && leitura.problemas.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div className="setting-text">
                <div className="title">
                  {leitura.problemas.length === 1 ? '1 linha ficou de fora' : `${leitura.problemas.length} linhas ficaram de fora`}
                </div>
              </div>
              <div style={{ maxHeight: '8rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                {leitura.problemas.slice(0, 30).map((problema) => (
                  <p key={`${problema.linha}-${problema.motivo}`} className="dim" style={{ fontSize: '0.82rem' }}>
                    {problema.linha > 0 ? `Linha ${problema.linha}: ` : ''}
                    {problema.motivo}
                  </p>
                ))}
              </div>
            </div>
          )}

          {propostas.length > 0 && (
            <>
              <div className="grid contadores">
                <div className="card stat">
                  <span className="stat-label">Novos</span>
                  <span className="stat-value sm num">{resumo.novas}</span>
                </div>
                <div className="card stat">
                  <span className="stat-label">Já existem</span>
                  <span className="stat-value sm num">{resumo.repetidas}</span>
                </div>
                <div className="card stat">
                  <span className="stat-label">Em dúvida</span>
                  <span className={`stat-value sm num ${resumo.talvez > 0 ? 'bad' : ''}`}>{resumo.talvez}</span>
                </div>
              </div>

              <p className="hint">
                {resumo.repetidas + resumo.talvez > 0 &&
                  'O que já parece existir vem desmarcado — confira e marque se, mesmo assim, for outro lançamento. '}
                Em <strong>Vezes</strong>, diga em quantas parcelas a compra foi feita: o valor da linha é o de uma
                parcela, e as demais nascem nos meses seguintes. Quando o banco escreve &ldquo;1/6&rdquo;, o número
                já vem preenchido.
              </p>

              <div className="table-wrap" style={{ maxHeight: '22rem', overflowY: 'auto' }}>
                <table className="table tabela-extrato">
                  <thead>
                    <tr>
                      <th style={{ width: 34 }} />
                      <th>Data</th>
                      <th>Descrição</th>
                      <th className="right">Valor</th>
                      <th className="right">Vezes</th>
                      <th>Categoria</th>
                    </tr>
                  </thead>
                  <tbody>
                    {propostas.map((proposta) => {
                      const numero = proposta.linha.linha;
                      const escolhida = categoriaPorLinha[numero] ?? proposta.categoriaSugerida;
                      const vezes = vezesDe(proposta);
                      // Uma compra parcelada igual já cadastrada: importar de
                      // novo criaria as N parcelas em dobro.
                      const jaExisteCompra =
                        vezes > 1 &&
                        procurarComprasSemelhantes(data.purchases, {
                          description: proposta.linha.descricao,
                          totalAmount: proposta.valorAbsoluto * vezes,
                          installments: vezes,
                          firstDate: proposta.linha.data,
                        }).length > 0;
                      return (
                        <tr key={numero} style={marcadas.has(numero) ? undefined : { opacity: 0.55 }}>
                          <td>
                            <input
                              type="checkbox"
                              checked={marcadas.has(numero)}
                              onChange={() => alternar(numero)}
                              aria-label={`Importar ${proposta.linha.descricao}`}
                            />
                          </td>
                          <td className="num">{formatDate(proposta.linha.data)}</td>
                          {/* O veredito vem junto da descrição, e não numa coluna
                              própria: numa tabela dentro de um diálogo, a sexta
                              coluna já não cabe na tela. */}
                          <td style={{ minWidth: 0 }}>
                            <div className="trunc">{proposta.linha.descricao}</div>
                            {proposta.veredito !== 'nova' && (
                              <div className="dim trunc" style={{ fontSize: '0.74rem' }} title={proposta.motivo}>
                                {ROTULO_DO_VEREDITO[proposta.veredito]} · {proposta.motivo}
                              </div>
                            )}
                          </td>
                          <td className={`right num ${proposta.kind === 'income' ? 'good' : 'bad'}`}>
                            {proposta.kind === 'income' ? '+' : '−'}
                            {formatMoney(proposta.valorAbsoluto)}
                            {vezes > 1 && (
                              <div className="dim" style={{ fontSize: '0.74rem' }}>
                                total {formatMoney(proposta.valorAbsoluto * vezes)}
                              </div>
                            )}
                          </td>
                          <td className="right" data-rotulo="Vezes">
                            <input
                              type="number"
                              className="input sm"
                              min={1}
                              max={120}
                              value={vezes}
                              style={{ width: '4rem', textAlign: 'right' }}
                              aria-label={`Em quantas vezes: ${proposta.linha.descricao}`}
                              onChange={(event) =>
                                setParcelasPorLinha((atual) => ({
                                  ...atual,
                                  [numero]: Math.min(120, Math.max(1, Number(event.target.value) || 1)),
                                }))
                              }
                            />
                            {jaExisteCompra && (
                              <div className="dim" style={{ fontSize: '0.72rem' }}>
                                já cadastrada
                              </div>
                            )}
                          </td>
                          <td>
                            <select
                              className="input select sm"
                              value={escolhida ?? ''}
                              onChange={(event) =>
                                setCategoriaPorLinha((atual) => ({ ...atual, [numero]: event.target.value || null }))
                              }
                              aria-label={`Categoria de ${proposta.linha.descricao}`}
                            >
                              <option value="">Sem categoria</option>
                              {categories
                                .filter((c) => !c.archived && c.kind === (proposta.kind === 'income' ? 'income' : 'expense'))
                                .map((categoria) => (
                                  <option key={categoria.id} value={categoria.id}>
                                    {categoria.emoji} {categoria.name}
                                  </option>
                                ))}
                            </select>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </Dialog>
  );
}
