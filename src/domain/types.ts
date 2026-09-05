/**
 * Modelo de dados do controle financeiro.
 *
 * Todo valor monetário é armazenado em centavos (inteiro) para evitar os
 * erros de arredondamento de ponto flutuante. Toda data é uma string
 * `YYYY-MM-DD` no fuso local do usuário — nunca um `Date`, que carrega
 * fuso horário e quebra a comparação entre dias.
 */

export type AccountKind = 'checking' | 'savings' | 'cash' | 'credit_card' | 'investment';

/**
 * Cor guardada como nome de posição na paleta, não como hex: o tema escuro
 * usa outro passo da mesma família, e o dado não precisa saber disso.
 */
export type SeriesColor =
  | 'blue' | 'orange' | 'aqua' | 'yellow'
  | 'magenta' | 'green' | 'violet' | 'red';

export const SERIES_COLORS: SeriesColor[] = [
  'blue', 'orange', 'aqua', 'yellow', 'magenta', 'green', 'violet', 'red',
];

export interface Account {
  id: string;
  name: string;
  kind: AccountKind;
  /** Saldo do dia em que a conta passou a ser controlada aqui. */
  openingBalance: number;
  color: SeriesColor;
  /** Cartão de crédito: dia do fechamento da fatura. */
  closingDay?: number | null;
  /** Cartão de crédito: dia do vencimento da fatura. */
  dueDay?: number | null;
  archived?: boolean;
}

export type CategoryKind = 'income' | 'expense';

export interface Category {
  id: string;
  name: string;
  kind: CategoryKind;
  color: SeriesColor;
  emoji: string;
  archived?: boolean;
}

/** Entrada, saída ou movimentação entre contas próprias. */
export type EntryKind = 'income' | 'expense' | 'transfer';

/** `pending` = previsto/a pagar; `settled` = já saiu ou entrou de fato. */
export type EntryStatus = 'pending' | 'settled';

export interface Entry {
  id: string;
  date: string;
  description: string;
  /** Sempre positivo; o sinal vem de `kind`. */
  amount: number;
  kind: EntryKind;
  accountId: string;
  /** Conta de destino, apenas quando `kind === 'transfer'`. */
  toAccountId?: string | null;
  categoryId?: string | null;
  status: EntryStatus;
  notes?: string;

  /** Regra recorrente que originou este lançamento, se houver. */
  recurringId?: string | null;
  /** Data da ocorrência projetada que este lançamento materializa. */
  occurrenceDate?: string | null;

  /** Compra parcelada que originou este lançamento, se houver. */
  purchaseId?: string | null;
  installmentNumber?: number | null;
  installmentTotal?: number | null;

  createdAt: string;
  updatedAt: string;
}

export type Frequency = 'weekly' | 'monthly' | 'yearly';

/**
 * Conta recorrente: salário, aluguel, assinatura, mensalidade.
 *
 * A regra é a fonte da verdade — as ocorrências futuras são projetadas a
 * partir dela, não gravadas. Uma ocorrência só vira `Entry` quando o
 * usuário a edita ou confirma, e some da projeção via `skippedDates`.
 */
export interface RecurringRule {
  id: string;
  description: string;
  amount: number;
  kind: EntryKind;
  accountId: string;
  toAccountId?: string | null;
  categoryId?: string | null;
  frequency: Frequency;
  /** A cada N períodos: 1 = todo mês, 2 = a cada dois meses. */
  interval: number;
  startDate: string;
  endDate?: string | null;
  maxOccurrences?: number | null;
  active: boolean;
  /** Datas de ocorrências que o usuário apagou individualmente. */
  skippedDates: string[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Compra parcelada.
 *
 * Ao contrário da recorrente, o total é finito e conhecido, então as
 * parcelas são gravadas como `Entry` reais no momento do cadastro — o que
 * permite editar uma parcela isolada sem inventar um modelo de exceções.
 */
export interface InstallmentPurchase {
  id: string;
  description: string;
  totalAmount: number;
  installments: number;
  firstDate: string;
  accountId: string;
  categoryId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FinanceData {
  version: number;
  accounts: Account[];
  categories: Category[];
  entries: Entry[];
  recurring: RecurringRule[];
  purchases: InstallmentPurchase[];
}

/** Ocorrência ainda não materializada, exibida junto dos lançamentos reais. */
export interface ProjectedEntry extends Omit<Entry, 'createdAt' | 'updatedAt'> {
  /** Distingue a projeção de um lançamento gravado. */
  projected: true;
}

export type DisplayEntry = (Entry & { projected?: false }) | ProjectedEntry;
