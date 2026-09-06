/**
 * Formulários de lançamento.
 *
 * Os três jeitos de registrar dinheiro — avulso, parcelado e recorrente —
 * ficam atrás do mesmo botão "Novo lançamento", porque para quem usa a
 * diferença é só "isso se repete?" e não três funções distintas do app.
 */

import { useMemo, useState, type FormEvent } from 'react';

import { addMonths, formatDate, isValidISO, today } from '../../domain/date.ts';
import { formatMoney, splitInstallments } from '../../domain/money.ts';
import { describeFrequency } from '../../domain/recurrence.ts';
import type {
  Category,
  DisplayEntry,
  EntryKind,
  Frequency,
  RecurringRule,
} from '../../domain/types.ts';
import { useLookups } from '../../state/selectors.ts';
import { useFinance, type EntryDraft, type RecurringDraft } from '../../state/store.tsx';
import { ConfirmDialog, Dialog, Field, MoneyInput, Segmented } from './primitives.tsx';

const KIND_OPTIONS: { value: EntryKind; label: string }[] = [
  { value: 'expense', label: 'Saída' },
  { value: 'income', label: 'Entrada' },
  { value: 'transfer', label: 'Transferência' },
];

const KIND_TONE: Partial<Record<EntryKind, string>> = { income: 'income', expense: 'expense' };

function CategorySelect({
  id,
  value,
  kind,
  categories,
  onChange,
}: {
  id: string;
  value: string | null;
  kind: EntryKind;
  categories: Category[];
  onChange: (id: string | null) => void;
}) {
  const options = categories.filter((c) => !c.archived && c.kind === (kind === 'income' ? 'income' : 'expense'));
  return (
    <select id={id} className="input select" value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">Sem categoria</option>
      {options.map((category) => (
        <option key={category.id} value={category.id}>
          {category.emoji} {category.name}
        </option>
      ))}
    </select>
  );
}

function AccountSelect({
  id,
  value,
  onChange,
  exclude,
}: {
  id: string;
  value: string;
  onChange: (id: string) => void;
  exclude?: string;
}) {
  const { accounts } = useLookups();
  return (
    <select id={id} className="input select" value={value} onChange={(e) => onChange(e.target.value)}>
      {accounts
        .filter((account) => !account.archived && account.id !== exclude)
        .map((account) => (
          <option key={account.id} value={account.id}>
            {account.name}
          </option>
        ))}
    </select>
  );
}

/* ------------------------------------------------------------------ avulso */

interface SingleState {
  kind: EntryKind;
  amount: number | null;
  description: string;
  date: string;
  accountId: string;
  toAccountId: string;
  categoryId: string | null;
  settled: boolean;
  notes: string;
}

function useSingleState(initial: Partial<SingleState>): [SingleState, (patch: Partial<SingleState>) => void] {
  const { accounts } = useLookups();
  const [state, setState] = useState<SingleState>(() => ({
    kind: 'expense',
    amount: null,
    description: '',
    date: today(),
    accountId: accounts[0]?.id ?? '',
    toAccountId: accounts[1]?.id ?? '',
    categoryId: null,
    settled: true,
    notes: '',
    ...initial,
  }));
  return [state, (patch) => setState((current) => ({ ...current, ...patch }))];
}

function singleErrors(state: SingleState): Partial<Record<keyof SingleState, string>> {
  const errors: Partial<Record<keyof SingleState, string>> = {};
  if (!state.amount || state.amount <= 0) errors.amount = 'Informe um valor maior que zero.';
  if (!state.description.trim()) errors.description = 'Dê um nome ao lançamento.';
  if (!isValidISO(state.date)) errors.date = 'Data inválida.';
  if (!state.accountId) errors.accountId = 'Escolha uma conta.';
  if (state.kind === 'transfer' && !state.toAccountId) errors.toAccountId = 'Escolha a conta de destino.';
  if (state.kind === 'transfer' && state.toAccountId === state.accountId) {
    errors.toAccountId = 'A conta de destino precisa ser diferente.';
  }
  return errors;
}

function toDraft(state: SingleState): EntryDraft {
  return {
    date: state.date,
    description: state.description.trim(),
    amount: state.amount ?? 0,
    kind: state.kind,
    accountId: state.accountId,
    toAccountId: state.kind === 'transfer' ? state.toAccountId : null,
    categoryId: state.kind === 'transfer' ? null : state.categoryId,
    status: state.settled ? 'settled' : 'pending',
    notes: state.notes.trim() || undefined,
    recurringId: null,
    occurrenceDate: null,
    purchaseId: null,
    installmentNumber: null,
    installmentTotal: null,
  };
}

