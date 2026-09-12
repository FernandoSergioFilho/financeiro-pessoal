/** Contas, categorias, aparência e o que fazer com os dados. */

import { useMemo, useRef, useState, type FormEvent } from 'react';

import { descreverUso, limparComprasOrfas, moverConta, usoDaConta } from '../../domain/accounts.ts';
import { today } from '../../domain/date.ts';
import { descreverCopia, rotuloDoMotivo, type Copia } from '../../domain/backup.ts';
import { corrigirNomesDeParcelas, parcelasComNomeErrado } from '../../domain/installments.ts';
import { desmarcarTodosComoPagos, quantosEstaoPagos } from '../../domain/pagamentos.ts';
import { agruparPorInstituicao, instituicoesConhecidas, sugerirInstituicao } from '../../domain/institutions.ts';
import { contarDuplicados, juntarDuplicados } from '../../domain/duplicates.ts';
import { formatMoney } from '../../domain/money.ts';
import { accountBalance } from '../../domain/summary.ts';
import { SERIES_COLORS, type Account, type AccountKind, type Category, type SeriesColor } from '../../domain/types.ts';
import { categoriasPadraoQueFaltam } from '../../data/seed.ts';
import {
  chaveDeNome,
  csvToEntries,
  downloadCsv,
  downloadJson,
  entriesToCsv,
  readBackup,
  type ResultadoImportacao,
} from '../../data/exchange.ts';
import { rotuloDoPeriodo, type Periodo } from '../../domain/period.ts';
import { useLookups, usePeriodEntries } from '../../state/selectors.ts';
import { useFinance } from '../../state/store.tsx';
import { Card, ConfirmDialog, Dialog, Dot, Field, MoneyInput, colorVar } from '../components/primitives.tsx';
import { CloudPanel } from '../components/CloudPanel.tsx';
import { ImportarDoBanco } from '../components/ImportarDoBanco.tsx';
import type { IrPara } from '../navegacao.ts';
import { procurarAtualizacao } from '../atualizacao.ts';
import type { ThemeChoice } from '../theme.ts';
import { VERSAO_DO_APP } from '../../versao.ts';

const ACCOUNT_KINDS: { value: AccountKind; label: string }[] = [
  { value: 'checking', label: 'Conta corrente' },
  { value: 'savings', label: 'Poupança' },
  { value: 'cash', label: 'Dinheiro' },
  { value: 'credit_card', label: 'Cartão de crédito' },
  { value: 'investment', label: 'Investimento' },
];

function ColorPicker({ value, onChange }: { value: SeriesColor; onChange: (color: SeriesColor) => void }) {
  return (
    <div className="row wrap" style={{ gap: 6 }}>
      {SERIES_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          aria-label={color}
          aria-pressed={color === value}
          onClick={() => onChange(color)}
          style={{
            width: 26,
            height: 26,
            borderRadius: 8,
            cursor: 'pointer',
            background: colorVar(color),
            border: color === value ? '2px solid var(--text)' : '2px solid transparent',
          }}
        />
      ))}
    </div>
  );
}

