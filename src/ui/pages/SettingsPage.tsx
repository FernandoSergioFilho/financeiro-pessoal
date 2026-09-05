/** Contas, categorias, aparência e o que fazer com os dados. */

import { useRef, useState, type FormEvent } from 'react';

import { formatMoney } from '../../domain/money.ts';
import { accountBalance } from '../../domain/summary.ts';
import { SERIES_COLORS, type Account, type AccountKind, type Category, type SeriesColor } from '../../domain/types.ts';
import { downloadCsv, downloadJson, entriesToCsv, readBackup } from '../../data/exchange.ts';
import { useLookups, useMonthEntries } from '../../state/selectors.ts';
import { useFinance } from '../../state/store.tsx';
import { Card, ConfirmDialog, Dialog, Dot, Field, MoneyInput, colorVar } from '../components/primitives.tsx';
import { CloudPanel } from '../components/CloudPanel.tsx';
import type { ThemeChoice } from '../theme.ts';

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
  const { api } = useFinance();
  const [name, setName] = useState(account?.name ?? '');
  const [kind, setKind] = useState<AccountKind>(account?.kind ?? 'checking');
  const [opening, setOpening] = useState<number | null>(account?.openingBalance ?? 0);
  const [color, setColor] = useState<SeriesColor>(account?.color ?? 'blue');
  const [closingDay, setClosingDay] = useState(account?.closingDay ?? 25);
  const [dueDay, setDueDay] = useState(account?.dueDay ?? 5);
  const [error, setError] = useState('');

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return setError('Dê um nome à conta.');
    const draft = {
      name: name.trim(),
      kind,
      openingBalance: opening ?? 0,
      color,
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

export function SettingsPage({
  month,
  theme,
  onThemeChange,
}: {
  month: string;
  theme: ThemeChoice;
  onThemeChange: (theme: ThemeChoice) => void;
}) {
  const { data, api, cloud } = useFinance();
  const { accounts, categories, accountName, categoryName } = useLookups();
  const monthEntries = useMonthEntries(month);
  const fileInput = useRef<HTMLInputElement>(null);

  const [accountDialog, setAccountDialog] = useState<{ account?: Account } | null>(null);
  const [categoryDialog, setCategoryDialog] = useState<{ category?: Category } | null>(null);
  const [removingAccount, setRemovingAccount] = useState<Account | null>(null);
  const [removingCategory, setRemovingCategory] = useState<Category | null>(null);
  const [resetting, setResetting] = useState(false);
  const [message, setMessage] = useState('');

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
              {accounts.map((account) => (
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
                          {api.isAccountInUse(account.id) ? 'Arquivar' : 'Apagar'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
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
                  `lancamentos-${month}.csv`,
                  entriesToCsv(monthEntries, { accountName, categoryName }),
                )
              }
            >
              📊 Exportar planilha do mês
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
          {message && (
            <p className="hint" style={{ marginTop: 10 }} role="status">
              {message}
            </p>
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
        </Card>
      </div>

      {accountDialog && <AccountDialog account={accountDialog.account} onClose={() => setAccountDialog(null)} />}
      {categoryDialog && <CategoryDialog category={categoryDialog.category} onClose={() => setCategoryDialog(null)} />}

      {removingAccount && (
        <ConfirmDialog
          title={api.isAccountInUse(removingAccount.id) ? 'Arquivar conta' : 'Apagar conta'}
          confirmLabel={api.isAccountInUse(removingAccount.id) ? 'Arquivar' : 'Apagar'}
          message={
            api.isAccountInUse(removingAccount.id)
              ? `"${removingAccount.name}" tem lançamentos, então ela é arquivada em vez de apagada: some dos formulários, mas o histórico continua correto.`
              : `"${removingAccount.name}" nunca foi usada e será apagada.`
          }
          onConfirm={() => {
            api.deleteAccount(removingAccount.id);
            setRemovingAccount(null);
          }}
          onCancel={() => setRemovingAccount(null)}
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
