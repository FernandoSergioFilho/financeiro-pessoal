/** Contas e categorias iniciais, e um conjunto de exemplo para experimentar. */

import { addMonths, currentMonthKey, monthStart, today } from '../domain/date.ts';
import { buildPurchase } from '../domain/installments.ts';
import { chaveDeNome } from '../domain/text.ts';
import type { Account, Category, FinanceData, RecurringRule, SeriesColor } from '../domain/types.ts';
import { SCHEMA_VERSION } from './schema.ts';

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const now = () => new Date().toISOString();

/**
 * O id de um cadastro padrão sai do NOME, e não de um sorteio.
 *
 * Esta linha é a correção de um defeito que voltou duas vezes: dois aparelhos
 * que semeiam criam, cada um, a sua "Alimentação" com um id diferente, e a
 * fusão — que junta por id, como tem de ser — não tem como saber que são a
 * mesma coisa. Saem duas.
 *
 * Com o id vindo do nome, dois aparelhos que semeiam chegam ao MESMO id, a
 * fusão junta as duas numa, e a duplicação deixa de ser possível — não importa
 * em que ordem as coisas aconteçam, nem se a decisão de semear foi tomada na
 * hora errada. É a diferença entre acertar o instante e não precisar acertá-lo.
 *
 * Um cadastro criado pela pessoa continua com id sorteado: dois "Mercado"
 * digitados em aparelhos diferentes são mesmo dois cadastros, e juntá-los é
 * decisão dela, no botão de repetidos.
 */
export function idPadrao(tipo: 'conta' | 'categoria', kind: string, nome: string): string {
  return `padrao:${tipo}:${kind}:${chaveDeNome(nome).replace(/\s+/g, '-')}`;
}

export function defaultAccounts(): Account[] {
  const updatedAt = now();
  const id = (kind: string, name: string) => idPadrao('conta', kind, name);
  return [
    { id: id('checking', 'Conta corrente'), name: 'Conta corrente', kind: 'checking', openingBalance: 0, color: 'blue', updatedAt },
    { id: id('cash', 'Carteira'), name: 'Carteira', kind: 'cash', openingBalance: 0, color: 'aqua', updatedAt },
    { id: id('credit_card', 'Cartão de crédito'), name: 'Cartão de crédito', kind: 'credit_card', openingBalance: 0, color: 'magenta', closingDay: 25, dueDay: 5, updatedAt },
  ];
}

/**
 * A ordem das cores segue a paleta validada para daltonismo: cada categoria
 * recebe o próximo slot. São oito slots para mais de oito categorias, então
 * alguma cor repete; quando repete, as duas ficam longe uma da outra na lista,
 * e quem separa de verdade é o nome ao lado da barra, não a cor.
 */
const EXPENSE_CATEGORIES: [string, string, SeriesColor][] = [
  ['Moradia', '🏠', 'blue'],
  ['Alimentação', '🍽️', 'orange'],
  ['Transporte', '🚌', 'aqua'],
  ['Saúde', '💊', 'yellow'],
  ['Educação', '📚', 'magenta'],
  ['Lazer', '🎬', 'green'],
  ['Caridade', '🤝', 'orange'],
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
    ...EXPENSE_CATEGORIES.map(([name, emoji, color]) => ({ id: idPadrao('categoria', 'expense', name), name, kind: 'expense' as const, emoji, color, updatedAt })),
    ...INCOME_CATEGORIES.map(([name, emoji, color]) => ({ id: idPadrao('categoria', 'income', name), name, kind: 'income' as const, emoji, color, updatedAt })),
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

/**
 * Categorias padrão que esta carteira ainda não tem.
 *
 * Serve para quem começou a usar o app antes de uma categoria existir: sem
 * isto, uma categoria nova só apareceria para quem instalasse do zero. É uma
 * oferta, não um aviso — quem apagou uma categoria de propósito continua vendo
 * o atalho, e simplesmente não clica.
 */
export function categoriasPadraoQueFaltam(existentes: readonly Category[]): Category[] {
  const tem = new Set(existentes.map((c) => `${c.kind}:${chaveDeNome(c.name)}`));
  return defaultCategories().filter((padrao) => !tem.has(`${padrao.kind}:${chaveDeNome(padrao.name)}`));
}

/**
 * As contas padrão que ainda não existem, comparando por nome.
 *
 * O par de `categoriasPadraoQueFaltam`, pelo mesmo motivo: "Conta Corrente" e
 * "conta corrente" são a mesma conta para quem olha a tela, e criar a segunda
 * é criar um repetido.
 */
export function contasPadraoQueFaltam(existentes: readonly Account[]): Account[] {
  const tem = new Set(existentes.map((c) => `${c.kind}:${chaveDeNome(c.name)}`));
  return defaultAccounts().filter((padrao) => !tem.has(`${padrao.kind}:${chaveDeNome(padrao.name)}`));
}

/**
 * Semear SEM poder destruir nem repetir.
 *
 * A semeadura antiga trocava a carteira inteira por `initialData()`. Isso tem
 * duas consequências que só aparecem com sincronização ligada, e as duas
 * morderam o usuário:
 *
 * 1. **Apaga.** Se a decisão de semear escapar por um triz — a sincronização
 *    avisa que terminou um instante antes de os dados chegarem à tela —, a
 *    troca joga fora o que acabou de vir do servidor. Quem olha vê a carteira
 *    "sem o que eu já tinha colocado".
 * 2. **Repete.** Cada semeadura sorteia ids novos, então o que voltar depois
 *    convive com o que foi criado: duas "Alimentação", duas "Conta corrente".
 *
 * Aqui o pior caso é não fazer nada. Só entram os padrões que faltam, pelo
 * nome; nada é removido, nenhum lançamento é tocado, e se não falta nada a
 * função devolve o **mesmo objeto**, o que torna uma chamada indevida um
 * silêncio em vez de um estrago.
 */
export function semearSemApagar(data: FinanceData): FinanceData {
  const contas = contasPadraoQueFaltam(data.accounts);
  const categorias = categoriasPadraoQueFaltam(data.categories);
  if (contas.length === 0 && categorias.length === 0) return data;
  return {
    ...data,
    accounts: [...data.accounts, ...contas],
    categories: [...data.categories, ...categorias],
  };
}