function AccountDialog({ account, onClose }: { account?: Account; onClose: () => void }) {
  const { data, api } = useFinance();
  const [name, setName] = useState(account?.name ?? '');
  const [kind, setKind] = useState<AccountKind>(account?.kind ?? 'checking');
  const [opening, setOpening] = useState<number | null>(account?.openingBalance ?? 0);
  const [color, setColor] = useState<SeriesColor>(account?.color ?? 'blue');
  const [closingDay, setClosingDay] = useState(account?.closingDay ?? 25);
  const [dueDay, setDueDay] = useState(account?.dueDay ?? 5);
  const [institution, setInstitution] = useState(account?.institution ?? '');
  const [error, setError] = useState('');

  const conhecidas = useMemo(() => instituicoesConhecidas(data.accounts), [data.accounts]);
  // Oferecido, nunca aplicado sozinho: adivinhar e gravar calado foi como o
  // app acabou com contas repetidas antes.
  const palpite = useMemo(
    () => (institution.trim() ? null : sugerirInstituicao(data.accounts, name, { ignorar: account?.id })),
    [data.accounts, name, institution, account?.id],
  );

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return setError('Dê um nome à conta.');
    const draft = {
      name: name.trim(),
      kind,
      openingBalance: opening ?? 0,
      color,
      institution: institution.trim() || null,
      closingDay: kind === 'credit_card' ? closingDay : null,
      dueDay: kind === 'credit_card' ? dueDay : null,
    };
    if (account) api.updateAccount(account.id, draft);
    else api.addAccount(draft);
    onClose();
  }

  return (
    <Dialog
      title={account ? 'Editar conta' : 'Nova conta'}
      onClose={onClose}
      footer={
        <>
          <span className="spacer" />
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" form="account-form" className="btn primary">
            Salvar
          </button>
        </>
      }
    >
      <form id="account-form" onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label="Nome" error={error}>
          {(id) => (
            <input id={id} className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
          )}
        </Field>
        <div className="grid cols-2">
          <Field label="Tipo">
            {(id) => (
              <select id={id} className="input select" value={kind} onChange={(e) => setKind(e.target.value as AccountKind)}>
                {ACCOUNT_KINDS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Saldo inicial" hint="Quanto havia quando você começou a controlar aqui">
            {(id) => <MoneyInput id={id} value={opening} onChange={setOpening} />}
          </Field>
        </div>

        <Field
          label="Banco"
          hint={
            palpite ? (
              <>
                Junta esta conta e o cartão do mesmo banco numa linha só.{' '}
                <button type="button" className="link" onClick={() => setInstitution(palpite)}>
                  É {palpite}?
                </button>
              </>
            ) : (
              'Opcional. Junta a conta e o cartão do mesmo banco numa linha só — os saldos continuam separados.'
            )
          }
        >
          {(id) => (
            <>
              <input
                id={id}
                className="input"
                list="bancos-conhecidos"
                placeholder="Nubank, Itaú…"
                value={institution}
                onChange={(e) => setInstitution(e.target.value)}
              />
              <datalist id="bancos-conhecidos">
                {conhecidas.map((banco) => (
                  <option key={banco} value={banco} />
                ))}
              </datalist>
            </>
          )}
        </Field>

        {kind === 'credit_card' && (
          <div className="grid cols-2">
            <Field label="Dia do fechamento">
              {(id) => (
                <input
                  id={id}
                  type="number"
                  min={1}
                  max={31}
                  className="input"
                  value={closingDay}
                  onChange={(e) => setClosingDay(Number(e.target.value))}
                />
              )}
            </Field>
            <Field label="Dia do vencimento">
              {(id) => (
                <input
                  id={id}
                  type="number"
                  min={1}
                  max={31}
                  className="input"
                  value={dueDay}
                  onChange={(e) => setDueDay(Number(e.target.value))}
                />
              )}
            </Field>
          </div>
        )}

        <div className="field">
          <label>Cor</label>
          <ColorPicker value={color} onChange={setColor} />
        </div>
      </form>
    </Dialog>
  );
}

function CategoryDialog({ category, onClose }: { category?: Category; onClose: () => void }) {
  const { api } = useFinance();
  const [name, setName] = useState(category?.name ?? '');
  const [kind, setKind] = useState<Category['kind']>(category?.kind ?? 'expense');
  const [emoji, setEmoji] = useState(category?.emoji ?? '📦');
  const [color, setColor] = useState<SeriesColor>(category?.color ?? 'blue');
  const [error, setError] = useState('');

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return setError('Dê um nome à categoria.');
    const draft = { name: name.trim(), kind, emoji: emoji.trim() || '📦', color };
    if (category) api.updateCategory(category.id, draft);
    else api.addCategory(draft);
    onClose();
  }

  return (
    <Dialog
      title={category ? 'Editar categoria' : 'Nova categoria'}
      onClose={onClose}
      footer={
        <>
          <span className="spacer" />
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" form="category-form" className="btn primary">
            Salvar
          </button>
        </>
      }
    >
      <form id="category-form" onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="grid cols-2">
          <Field label="Nome" error={error}>
            {(id) => (
              <input id={id} className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
            )}
          </Field>
          <Field label="Ícone" hint="Um emoji">
            {(id) => (
              <input id={id} className="input" maxLength={4} value={emoji} onChange={(e) => setEmoji(e.target.value)} />
            )}
          </Field>
        </div>
        <Field label="Tipo">
          {(id) => (
            <select
              id={id}
              className="input select"
              value={kind}
              onChange={(e) => setKind(e.target.value as Category['kind'])}
            >
              <option value="expense">Saída</option>
              <option value="income">Entrada</option>
            </select>
          )}
        </Field>
        <div className="field">
          <label>Cor</label>
          <ColorPicker value={color} onChange={setColor} />
        </div>
      </form>
    </Dialog>
  );
}

/**
 * Confere a planilha antes de gravar qualquer coisa.
 *
 * A leitura é separada da gravação de propósito: importar metade e reclamar do
 * resto deixaria o usuário sem saber o que entrou nem como repetir. Aqui ele vê
 * o resumo — quantas linhas são novas, quantas já existiam, o que deu problema
 * e em qual linha — e só então confirma.
 */
function ImportarPlanilha({ onClose }: { onClose: () => void }) {
  const { data, api } = useFinance();
  const { accounts, categories } = useLookups();
  const [resultado, setResultado] = useState<ResultadoImportacao | null>(null);
  const [nomeArquivo, setNomeArquivo] = useState('');
  const [erroLeitura, setErroLeitura] = useState('');
  const [importados, setImportados] = useState<{ lancamentos: number; compras: number } | null>(null);
  const arquivo = useRef<HTMLInputElement>(null);

  const contexto = useMemo(() => {
    const porNome = <T extends { id: string; name: string }>(lista: readonly T[]) => {
      const mapa = new Map(lista.map((item) => [chaveDeNome(item.name), item.id]));
      return (nome: string) => mapa.get(chaveDeNome(nome));
    };
    return {
      contaPorNome: porNome(accounts),
      categoriaPorNome: porNome(categories),
      idsExistentes: new Set(data.entries.map((entry) => entry.id)),
    };
  }, [accounts, categories, data.entries]);

  async function ler(file: File) {
    setErroLeitura('');
    setResultado(null);
    setNomeArquivo(file.name);
    try {
      setResultado(csvToEntries(await file.text(), contexto));
    } catch (erro) {
      setErroLeitura(erro instanceof Error ? erro.message : 'Não foi possível ler o arquivo.');
    }
  }

  function confirmar() {
    if (!resultado) return;
    const lancamentos = api.importEntries(resultado.novos);
    // Cada compra gera as suas N parcelas, com os centavos divididos para
    // somar exatamente o total — a mesma conta do cadastro pelo formulário.
    for (const compra of resultado.compras) api.addPurchase(compra);
    setImportados({ lancamentos, compras: resultado.compras.length });
  }

  return (
    <Dialog
      title="Importar planilha"
      onClose={onClose}
      wide
      footer={
        <>
          <span className="spacer" />
          <button type="button" className="btn ghost" onClick={onClose}>
            {importados === null ? 'Cancelar' : 'Fechar'}
          </button>
          {importados === null && resultado && resultado.novos.length + resultado.compras.length > 0 && (
            <button type="button" className="btn primary" onClick={confirmar}>
              Importar {resultado.novos.length + resultado.compras.length}{' '}
              {resultado.novos.length + resultado.compras.length === 1 ? 'item' : 'itens'}
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
              {importados.lancamentos} {importados.lancamentos === 1 ? 'lançamento importado' : 'lançamentos importados'}
              {importados.compras > 0 &&
                ` e ${importados.compras} ${importados.compras === 1 ? 'compra parcelada criada' : 'compras parceladas criadas'}`}
            </strong>
            <br />
            <span className="dim">Já aparecem no painel e sobem na próxima sincronização.</span>
          </span>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p className="muted" style={{ fontSize: '0.88rem' }}>
            Exporte a planilha do mês, acrescente linhas no Excel e mande de volta aqui. As colunas
            obrigatórias são <strong>Data</strong>, <strong>Descrição</strong> e <strong>Valor</strong>; a conta e
            a categoria são procuradas pelo nome.
          </p>
          <p className="hint">
            Para uma <strong>compra parcelada</strong>, escreva o número de vezes na coluna{' '}
            <strong>Parcela</strong> — por exemplo <strong>10x</strong> — e ponha o <strong>total</strong> na coluna
            Valor. As dez parcelas nascem a partir da data.
          </p>

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
              if (file) void ler(file);
              event.target.value = '';
            }}
          />

          {erroLeitura && <p className="error">{erroLeitura}</p>}

          {resultado && (
            <>
              <div className="grid contadores">
                <div className="card stat">
                  <span className="stat-label">Novos</span>
                  <span className="stat-value sm num">{resultado.novos.length + resultado.compras.length}</span>
                </div>
                <div className="card stat">
                  <span className="stat-label">Já existiam</span>
                  <span className="stat-value sm num">{resultado.jaExistiam}</span>
                </div>
                <div className="card stat">
                  <span className="stat-label">Com problema</span>
                  <span className={`stat-value sm num ${resultado.problemas.length > 0 ? 'bad' : ''}`}>
                    {resultado.problemas.length}
                  </span>
                </div>
              </div>

              {resultado.compras.length > 0 && (
                <p className="hint">
                  {resultado.compras.length === 1
                    ? '1 linha vira uma compra parcelada'
                    : `${resultado.compras.length} linhas viram compras parceladas`}
                  : o valor de cada uma é o total, e as parcelas nascem a partir da data.
                </p>
              )}

              {resultado.parcelasExistentes > 0 && (
                <p className="hint">
                  {resultado.parcelasExistentes}{' '}
                  {resultado.parcelasExistentes === 1
                    ? 'linha é parcela de uma compra que já existe e foi ignorada'
                    : 'linhas são parcelas de compras que já existem e foram ignoradas'}
                  : para criar uma compra, escreva o número de vezes (como "10x") no lugar de "3/10".
                </p>
              )}

              {resultado.recorrentes > 0 && (
                <p className="hint">
                  {resultado.recorrentes}{' '}
                  {resultado.recorrentes === 1 ? 'linha é de conta recorrente e foi ignorada' : 'linhas são de contas recorrentes e foram ignoradas'}
                  : quem gera essas ocorrências é a regra, todo mês.
                </p>
              )}

              {resultado.problemas.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div className="setting-text">
                    <div className="title">O que ficou de fora</div>
                    <div className="dim">Corrija na planilha e mande de novo — o resto já pode entrar agora.</div>
                  </div>
                  <div style={{ maxHeight: '11rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {resultado.problemas.map((problema) => (
                      <div key={`${problema.linha}-${problema.motivo}`} style={{ fontSize: '0.82rem' }}>
                        <strong>Linha {problema.linha}:</strong> <span className="dim">{problema.motivo}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {resultado.novos.length + resultado.compras.length === 0 && resultado.problemas.length === 0 && (
                <p className="hint">Nada de novo nesta planilha — tudo o que está nela o aplicativo já tem.</p>
              )}
            </>
          )}
        </div>
      )}
    </Dialog>
  );
}

/**
 * Mostra o que a junção vai fazer antes de fazer. Sem esta lista, o usuário
 * clicaria num botão que apaga cadastros sem saber quais nem quantos.
 */
function JuntarRepetidos({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  const { data } = useFinance();
  // Simulação: junta numa cópia só para listar os grupos, sem gravar nada.
  const previa = useMemo(() => juntarDuplicados(data, new Date().toISOString()).resumo, [data]);

  const grupos = [
    ...previa.contas.map((g) => ({ ...g, tipo: 'conta' })),
    ...previa.categorias.map((g) => ({ ...g, tipo: 'categoria' })),
  ];

  return (
    <Dialog
      title="Juntar cadastros repetidos"
      onClose={onCancel}
      footer={
        <>
          <span className="spacer" />
          <button type="button" className="btn ghost" onClick={onCancel}>
            Cancelar
          </button>
          <button type="button" className="btn primary" onClick={onConfirm}>
            Juntar
          </button>
        </>
      }
    >
      <p className="muted" style={{ marginBottom: 12 }}>
        Cada nome abaixo fica com um cadastro só.{' '}
        {previa.registrosRemapeados === 0
          ? 'Nenhum lançamento muda de lugar.'
          : previa.registrosRemapeados === 1
            ? 'O lançamento que apontava para a cópia passa para ele — nada é perdido.'
            : `Os ${previa.registrosRemapeados} lançamentos que apontavam para as cópias passam para ele — nada é perdido.`}
      </p>
      <ul className="lista-repetidos">
        {grupos.map((grupo) => (
          <li key={`${grupo.tipo}-${grupo.nome}`}>
            <strong>{grupo.nome}</strong>
            <span className="dim">
              {' '}
              — {grupo.quantidade} {grupo.tipo === 'conta' ? 'contas' : 'categorias'} viram 1
            </span>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}

/**
 * Apagar uma conta, dizendo o que a segura.
 *
 * O diálogo antigo só sabia dizer "tem lançamentos" e arquivava. Quando o
 * usuário não achava nenhum, não havia o que fazer — e ele tinha razão: a tela
 * de Lançamentos só mostrava um mês, e uma compra parcelada sem parcelas
 * segurava a conta calada. Agora a conta é dita por extenso, dá para ir ver os
 * tais lançamentos, e existe a saída de mover tudo para outra conta.
 */
function ApagarConta({
  account,
  irPara,
  onAviso,
  onClose,
}: {
  account: Account;
  irPara: IrPara;
  onAviso: (mensagem: string) => void;
  onClose: () => void;
}) {
  const { data, api } = useFinance();
  const { accounts } = useLookups();
  const uso = useMemo(() => usoDaConta(data, account.id), [data, account.id]);
  const outras = accounts.filter((outra) => outra.id !== account.id && !outra.archived);
  const [destino, setDestino] = useState(outras[0]?.id ?? '');

  if (uso.total === 0) {
    return (
      <ConfirmDialog
        title="Apagar conta"
        confirmLabel="Apagar"
        message={`"${account.name}" não tem nenhum lançamento, conta recorrente nem compra parcelada. Será apagada.`}
        onConfirm={() => {
          api.deleteAccount(account.id);
          onClose();
        }}
        onCancel={onClose}
      />
    );
  }

  function moverEApagar() {
    const agora = new Date().toISOString();
    const limpo = limparComprasOrfas(data, agora);
    const { data: movido, movidos, transferenciasDescartadas } = moverConta(limpo.data, account.id, destino, agora);
    api.replaceData(movido);
    api.deleteAccount(account.id);
    onClose();

    const nomeDestino = accounts.find((outra) => outra.id === destino)?.name ?? 'a outra conta';
    const partes = [`"${account.name}" foi apagada.`];
    if (movidos > 0) {
      partes.push(`${movidos} ${movidos === 1 ? 'registro passou' : 'registros passaram'} para ${nomeDestino}.`);
    }
    if (limpo.removidas > 0) {
      partes.push(
        `${limpo.removidas} ${limpo.removidas === 1 ? 'compra sem parcelas foi removida' : 'compras sem parcelas foram removidas'}.`,
      );
    }
    if (transferenciasDescartadas > 0) {
      partes.push(
        `${transferenciasDescartadas} ${transferenciasDescartadas === 1 ? 'transferência entre as duas contas deixou' : 'transferências entre as duas contas deixaram'} de fazer sentido e ${transferenciasDescartadas === 1 ? 'saiu' : 'saíram'}.`,
      );
    }
    onAviso(partes.join(' '));
  }

  return (
    <Dialog
      title={`Apagar "${account.name}"`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancelar
          </button>
          <span className="spacer" />
          <button
            type="button"
            className="btn"
            onClick={() => {
              api.updateAccount(account.id, { archived: true });
              onClose();
              onAviso(`"${account.name}" foi arquivada: some dos formulários e o histórico continua correto.`);
            }}
          >
            Só arquivar
          </button>
          <button type="button" className="btn primary" onClick={moverEApagar} disabled={!destino}>
            Mover e apagar
          </button>
        </>
      }
    >
      <p style={{ marginTop: 0 }}>
        Ainda aponta para esta conta: <strong>{descreverUso(uso)}</strong>.
      </p>

      {uso.lancamentos > 0 && (
        <p className="dim" style={{ fontSize: '0.86rem' }}>
          <button
            type="button"
            className="btn sm ghost"
            onClick={() => {
              onClose();
              irPara({
                pagina: 'lancamentos',
                filtro: { accountId: account.id },
                periodo: { grao: 'tudo', ancora: today() },
              });
            }}
          >
            Ver esses lançamentos
          </button>{' '}
          — abre a lista filtrada por esta conta, com o período em &ldquo;Tudo&rdquo;.
        </p>
      )}

      {uso.comprasOrfas > 0 && (
        <p className="hint">
          {uso.comprasOrfas === 1
            ? 'Uma compra parcelada ficou sem nenhuma parcela'
            : `${uso.comprasOrfas} compras parceladas ficaram sem nenhuma parcela`}{' '}
          — sobra de quando as parcelas foram apagadas uma a uma. Elas somem junto.
        </p>
      )}

      {outras.length > 0 ? (
        <Field label="Passar tudo para">
          {(id) => (
            <select
              id={id}
              className="input select"
              value={destino}
              onChange={(event) => setDestino(event.target.value)}
            >
              {outras.map((outra) => (
                <option key={outra.id} value={outra.id}>
                  {outra.name}
                </option>
              ))}
            </select>
          )}
        </Field>
      ) : (
        <p className="hint">
          Não há outra conta ativa para receber o movimento. Crie uma antes, ou use &ldquo;Só arquivar&rdquo;.
        </p>
      )}
    </Dialog>
  );
}

export function SettingsPage({
  periodo,
  theme,
  onThemeChange,
  irPara,
}: {
  periodo: Periodo;
  theme: ThemeChoice;
  onThemeChange: (theme: ThemeChoice) => void;
  /** Leva a outra tela já filtrada — ver `ui/navegacao.ts`. */
  irPara: IrPara;
}) {
  const { data, api, cloud } = useFinance();
  const { accounts, categories, accountName, categoryName } = useLookups();
  const monthEntries = usePeriodEntries(periodo);
  const fileInput = useRef<HTMLInputElement>(null);

  const [accountDialog, setAccountDialog] = useState<{ account?: Account } | null>(null);
  const [categoryDialog, setCategoryDialog] = useState<{ category?: Category } | null>(null);
  const [removingAccount, setRemovingAccount] = useState<Account | null>(null);
  const [removingCategory, setRemovingCategory] = useState<Category | null>(null);
  const [resetting, setResetting] = useState(false);
  const [importando, setImportando] = useState(false);
  const [importandoBanco, setImportandoBanco] = useState(false);
  const [copias, setCopias] = useState<Copia[]>([]);
  const [restaurando, setRestaurando] = useState<Copia | null>(null);
  const [desmarcando, setDesmarcando] = useState(false);
  const pagos = useMemo(() => quantosEstaoPagos(data), [data]);
  const parcelasTortas = useMemo(() => parcelasComNomeErrado(data), [data]);
  const [juntando, setJuntando] = useState(false);
  const [message, setMessage] = useState('');

  // Carteiras sincronizadas antes da correção da semeadura ficaram com contas e
  // categorias padrão repetidas, uma leva por aparelho. O aviso só aparece se
  // ainda houver o que juntar, e some sozinho depois.
  const duplicados = useMemo(() => contarDuplicados(data), [data]);
  const faltando = useMemo(() => categoriasPadraoQueFaltam(data.categories), [data.categories]);
  const repetidos = duplicados.contas + duplicados.categorias;

  function juntarRepetidos() {
    const { data: limpo, resumo } = juntarDuplicados(data, new Date().toISOString());
    api.replaceData(limpo);
    setJuntando(false);
    const plural = (quantidade: number, um: string, varios: string) =>
      `${quantidade} ${quantidade === 1 ? um : varios}`;
    const partes = [
      duplicados.contas > 0 ? plural(duplicados.contas, 'conta repetida', 'contas repetidas') : '',
      duplicados.categorias > 0 ? plural(duplicados.categorias, 'categoria repetida', 'categorias repetidas') : '',
    ].filter(Boolean);
    const movidos =
      resumo.registrosRemapeados === 0
        ? 'Nenhum lançamento precisou mudar de lugar.'
        : `${plural(resumo.registrosRemapeados, 'lançamento passou', 'lançamentos passaram')} para o cadastro que ficou.`;
    setMessage(`Pronto: ${partes.join(' e ')} removidas. ${movidos}`);
  }

  async function importBackup(file: File) {
    try {
      api.replaceData(await readBackup(file));
      setMessage('Backup restaurado.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível ler o arquivo.');
    }
  }

  return (
    <>
      <CloudPanel />

      {/* O recado do que acabou de acontecer fica no topo, perto de onde a ação
          foi disparada. Enterrado no fim da página ninguém via. */}
      {message && (
        <div className="banner" role="status">
          <span className="emoji" aria-hidden="true">
            ✅
          </span>
          <span>{message}</span>
          <span className="spacer" />
          <button type="button" className="btn sm ghost" onClick={() => setMessage('')} aria-label="Fechar aviso">
            ✕
          </button>
        </div>
      )}

      {repetidos > 0 && (
        <div className="banner warn">
          <span className="emoji" aria-hidden="true">
            🧹
          </span>
          <span>
            <strong>
              {repetidos === 1
                ? 'Há 1 cadastro repetido nesta carteira'
                : `Há ${repetidos} cadastros repetidos nesta carteira`}
            </strong>
            <br />
            <span className="dim">
              Dá para juntar tudo de uma vez, sem perder lançamento nenhum: eles passam para o cadastro que ficar.
            </span>
            <br />
            <button type="button" className="btn sm" style={{ marginTop: 8 }} onClick={() => setJuntando(true)}>
              Juntar repetidos
            </button>
          </span>
        </div>
      )}

      <Card
        title="Contas"
        action={
          <button type="button" className="btn primary sm" onClick={() => setAccountDialog({})}>
            Nova conta
          </button>
        }
        tight
      >
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Conta</th>
                <th>Tipo</th>
                <th className="right">Saldo inicial</th>
                <th className="right">Saldo atual</th>
                <th className="right" />
              </tr>
            </thead>
            <tbody>
              {agruparPorInstituicao(accounts).flatMap((grupo) => [
                // O cabeçalho do banco só existe quando há mais de uma conta
                // nele: para a carteira solta, ele seria uma linha a mais
                // dizendo o que já está escrito ao lado.
                ...(grupo.avulsa || grupo.contas.length === 1
                  ? []
                  : [
                      <tr key={`grupo-${grupo.nome}`} className="linha-banco">
                        <td colSpan={5}>
                          {grupo.nome}
                          <span className="dim" style={{ fontWeight: 400 }}>
                            {' '}
                            · {grupo.contas.length} contas
                          </span>
                        </td>
                      </tr>,
                    ]),
                ...grupo.contas.map((account) => (
                <tr key={account.id} style={account.archived ? { opacity: 0.55 } : undefined}>
                  <td>
                    <div className="row" style={{ gap: 8 }}>
                      <Dot color={account.color} />
                      <span style={{ fontWeight: 560 }}>{account.name}</span>
                      {account.archived && <span className="tag">Arquivada</span>}
                    </div>
                  </td>
                  <td className="muted">
                    {ACCOUNT_KINDS.find((k) => k.value === account.kind)?.label}
                    {account.kind === 'credit_card' && account.dueDay && (
                      <div className="dim" style={{ fontSize: '0.76rem' }}>
                        fecha dia {account.closingDay} · vence dia {account.dueDay}
                      </div>
                    )}
                  </td>
                  <td className="right num muted">{formatMoney(account.openingBalance)}</td>
                  {(() => {
                    const balance = accountBalance(account, data.entries, { onlySettled: true });
                    return (
                      <td className={`right num ${balance < 0 ? 'bad' : ''}`} style={{ fontWeight: 600 }}>
                        {formatMoney(balance)}
                      </td>
                    );
                  })()}
                  <td className="right">
                    <div className="row end" style={{ gap: 4 }}>
                      {account.archived && (
                        <button
                          type="button"
                          className="btn ghost sm"
                          onClick={() => api.updateAccount(account.id, { archived: false })}
                        >
                          Reativar
                        </button>
                      )}
                      <button type="button" className="btn ghost sm" onClick={() => setAccountDialog({ account })}>
                        Editar
                      </button>
                      {!account.archived && (
                        <button type="button" className="btn ghost sm" onClick={() => setRemovingAccount(account)}>
                          Apagar
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
                )),
              ])}
            </tbody>
          </table>
        </div>
      </Card>

      <Card
        title="Categorias"
        action={
          <button type="button" className="btn primary sm" onClick={() => setCategoryDialog({})}>
            Nova categoria
          </button>
        }
      >
        {(['expense', 'income'] as const).map((kind) => (
          <div key={kind} style={{ marginBottom: 14 }}>
            <h3 className="dim" style={{ fontSize: '0.76rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
              {kind === 'expense' ? 'Saídas' : 'Entradas'}
            </h3>
            <div className="row wrap" style={{ gap: 8 }}>
              {categories
                .filter((category) => category.kind === kind)
                .map((category) => (
                  <span key={category.id} className="tag" style={{ padding: '5px 10px', gap: 7 }}>
                    <Dot color={category.color} />
                    <span aria-hidden="true">{category.emoji}</span>
                    <span style={{ color: 'var(--text)' }}>{category.name}</span>
                    <button
                      type="button"
                      className="btn ghost"
                      style={{ padding: 0, width: 20, height: 20, fontSize: 11 }}
                      aria-label={`Ver lançamentos de ${category.name}`}
                      title={`Ver lançamentos de ${category.name}`}
                      onClick={() =>
                        irPara({
                          pagina: 'lancamentos',
                          filtro: { categoryId: category.id },
                          periodo: { grao: 'tudo', ancora: today() },
                        })
                      }
                    >
                      🔎
                    </button>
                    <button
                      type="button"
                      className="btn ghost"
                      style={{ padding: 0, width: 20, height: 20, fontSize: 11 }}
                      aria-label={`Editar ${category.name}`}
                      onClick={() => setCategoryDialog({ category })}
                    >
                      ✎
                    </button>
                    <button
                      type="button"
                      className="btn ghost"
                      style={{ padding: 0, width: 20, height: 20, fontSize: 11 }}
                      aria-label={`Apagar ${category.name}`}
                      onClick={() => setRemovingCategory(category)}
                    >
                      ✕
                    </button>
                  </span>
                ))}
            </div>
          </div>
        ))}

        {/* Quem começou a usar o app antes de uma categoria existir não a
            recebe sozinho. É oferta, não aviso: quem apagou uma de propósito
            continua vendo o atalho e simplesmente não clica. */}
        {faltando.length > 0 && (
          <p className="hint" style={{ marginTop: 4 }}>
            Categorias padrão que esta carteira ainda não tem:{' '}
            <strong>{faltando.map((c) => c.name).join(', ')}</strong>.{' '}
            <button
              type="button"
              className="link"
              onClick={() => {
                for (const nova of faltando) {
                  api.addCategory({ name: nova.name, kind: nova.kind, emoji: nova.emoji, color: nova.color });
                }
                setMessage(
                  faltando.length === 1
                    ? `Categoria "${faltando[0]!.name}" criada.`
                    : `${faltando.length} categorias criadas: ${faltando.map((c) => c.name).join(', ')}.`,
                );
              }}
            >
              {faltando.length === 1 ? 'Adicionar' : 'Adicionar todas'}
            </button>
          </p>
        )}
      </Card>

      <div className="grid split">
        <Card title="Seus dados">
          <p className="muted" style={{ fontSize: '0.86rem', marginBottom: 12 }}>
            {cloud.status === 'ready'
              ? 'Seus lançamentos ficam neste aparelho e também na sua carteira na nuvem. O backup continua valendo para guardar uma cópia fora dos dois.'
              : 'Tudo fica salvo neste navegador, sem servidor. Faça backup antes de limpar o histórico ou trocar de computador.'}
          </p>
          <div className="row wrap">
            <button
              type="button"
              className="btn"
              onClick={() =>
                downloadCsv(
                  `lancamentos-${rotuloDoPeriodo(periodo).toLowerCase().replace(/[^0-9a-zà-ú]+/gi, '-')}.csv`,
                  entriesToCsv(monthEntries, { accountName, categoryName }),
                )
              }
            >
              📊 Exportar planilha do mês
            </button>
            <button type="button" className="btn" onClick={() => setImportando(true)}>
              📥 Importar planilha
            </button>
            <button type="button" className="btn" onClick={() => setImportandoBanco(true)}>
              🏦 Importar do banco
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => downloadJson(`financeiro-backup-${new Date().toISOString().slice(0, 10)}.json`, data)}
            >
              💾 Baixar backup
            </button>
            <button type="button" className="btn" onClick={() => fileInput.current?.click()}>
              📂 Restaurar backup
            </button>
            <input
              ref={fileInput}
              type="file"
              accept="application/json,.json"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void importBackup(file);
                event.target.value = '';
              }}
            />
          </div>
          <hr style={{ border: 0, borderTop: '1px solid var(--border)', margin: '14px 0' }} />

          {/* As cópias que o app guarda sozinho. Ficam aqui e não num aviso
              porque, no dia em que forem precisas, é aqui que a pessoa vem
              procurar — junto do backup manual. */}
          <div className="setting-text">
            <div className="title">Cópias automáticas</div>
            <div className="dim">
              O app guarda sozinho o estado anterior de tempos em tempos, e sempre antes de uma perda grande —
              um &ldquo;apagar tudo&rdquo; sem querer, uma importação torta. Ficam só neste aparelho.
            </div>
          </div>
          <div className="row wrap" style={{ marginTop: 8 }}>
            <button type="button" className="btn" onClick={() => void api.copiasAutomaticas().then(setCopias)}>
              🕑 Ver cópias automáticas
            </button>
          </div>
          {copias.length > 0 && (
            <ul className="lista-repetidos" style={{ marginTop: 10 }}>
              {copias.map((copia) => (
                <li key={copia.motivo} className="row wrap" style={{ gap: 8 }}>
                  <span>
                    <strong>{rotuloDoMotivo(copia.motivo)}</strong>
                    <span className="dim"> — {descreverCopia(copia)}</span>
                  </span>
                  <span className="spacer" />
                  {/* Os dois num grupo só: soltos na linha, "Baixar" ficava numa
                      linha e "Restaurar" na seguinte quando o texto era longo. */}
                  <span className="row" style={{ gap: 8, flex: 'none' }}>
                    <button
                      type="button"
                      className="btn sm ghost"
                      onClick={() =>
                        downloadJson(`financeiro-copia-${copia.gravadaEm.slice(0, 10)}.json`, copia.data)
                      }
                    >
                      Baixar
                    </button>
                    <button type="button" className="btn sm" onClick={() => setRestaurando(copia)}>
                      Restaurar
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}

          <hr style={{ border: 0, borderTop: '1px solid var(--border)', margin: '14px 0' }} />

          {/* Existe por causa de uma correção: até certa versão, parcela com
              data vencida nascia paga. Conferir uma a uma seria trabalho de
              horas — este botão devolve tudo para "a pagar" de uma vez. */}
          <div className="setting-text">
            <div className="title">Marcações de pagamento</div>
            <div className="dim">
              {pagos === 0
                ? 'Nenhum lançamento está marcado como pago.'
                : `${pagos} ${pagos === 1 ? 'lançamento está marcado' : 'lançamentos estão marcados'} como pagos.`}{' '}
              Transferências entre suas contas não entram nessa conta.
            </div>
          </div>
          <div className="row wrap" style={{ marginTop: 8 }}>
            <button type="button" className="btn" disabled={pagos === 0} onClick={() => setDesmarcando(true)}>
              ↩️ Desmarcar todos como pagos
            </button>
          </div>

          {/* Compras importadas antes da correção ficaram com todas as parcelas
              chamadas "Parcela 1/10". O atalho some quando não há mais o que
              corrigir. */}
          {parcelasTortas > 0 && (
            <>
              <div className="setting-text" style={{ marginTop: 14 }}>
                <div className="title">Nomes das parcelas</div>
                <div className="dim">
                  {parcelasTortas === 1
                    ? '1 parcela tem no nome um número diferente do próprio'
                    : `${parcelasTortas} parcelas têm no nome um número diferente do próprio`}{' '}
                  — sobra de compras importadas do banco, cujo texto já vinha numerado.
                </div>
              </div>
              <div className="row wrap" style={{ marginTop: 8 }}>
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    const { data: novo, parcelas, compras } = corrigirNomesDeParcelas(
                      data,
                      new Date().toISOString(),
                    );
                    api.replaceData(novo);
                    setMessage(
                      `${parcelas} ${parcelas === 1 ? 'parcela renomeada' : 'parcelas renomeadas'}` +
                        (compras > 0
                          ? ` e ${compras} ${compras === 1 ? 'compra' : 'compras'} sem o número no nome.`
                          : '.'),
                    );
                  }}
                >
                  🏷️ Corrigir nomes das parcelas
                </button>
              </div>
            </>
          )}

          <hr style={{ border: 0, borderTop: '1px solid var(--border)', margin: '14px 0' }} />
          <div className="row wrap">
            <button type="button" className="btn" onClick={() => api.loadDemo()}>
              🎲 Carregar dados de exemplo
            </button>
            <button type="button" className="btn danger" onClick={() => setResetting(true)}>
              Apagar tudo
            </button>
          </div>
        </Card>

        <Card title="Aparência">
          <div className="field">
            <label>Tema</label>
            <div className="segmented">
              {(
                [
                  ['system', 'Do sistema'],
                  ['light', 'Claro'],
                  ['dark', 'Escuro'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={theme === value}
                  onClick={() => onThemeChange(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <p className="hint" style={{ marginTop: 12 }}>
            {data.entries.length} lançamentos · {data.recurring.length} contas recorrentes ·{' '}
            {data.purchases.length} compras parceladas.
          </p>

          {/* A versão na tela responde "estou vendo a atualização?" sem
              adivinhação — a dúvida que apareceu quando um botão publicado há
              dias não existia no celular, por causa da versão velha em cache. */}
          <hr style={{ border: 0, borderTop: '1px solid var(--border)', margin: '14px 0' }} />
          <div className="setting-text">
            <div className="title">Versão</div>
            <div className="dim num">{VERSAO_DO_APP}</div>
          </div>
          <div className="row wrap" style={{ marginTop: 8 }}>
            <button
              type="button"
              className="btn"
              onClick={() => {
                void procurarAtualizacao().then(setMessage);
              }}
            >
              🔄 Procurar atualização
            </button>
          </div>
        </Card>
      </div>

      {importando && <ImportarPlanilha onClose={() => setImportando(false)} />}
      {importandoBanco && <ImportarDoBanco onClose={() => setImportandoBanco(false)} />}

      {desmarcando && (
        <ConfirmDialog
          title="Desmarcar todos como pagos"
          confirmLabel="Desmarcar todos"
          message={
            `Os ${pagos} lançamentos marcados como pagos voltam a "a pagar", e você remarca só o que de fato ` +
            'pagou. Nada é apagado e nenhum valor muda — só a marcação. Mas as marcações certas que você já tiver ' +
            'feito também se perdem, e não há como desfazer em bloco: só remarcando.'
          }
          onConfirm={() => {
            const { data: novo, alterados } = desmarcarTodosComoPagos(data, new Date().toISOString());
            api.replaceData(novo);
            setDesmarcando(false);
            setMessage(
              `${alterados} ${alterados === 1 ? 'lançamento voltou' : 'lançamentos voltaram'} para "a pagar". ` +
              'Marque na caixinha da lista o que já foi pago.',
            );
          }}
          onCancel={() => setDesmarcando(false)}
        />
      )}

      {restaurando && (
        <ConfirmDialog
          title="Restaurar cópia automática"
          confirmLabel="Restaurar"
          message={
            `Tudo que está aqui agora é substituído pela cópia de ${descreverCopia(restaurando)}. ` +
            'O que você tiver lançado depois dela se perde — baixe um backup antes se estiver em dúvida.'
          }
          onConfirm={() => {
            api.replaceData(restaurando.data);
            setMessage(`Cópia restaurada: ${descreverCopia(restaurando)}.`);
            setRestaurando(null);
            setCopias([]);
          }}
          onCancel={() => setRestaurando(null)}
        />
      )}
      {accountDialog && <AccountDialog account={accountDialog.account} onClose={() => setAccountDialog(null)} />}
      {categoryDialog && <CategoryDialog category={categoryDialog.category} onClose={() => setCategoryDialog(null)} />}

      {removingAccount && (
        <ApagarConta
          account={removingAccount}
          irPara={irPara}
          onAviso={setMessage}
          onClose={() => setRemovingAccount(null)}
        />
      )}

      {removingCategory && (
        <ConfirmDialog
          title="Apagar categoria"
          message={`Os lançamentos de "${removingCategory.name}" ficam sem categoria, mas continuam no histórico.`}
          onConfirm={() => {
            api.deleteCategory(removingCategory.id);
            setRemovingCategory(null);
          }}
          onCancel={() => setRemovingCategory(null)}
        />
      )}

      {juntando && <JuntarRepetidos onConfirm={juntarRepetidos} onCancel={() => setJuntando(false)} />}

      {resetting && (
        <ConfirmDialog
          title="Apagar tudo"
          message="Todos os lançamentos, contas recorrentes e compras parceladas serão removidos deste navegador. Baixe um backup antes se quiser guardar."
          onConfirm={() => {
            api.resetAll();
            setResetting(false);
          }}
          onCancel={() => setResetting(false)}
        />
      )}
    </>
  );
}