function SingleFields({
  state,
  set,
  errors,
  lockKind,
}: {
  state: SingleState;
  set: (patch: Partial<SingleState>) => void;
  errors: Partial<Record<keyof SingleState, string>>;
  lockKind?: boolean;
}) {
  const { categories } = useLookups();

  return (
    <>
      {!lockKind && (
        <Segmented
          options={KIND_OPTIONS}
          value={state.kind}
          tone={KIND_TONE}
          onChange={(kind) => set({ kind, categoryId: null })}
        />
      )}

      <div className="grid cols-2 keep">
        <Field label="Valor" error={errors.amount}>
          {(id) => (
            <MoneyInput
              id={id}
              autoFocus
              value={state.amount}
              invalid={Boolean(errors.amount)}
              onChange={(amount) => set({ amount })}
            />
          )}
        </Field>
        <Field label="Data" error={errors.date}>
          {(id) => (
            <input
              id={id}
              type="date"
              className="input"
              value={state.date}
              onChange={(e) => set({ date: e.target.value })}
            />
          )}
        </Field>
      </div>

      <Field label="Descrição" error={errors.description}>
        {(id) => (
          <input
            id={id}
            className="input"
            placeholder="Supermercado, salário, aluguel…"
            value={state.description}
            aria-invalid={Boolean(errors.description) || undefined}
            onChange={(e) => set({ description: e.target.value })}
          />
        )}
      </Field>

      <div className="grid cols-2">
        <Field label={state.kind === 'transfer' ? 'De' : 'Conta'} error={errors.accountId}>
          {(id) => <AccountSelect id={id} value={state.accountId} onChange={(accountId) => set({ accountId })} />}
        </Field>
        {state.kind === 'transfer' ? (
          <Field label="Para" error={errors.toAccountId}>
            {(id) => (
              <AccountSelect
                id={id}
                value={state.toAccountId}
                exclude={state.accountId}
                onChange={(toAccountId) => set({ toAccountId })}
              />
            )}
          </Field>
        ) : (
          <Field label="Categoria">
            {(id) => (
              <CategorySelect
                id={id}
                value={state.categoryId}
                kind={state.kind}
                categories={categories}
                onChange={(categoryId) => set({ categoryId })}
              />
            )}
          </Field>
        )}
      </div>

      <Field label="Observação">
        {(id) => (
          <textarea
            id={id}
            className="input"
            rows={2}
            placeholder="Opcional"
            value={state.notes}
            onChange={(e) => set({ notes: e.target.value })}
          />
        )}
      </Field>

      <label className="switch">
        <input type="checkbox" checked={state.settled} onChange={(e) => set({ settled: e.target.checked })} />
        <span>
          Já efetivado
          <span className="hint" style={{ display: 'block' }}>
            Desmarque para deixar como previsto e conferir depois.
          </span>
        </span>
      </label>
    </>
  );
}

/* -------------------------------------------------------------- parcelado */

