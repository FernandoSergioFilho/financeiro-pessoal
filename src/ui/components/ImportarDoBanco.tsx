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
import { lerCsvDeBanco, type LeituraBanco } from '../../data/banco-csv.ts';
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
  const [leitura, setLeitura] = useState<LeituraBanco | null>(null);
  const [nomeArquivo, setNomeArquivo] = useState('');
  const [erro, setErro] = useState('');
  const [marcadas, setMarcadas] = useState<Set<number>>(new Set());
  const [categoriaPorLinha, setCategoriaPorLinha] = useState<Record<number, string | null>>({});
  const [importados, setImportados] = useState<number | null>(null);
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

  function aoLer(file: File) {
    setErro('');
    setNomeArquivo(file.name);
    void file
      .text()
      .then((texto) => {
        const lido = lerCsvDeBanco(texto);
        setLeitura(lido);
        // Só o que é novo entra marcado; repetido e em dúvida ficam de fora
        // até a pessoa olhar.
        const novas = conciliar(data.entries, lido.linhas, { accountId, tudoEhGasto: gastoEfetivo })
          .filter((p) => p.veredito === 'nova')
          .map((p) => p.linha.linha);
        setMarcadas(new Set(novas));
        setCategoriaPorLinha({});
      })
      .catch((e: unknown) => setErro(e instanceof Error ? e.message : 'Não foi possível ler o arquivo.'));
  }

  function alternar(numero: number) {
    setMarcadas((atual) => {
      const proxima = new Set(atual);
      if (proxima.has(numero)) proxima.delete(numero);
      else proxima.add(numero);
      return proxima;
    });
  }

  function importar() {
    const drafts: EntryDraft[] = propostas
      .filter((p) => marcadas.has(p.linha.linha))
      .map((p) => ({
        date: p.linha.data,
        description: p.linha.descricao,
        amount: p.valorAbsoluto,
        kind: p.kind,
        accountId,
        toAccountId: null,
        categoryId: categoriaPorLinha[p.linha.linha] ?? p.categoriaSugerida,
        status: 'settled',
        recurringId: null,
        occurrenceDate: null,
        purchaseId: null,
        installmentNumber: null,
        installmentTotal: null,
      }));
    setImportados(api.importEntries(drafts));
  }

  return (
    <Dialog
      title="Importar do banco"
      onClose={onClose}
      wide
      footer={
        <>
          <span className="spacer" />
          <button type="button" className="btn ghost" onClick={onClose}>
            {importados === null ? 'Cancelar' : 'Fechar'}
          </button>
          {importados === null && marcadas.size > 0 && (
            <button type="button" className="btn primary" onClick={importar}>
              Importar {marcadas.size} {marcadas.size === 1 ? 'lançamento' : 'lançamentos'}
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
              {importados} {importados === 1 ? 'lançamento importado' : 'lançamentos importados'} em {conta?.name}
            </strong>
            <br />
            <span className="dim">Já aparecem no painel e sobem na próxima sincronização.</span>
          </span>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p className="muted" style={{ fontSize: '0.88rem' }}>
            Exporte o extrato ou a fatura em CSV pelo aplicativo do banco e mande o arquivo aqui. O app descobre
            sozinho o separador e as colunas de data, descrição e valor — e compara com o que você já lançou, para
            não entrar nada duas vezes.
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
            </div>
          </div>

          <div className="row wrap">
            <button type="button" className="btn" onClick={() => arquivo.current?.click()}>
              📄 Escolher arquivo
            </button>
            {nomeArquivo && <span className="dim trunc">{nomeArquivo}</span>}
          </div>
          <input
            ref={arquivo}
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) aoLer(file);
              event.target.value = '';
            }}
          />

          {erro && <p className="error">{erro}</p>}

          {leitura?.formato && (
            <p className="hint">
              Li o arquivo separado por <strong>{leitura.formato.separador}</strong>, usando as colunas{' '}
              <strong>{leitura.formato.colunaData}</strong>, <strong>{leitura.formato.colunaDescricao}</strong> e{' '}
              <strong>{leitura.formato.colunaValor}</strong>.
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

              {resumo.repetidas + resumo.talvez > 0 && (
                <p className="hint">
                  O que já parece existir vem desmarcado. Confira e marque se, mesmo assim, for um lançamento
                  diferente — duas compras iguais no mesmo dia acontecem.
                </p>
              )}

              <div className="table-wrap" style={{ maxHeight: '22rem', overflowY: 'auto' }}>
                <table className="table tabela-extrato">
                  <thead>
                    <tr>
                      <th style={{ width: 34 }} />
                      <th>Data</th>
                      <th>Descrição</th>
                      <th className="right">Valor</th>
                      <th>Categoria</th>
                    </tr>
                  </thead>
                  <tbody>
                    {propostas.map((proposta) => {
                      const numero = proposta.linha.linha;
                      const escolhida = categoriaPorLinha[numero] ?? proposta.categoriaSugerida;
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
