/** Contas e categorias iniciais, e um conjunto de exemplo para experimentar. */

import { addMonths, currentMonthKey, monthStart, today } from '../domain/date.ts';
import { buildPurchase } from '../domain/installments.ts';
import type { Account, Category, FinanceData, RecurringRule, SeriesColor } from '../domain/types.ts';
import { SCHEMA_VERSION } from './schema.ts';

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const now = () => new Date().toISOString();

export function defaultAccounts(): Account[] {
  const updatedAt = now();
  return [
    { id: newId(), name: 'Conta corrente', kind: 'checking', openingBalance: 0, color: 'blue', updatedAt },
    { id: newId(), name: 'Carteira', kind: 'cash', openingBalance: 0, color: 'aqua', updatedAt },
    { id: newId(), name: 'Cartão de crédito', kind: 'credit_card', openingBalance: 0, color: 'magenta', closingDay: 25, dueDay: 5, updatedAt },
  ];
}

/**
 * A ordem das cores segue a paleta validada para daltonismo: cada categoria
 * recebe o próximo slot, sem repetir enquanto houver slot livre.
 */
const EXPENSE_CATEGORIES: [string, string, SeriesColor][] = [
  ['Moradia', '🏠', 'blue'],
  ['Alimentação', '🍽️', 'orange'],
  ['Transporte', '🚌', 'aqua'],
  ['Saúde', '💊', 'yellow'],
  ['Educação', '📚', 'magenta'],
  ['Lazer', '🎬', 'green'],
  ['Compras', '🛍️', 'violet'],
  ['Serviços', '🔌', 'red'],
  ['Outros', '📦', 'blue'],
];

const INCOME_CATEGORIES: [string, string, SeriesColor][] = [
  ['Salário', '💼', 'green'],
  ['Freelance', '🧾', 'aqua'],
  ['Rendimentos', '📈', 'blue'],
  ['Outros', '✨', 'violet'],
];

export function defaultCategories(): Category[] {
  const updatedAt = now();
  return [
    ...EXPENSE_CATEGORIES.map(([name, emoji, color]) => ({ id: newId(), name, kind: 'expense' as const, emoji, color, updatedAt })),
    ...INCOME_CATEGORIES.map(([name, emoji, color]) => ({ id: newId(), name, kind: 'income' as const, emoji, color, updatedAt })),
  ];
}

/** Estado de um app recém-instalado: estrutura pronta, nenhum lançamento. */
export function initialData(): FinanceData {
  return {
    version: SCHEMA_VERSION,
    accounts: defaultAccounts(),
    categories: defaultCategories(),
    entries: [],
    recurring: [],
    purchases: [],
    tombstones: [],
  };
}

/**
 * Conjunto de exemplo, ancorado no mês atual, para conferir os cálculos sem
 * precisar digitar meia dúzia de lançamentos antes.
 */
export function demoData(): FinanceData {
  const base = initialData();
  const [corrente, carteira, cartao] = base.accounts as [Account, Account, Account];
  const category = (name: string) => base.categories.find((c) => c.name === name)?.id ?? null;

  const month = currentMonthKey();
  const day = (n: number) => `${month}-${String(n).padStart(2, '0')}`;
  const stamp = now();

  corrente.openingBalance = 320000;
  carteira.openingBalance = 15000;

  const recurring: RecurringRule[] = [
    {
      id: newId(),
      description: 'Salário',
      amount: 650000,
      kind: 'income',
      accountId: corrente.id,
      toAccountId: null,
      categoryId: category('Salário'),
      frequency: 'monthly',
      interval: 1,
      startDate: monthStart(month),
      endDate: null,
      maxOccurrences: null,
      active: true,
      skippedDates: [],
      createdAt: stamp,
      updatedAt: stamp,
    },
    {
      id: newId(),
      description: 'Aluguel',
      amount: 180000,
      kind: 'expense',
      accountId: corrente.id,
      toAccountId: null,
      categoryId: category('Moradia'),
      frequency: 'monthly',
      interval: 1,
      startDate: day(10),
      endDate: null,
      maxOccurrences: null,
      active: true,
      skippedDates: [],
      createdAt: stamp,
      updatedAt: stamp,
    },
    {
      id: newId(),
      description: 'Internet',
      amount: 12990,
      kind: 'expense',
      accountId: corrente.id,
      toAccountId: null,
      categoryId: category('Serviços'),
      frequency: 'monthly',
      interval: 1,
      startDate: day(15),
      endDate: null,
      maxOccurrences: null,
      active: true,
      skippedDates: [],
      createdAt: stamp,
      updatedAt: stamp,
    },
    {
      id: newId(),
      description: 'Streaming',
      amount: 5590,
      kind: 'expense',
      accountId: cartao.id,
      toAccountId: null,
      categoryId: category('Lazer'),
      frequency: 'monthly',
      interval: 1,
      startDate: day(8),
      endDate: null,
      maxOccurrences: null,
      active: true,
      skippedDates: [],
      createdAt: stamp,
      updatedAt: stamp,
    },
    {
      id: newId(),
      description: 'Seguro do carro',
      amount: 142000,
      kind: 'expense',
      accountId: corrente.id,
      toAccountId: null,
      categoryId: category('Transporte'),
      frequency: 'yearly',
      interval: 1,
      startDate: day(20),
      endDate: null,
      maxOccurrences: null,
      active: true,
      skippedDates: [],
      createdAt: stamp,
      updatedAt: stamp,
    },
  ];

  const notebook = buildPurchase(
    {
      description: 'Notebook',
      totalAmount: 450000,
      installments: 10,
      firstDate: addMonths(day(12), -2),
      accountId: cartao.id,
      categoryId: category('Compras'),
    },
    newId,
  );

  const geladeira = buildPurchase(
    {
      description: 'Geladeira',
      totalAmount: 289990,
      installments: 6,
      firstDate: day(5),
      accountId: cartao.id,
      categoryId: category('Compras'),
    },
    newId,
  );

  const avulsos = [
    { date: day(2), description: 'Supermercado', amount: 43250, category: 'Alimentação', account: corrente.id },
    { date: day(4), description: 'Padaria', amount: 2800, category: 'Alimentação', account: carteira.id },
    { date: day(6), description: 'Combustível', amount: 25000, category: 'Transporte', account: corrente.id },
    { date: day(9), description: 'Farmácia', amount: 8740, category: 'Saúde', account: corrente.id },
    { date: day(11), description: 'Cinema', amount: 6400, category: 'Lazer', account: cartao.id },
    { date: day(14), description: 'Supermercado', amount: 38990, category: 'Alimentação', account: corrente.id },
  ].map((item) => ({
    id: newId(),
    date: item.date,
    description: item.description,
    amount: item.amount,
    kind: 'expense' as const,
    accountId: item.account,
    toAccountId: null,
    categoryId: category(item.category),
    status: item.date <= today() ? ('settled' as const) : ('pending' as const),
    recurringId: null,
    occurrenceDate: null,
    purchaseId: null,
    installmentNumber: null,
    installmentTotal: null,
    createdAt: stamp,
    updatedAt: stamp,
  }));

  return {
    ...base,
    entries: [...avulsos, ...notebook.entries, ...geladeira.entries],
    recurring,
    purchases: [notebook.purchase, geladeira.purchase],
  };
}