function InstallmentForm({ onDone }: { onDone: () => void }) {
  const { api } = useFinance();
  const { accounts, categories } = useLookups();
  const [description, setDescription] = useState('');
  const [total, setTotal] = useState<number | null>(null);
  const [count, setCount] = useState(2);
  const [firstDate, setFirstDate] = useState(today());
  const [accountId, setAccountId] = useState(
    accounts.find((a) => a.kind === 'credit_card' && !a.archived)?.id ?? accounts[0]?.id ?? '',
  );
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const errors = {
    total: !total || total <= 0 ? 'Informe o valor total da compra.' : undefined,
    description: description.trim() ? undefined : 'Dê um nome à compra.',
    count: count >= 1 && count <= 120 ? undefined : 'Entre 1 e 120 parcelas.',
    firstDate: isValidISO(firstDate) ? undefined : 'Data inválida.',
  };
  const valid = Object.values(errors).every((error) => !error);

  const preview = useMemo(() => {
    if (!total || total <= 0 || count < 1) return null;
    const parts = splitInstallments(total, count);
    const first = parts[0]!;
    const rest = parts.at(-1)!;
    return {
      first,
      rest,
      uneven: first !== rest,
      lastDate: addMonths(firstDate, count - 1),
    };
  }, [total, count, firstDate]);

  function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    if (!valid) return;
    api.addPurchase({
      description: description.trim(),
      totalAmount: total!,
      installments: count,
      firstDate,
      accountId,
      categoryId,
    });
    onDone();
  }

  const show = (key: keyof typeof errors) => (submitted ? errors[key] : undefined);

  return (
    <form onSubmit={submit} id="entry-form" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label="O que você comprou" error={show('description')}>
          {(id) => (
            <input
              id={id}
              className="input"
              autoFocus
              placeholder="Notebook, geladeira, passagem…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          )}
        </Field>

        <div className="grid cols-2 keep">
          <Field label="Valor total" error={show('total')}>
            {(id) => <MoneyInput id={id} value={total} onChange={setTotal} invalid={Boolean(show('total'))} />}
          </Field>
          <Field label="Parcelas" error={show('count')}>
            {(id) => (
              <input
                id={id}
                type="number"
                min={1}
                max={120}
                className="input"
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
              />
            )}
          </Field>
        </div>

        <div className="grid cols-2">
          <Field label="Primeira parcela" error={show('firstDate')}>
            {(id) => (
              <input
                id={id}
                type="date"
                className="input"
                value={firstDate}
                onChange={(e) => setFirstDate(e.target.value)}
              />
            )}
          </Field>
          <Field label="Conta / cartão">
            {(id) => <AccountSelect id={id} value={accountId} onChange={setAccountId} />}
          </Field>
        </div>

        <Field label="Categoria">
          {(id) => (
            <CategorySelect
              id={id}
              value={categoryId}
              kind="expense"
              categories={categories}
              onChange={setCategoryId}
            />
          )}
        </Field>

        {preview && (
          <div className="banner">
            <span className="emoji" aria-hidden="true">
              🧾
            </span>
            <span>
              <strong>
                {count}× de {formatMoney(preview.rest)}
              </strong>
              {preview.uneven && <> — a primeira sai {formatMoney(preview.first)} para fechar o total exato</>}
              <br />
              <span className="dim">
                De {formatDate(firstDate)} a {formatDate(preview.lastDate)}. As parcelas já vencidas entram como pagas.
              </span>
            </span>
          </div>
        )}
    </form>
  );
}

/* ------------------------------------------------------------- recorrente */

const FREQUENCY_OPTIONS: { value: Frequency; label: string }[] = [
  { value: 'weekly', label: 'Semanal' },
  { value: 'monthly', label: 'Mensal' },
  { value: 'yearly', label: 'Anual' },
];

type EndMode = 'never' | 'date' | 'count';

interface RecurringFormValue {
  kind: EntryKind;
  amount: number | null;
  description: string;
  accountId: string;
  toAccountId: string;
  categoryId: string | null;
  frequency: Frequency;
  interval: number;
  startDate: string;
  endMode: EndMode;
  endDate: string;
  maxOccurrences: number;
  active: boolean;
}

function ruleToValue(rule: RecurringRule): RecurringFormValue {
  return {
    kind: rule.kind,
    amount: rule.amount,
    description: rule.description,
    accountId: rule.accountId,
    toAccountId: rule.toAccountId ?? '',
    categoryId: rule.categoryId ?? null,
    frequency: rule.frequency,
    interval: rule.interval,
    startDate: rule.startDate,
    endMode: rule.endDate ? 'date' : rule.maxOccurrences ? 'count' : 'never',
    endDate: rule.endDate ?? addMonths(rule.startDate, 12),
    maxOccurrences: rule.maxOccurrences ?? 12,
    active: rule.active,
  };
}

function valueToDraft(value: RecurringFormValue): RecurringDraft {
  return {
    description: value.description.trim(),
    amount: value.amount ?? 0,
    kind: value.kind,
    accountId: value.accountId,
    toAccountId: value.kind === 'transfer' ? value.toAccountId : null,
    categoryId: value.kind === 'transfer' ? null : value.categoryId,
    frequency: value.frequency,
    interval: Math.max(1, value.interval),
    startDate: value.startDate,
    endDate: value.endMode === 'date' ? value.endDate : null,
    maxOccurrences: value.endMode === 'count' ? Math.max(1, value.maxOccurrences) : null,
    active: value.active,
  };
}

function RecurringFields({
  value,
  set,
  errors,
}: {
  value: RecurringFormValue;
  set: (patch: Partial<RecurringFormValue>) => void;
  errors: Record<string, string | undefined>;
}) {
  const { categories } = useLookups();

  return (
    <>
      <Segmented
        options={KIND_OPTIONS}
        value={value.kind}
        tone={KIND_TONE}
        onChange={(kind) => set({ kind, categoryId: null })}
      />

      <div className="grid cols-2 keep">
        <Field label="Valor" error={errors.amount}>
          {(id) => (
            <MoneyInput
              id={id}
              autoFocus
              value={value.amount}
              invalid={Boolean(errors.amount)}
              onChange={(amount) => set({ amount })}
            />
          )}
        </Field>
        <Field label="Primeiro vencimento" error={errors.startDate}>
          {(id) => (
            <input
              id={id}
              type="date"
              className="input"
              value={value.startDate}
              onChange={(e) => set({ startDate: e.target.value })}
            />
          )}
        </Field>
      </div>

      <Field label="Descrição" error={errors.description}>
        {(id) => (
          <input
            id={id}
            className="input"
            placeholder="Aluguel, salário, assinatura…"
            value={value.description}
            onChange={(e) => set({ description: e.target.value })}
          />
        )}
      </Field>

      <div className="grid cols-2">
        <Field label={value.kind === 'transfer' ? 'De' : 'Conta'}>
          {(id) => <AccountSelect id={id} value={value.accountId} onChange={(accountId) => set({ accountId })} />}
        </Field>
        {value.kind === 'transfer' ? (
          <Field label="Para" error={errors.toAccountId}>
            {(id) => (
              <AccountSelect
                id={id}
                value={value.toAccountId}
                exclude={value.accountId}
                onChange={(toAccountId) => set({ toAccountId })}
              />
            )}
          </Field>
        ) : (
          <Field label="Categoria">
            {(id) => (
              <CategorySelect
                id={id}
                value={value.categoryId}
                kind={value.kind}
                categories={categories}
                onChange={(categoryId) => set({ categoryId })}
              />
            )}
          </Field>
        )}
      </div>

      <div className="grid cols-2">
        <Field label="Repete">
          {(id) => (
            <select
              id={id}
              className="input select"
              value={value.frequency}
              onChange={(e) => set({ frequency: e.target.value as Frequency })}
            >
              {FREQUENCY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="A cada" hint={value.interval > 1 ? 'Ex.: 2 = a cada dois períodos' : undefined}>
          {(id) => (
            <input
              id={id}
              type="number"
              min={1}
              max={24}
              className="input"
              value={value.interval}
              onChange={(e) => set({ interval: Number(e.target.value) })}
            />
          )}
        </Field>
      </div>

      <Field label="Até quando">
        {(id) => (
          <select
            id={id}
            className="input select"
            value={value.endMode}
            onChange={(e) => set({ endMode: e.target.value as EndMode })}
          >
            <option value="never">Sem data para acabar</option>
            <option value="date">Até uma data</option>
            <option value="count">Por um número de vezes</option>
          </select>
        )}
      </Field>

      {value.endMode === 'date' && (
        <Field label="Última cobrança" error={errors.endDate}>
          {(id) => (
            <input
              id={id}
              type="date"
              className="input"
              value={value.endDate}
              onChange={(e) => set({ endDate: e.target.value })}
            />
          )}
        </Field>
      )}

      {value.endMode === 'count' && (
        <Field label="Número de cobranças">
          {(id) => (
            <input
              id={id}
              type="number"
              min={1}
              max={600}
              className="input"
              value={value.maxOccurrences}
              onChange={(e) => set({ maxOccurrences: Number(e.target.value) })}
            />
          )}
        </Field>
      )}
    </>
  );
}

function recurringErrors(value: RecurringFormValue): Record<string, string | undefined> {
  return {
    amount: !value.amount || value.amount <= 0 ? 'Informe um valor maior que zero.' : undefined,
    description: value.description.trim() ? undefined : 'Dê um nome à conta recorrente.',
    startDate: isValidISO(value.startDate) ? undefined : 'Data inválida.',
    endDate:
      value.endMode === 'date' && (!isValidISO(value.endDate) || value.endDate < value.startDate)
        ? 'A última cobrança precisa vir depois do primeiro vencimento.'
        : undefined,
    toAccountId:
      value.kind === 'transfer' && value.toAccountId === value.accountId
        ? 'A conta de destino precisa ser diferente.'
        : undefined,
  };
}

/** Formulário de regra recorrente, usado tanto para criar quanto para editar. */
export function RecurringDialog({ rule, onClose }: { rule?: RecurringRule; onClose: () => void }) {
  const { api } = useFinance();
  const { accounts } = useLookups();
  const [value, setValue] = useState<RecurringFormValue>(() =>
    rule
      ? ruleToValue(rule)
      : {
          kind: 'expense',
          amount: null,
          description: '',
          accountId: accounts[0]?.id ?? '',
          toAccountId: accounts[1]?.id ?? '',
          categoryId: null,
          frequency: 'monthly',
          interval: 1,
          startDate: today(),
          endMode: 'never',
          endDate: addMonths(today(), 12),
          maxOccurrences: 12,
          active: true,
        },
  );
  const [submitted, setSubmitted] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const errors = recurringErrors(value);
  const shown = submitted ? errors : {};

  function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    if (Object.values(errors).some(Boolean)) return;
    const draft = valueToDraft(value);
    if (rule) api.updateRecurring(rule.id, draft);
    else api.addRecurring(draft);
    onClose();
  }

  // Apagar mora aqui, e não numa coluna de botões na lista: a aba de Fixas é
  // de consulta, e a linha inteira abre este diálogo.
  if (confirming && rule) {
    return (
      <ConfirmDialog
        title="Apagar conta recorrente"
        message={`"${rule.description}" some dos próximos meses. Os lançamentos que você já confirmou continuam no histórico.`}
        onConfirm={() => {
          api.deleteRecurring(rule.id);
          onClose();
        }}
        onCancel={() => setConfirming(false)}
      />
    );
  }

  return (
    <Dialog
      title={rule ? 'Editar conta recorrente' : 'Nova conta recorrente'}
      onClose={onClose}
      footer={
        <>
          {rule && (
            <button type="button" className="btn danger" onClick={() => setConfirming(true)}>
              Apagar
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" form="recurring-form" className="btn primary">
            {rule ? 'Salvar' : 'Criar'}
          </button>
        </>
      }
    >
      <form
        id="recurring-form"
        onSubmit={submit}
        style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
      >
        <RecurringFields value={value} set={(patch) => setValue((v) => ({ ...v, ...patch }))} errors={shown} />
        {rule && (
          <label className="switch">
            <input
              type="checkbox"
              checked={value.active}
              onChange={(e) => setValue((v) => ({ ...v, active: e.target.checked }))}
            />
            <span>
              Ativa
              <span className="hint" style={{ display: 'block' }}>
                Desmarque para parar de gerar os próximos vencimentos, sem apagar o histórico.
              </span>
            </span>
          </label>
        )}
      </form>
    </Dialog>
  );
}

/* ---------------------------------------------------------------- criação */

type NewMode = 'single' | 'installment' | 'recurring';

export function NewEntryDialog({ defaultDate, onClose }: { defaultDate?: string; onClose: () => void }) {
  const { api } = useFinance();
  const [mode, setMode] = useState<NewMode>('single');
  const [state, set] = useSingleState(defaultDate ? { date: defaultDate } : {});
  const [submitted, setSubmitted] = useState(false);

  const errors = singleErrors(state);
  const shown = submitted ? errors : {};

  function submitSingle(event: FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    if (Object.keys(errors).length > 0) return;
    api.addEntry(toDraft(state));
    onClose();
  }

  const [recurringValue, setRecurringValue] = useState<RecurringFormValue>(() => ({
    kind: 'expense',
    amount: null,
    description: '',
    accountId: state.accountId,
    toAccountId: state.toAccountId,
    categoryId: null,
    frequency: 'monthly',
    interval: 1,
    startDate: defaultDate ?? today(),
    endMode: 'never',
    endDate: addMonths(defaultDate ?? today(), 12),
    maxOccurrences: 12,
    active: true,
  }));
  const recErrors = recurringErrors(recurringValue);

  function submitRecurring(event: FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    if (Object.values(recErrors).some(Boolean)) return;
    api.addRecurring(valueToDraft(recurringValue));
    onClose();
  }

  return (
    <Dialog
      title="Novo lançamento"
      onClose={onClose}
      footer={
        <>
          <span className="spacer" />
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" form="entry-form" className="btn primary">
            Adicionar
          </button>
        </>
      }
    >
      <Segmented
        options={[
          { value: 'single', label: 'Avulso' },
          { value: 'installment', label: 'Parcelado' },
          { value: 'recurring', label: 'Recorrente' },
        ]}
        value={mode}
        onChange={(next) => {
          setMode(next);
          setSubmitted(false);
        }}
      />

      {mode === 'single' && (
        <form id="entry-form" onSubmit={submitSingle} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <SingleFields state={state} set={set} errors={shown} />
        </form>
      )}

      {mode === 'installment' && <InstallmentForm onDone={onClose} />}

      {mode === 'recurring' && (
        <form id="entry-form" onSubmit={submitRecurring} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <RecurringFields
            value={recurringValue}
            set={(patch) => setRecurringValue((v) => ({ ...v, ...patch }))}
            errors={submitted ? recErrors : {}}
          />
          <p className="hint">
            {describeFrequency(recurringValue)}, a partir de {formatDate(recurringValue.startDate)}. Os próximos vencimentos aparecem como previstos e você
            confirma cada um quando pagar.
          </p>
        </form>
      )}
    </Dialog>
  );
}

/* ---------------------------------------------------------------- edição */

export function EditEntryDialog({ entry, onClose }: { entry: DisplayEntry; onClose: () => void }) {
  const { api } = useFinance();
  const [state, set] = useSingleState({
    kind: entry.kind,
    amount: entry.amount,
    description: entry.description,
    date: entry.date,
    accountId: entry.accountId,
    toAccountId: entry.toAccountId ?? '',
    categoryId: entry.categoryId ?? null,
    settled: entry.status === 'settled',
    notes: entry.notes ?? '',
  });
  const [submitted, setSubmitted] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const errors = singleErrors(state);
  const isProjection = 'projected' in entry && entry.projected === true;
  const isInstallment = Boolean(entry.purchaseId);

  function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    if (Object.keys(errors).length > 0) return;

    const draft = toDraft(state);
    if (isProjection) {
      // Editar uma ocorrência prevista a transforma em lançamento próprio,
      // preso à regra pela data original — as demais seguem intactas.
      api.materialize(entry, {
        ...draft,
        recurringId: entry.recurringId ?? null,
        occurrenceDate: entry.occurrenceDate ?? null,
      });
    } else {
      api.updateEntry(entry.id, {
        ...draft,
        recurringId: entry.recurringId ?? null,
        occurrenceDate: entry.occurrenceDate ?? null,
        purchaseId: entry.purchaseId ?? null,
        installmentNumber: entry.installmentNumber ?? null,
        installmentTotal: entry.installmentTotal ?? null,
      });
    }
    onClose();
  }

  function remove() {
    if (isProjection && entry.recurringId && entry.occurrenceDate) {
      api.skipOccurrence(entry.recurringId, entry.occurrenceDate);
    } else {
      api.deleteEntry(entry.id);
    }
    onClose();
  }

  if (confirming) {
    return (
      <ConfirmDialog
        title="Apagar lançamento"
        message={
          entry.recurringId
            ? 'Apaga apenas esta ocorrência. A conta recorrente continua ativa nos outros meses.'
            : isInstallment
              ? 'Apaga apenas esta parcela. As demais parcelas da compra continuam.'
              : 'Esta ação não pode ser desfeita.'
        }
        onConfirm={remove}
        onCancel={() => setConfirming(false)}
      />
    );
  }

  return (
    <Dialog
      title="Editar lançamento"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn danger" onClick={() => setConfirming(true)}>
            Apagar
          </button>
          <span className="spacer" />
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" form="edit-form" className="btn primary">
            Salvar
          </button>
        </>
      }
    >
      <form id="edit-form" onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {(entry.recurringId || isInstallment) && (
          <div className="banner">
            <span className="emoji" aria-hidden="true">
              {entry.recurringId ? '🔁' : '🧾'}
            </span>
            <span>
              {entry.recurringId
                ? 'Ocorrência de uma conta recorrente. A alteração vale só para este mês — para mudar todos, edite a conta recorrente.'
                : `Parcela ${entry.installmentNumber}/${entry.installmentTotal} de uma compra parcelada.`}
            </span>
          </div>
        )}
        <SingleFields state={state} set={set} errors={submitted ? errors : {}} lockKind={isInstallment} />
      </form>
    </Dialog>
  );
}
