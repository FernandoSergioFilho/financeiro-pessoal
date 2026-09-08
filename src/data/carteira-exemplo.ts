/**
 * Uma carteira parecida com a de verdade, para as simulações.
 *
 * Duas pessoas, três contas correntes e quatro cartões — o cenário que o app
 * precisa aguentar. Não é o "carregar exemplo" da tela (`demoData`, três contas
 * e meia dúzia de lançamentos): é o caso pesado, com histórico de um ano,
 * parcelamentos longos, recorrentes, transferências e as armadilhas que já
 * viraram bug alguma vez.
 *
 * Fica em `data/` e não nos testes porque tanto o Vitest quanto a simulação no
 * navegador precisam exatamente da mesma carteira — se cada um montasse a sua,
 * um passaria e o outro não, e não dava para confiar em nenhum dos dois.
 */

import { addMonths, monthKey, monthStart } from '../domain/date.ts';
import { buildPurchase } from '../domain/installments.ts';
import type {
  Account,
  Category,
  Entry,
  FinanceData,
  InstallmentPurchase,
  RecurringRule,
} from '../domain/types.ts';
import { SCHEMA_VERSION } from './schema.ts';

/** Gerador determinístico: a mesma carteira em toda execução. */
function contador(prefixo: string): () => string {
  let n = 0;
  return () => `${prefixo}${(n += 1)}`;
}

export interface OpcoesCarteira {
  /** A data que faz as vezes de "hoje". */
  hoje: string;
}

export function carteiraExemplo({ hoje }: OpcoesCarteira): FinanceData {
  const id = contador('x');
  const stamp = `${hoje}T09:00:00.000Z`;
  const mes = (n: number) => monthKey(addMonths(hoje, n));
  const dia = (n: number, d: number) => `${mes(n)}-${String(d).padStart(2, '0')}`;

  const conta = (nome: string, kind: Account['kind'], openingBalance: number, color: Account['color'], extra: Partial<Account> = {}): Account => ({
    id: id(), name: nome, kind, openingBalance, color, updatedAt: stamp, ...extra,
  });

  const accounts: Account[] = [
    conta('Nubank', 'checking', 480000, 'violet'),
    conta('Itaú', 'checking', 265000, 'orange'),
    conta('Banco do Brasil', 'checking', 132000, 'aqua'),
    conta('Nubank cartão', 'credit_card', 0, 'violet', { closingDay: 28, dueDay: 5 }),
    conta('Itaú cartão', 'credit_card', 0, 'orange', { closingDay: 20, dueDay: 1 }),
    conta('Inter cartão', 'credit_card', 0, 'blue', { closingDay: 25, dueDay: 10 }),
    conta('Amex', 'credit_card', 0, 'magenta', { closingDay: 15, dueDay: 25 }),
    conta('Tesouro Direto', 'investment', 1500000, 'green'),
    conta('Carteira', 'cash', 12000, 'yellow'),
  ];
  const [nubank, itau, bb, nucard, itaucard, intercard, amex, tesouro] = accounts as [
    Account, Account, Account, Account, Account, Account, Account, Account, Account,
  ];

  const categoria = (nome: string, kind: Category['kind'], emoji: string, color: Category['color']): Category => ({
    id: id(), name: nome, kind, emoji, color, updatedAt: stamp,
  });

  const categories: Category[] = [
    categoria('Salário', 'income', '💰', 'green'),
    categoria('Freelas', 'income', '🧑‍💻', 'aqua'),
    categoria('Moradia', 'expense', '🏠', 'blue'),
    categoria('Alimentação', 'expense', '🍽️', 'orange'),
    categoria('Transporte', 'expense', '🚗', 'aqua'),
    categoria('Saúde', 'expense', '🩺', 'magenta'),
    categoria('Lazer', 'expense', '🎬', 'violet'),
    categoria('Educação', 'expense', '📚', 'green'),
  ];
  const [salario, freelas, moradia, alimentacao, transporte, saude, lazer, educacao] = categories as [
    Category, Category, Category, Category, Category, Category, Category, Category,
  ];

  const entries: Entry[] = [];
  const lancamento = (over: Partial<Entry> & Pick<Entry, 'date' | 'description' | 'amount' | 'kind' | 'accountId'>): Entry => {
    const entry: Entry = {
      id: id(), toAccountId: null, categoryId: null, status: 'settled',
      recurringId: null, occurrenceDate: null, purchaseId: null,
      installmentNumber: null, installmentTotal: null,
      createdAt: stamp, updatedAt: stamp, ...over,
    };
    entries.push(entry);
    return entry;
  };

  // Doze meses de histórico: sem isso não há média com que comparar, e todo
  // gráfico de tendência fica sem nada para dizer.
  for (let n = -11; n <= 0; n += 1) {
    lancamento({ date: dia(n, 5), description: 'Salário — Fernando', amount: 780000, kind: 'income', accountId: nubank.id, categoryId: salario.id });
    lancamento({ date: dia(n, 5), description: 'Salário — Marina', amount: 610000, kind: 'income', accountId: itau.id, categoryId: salario.id });
    lancamento({ date: dia(n, 10), description: 'Aluguel', amount: 245000, kind: 'expense', accountId: nubank.id, categoryId: moradia.id });
    lancamento({ date: dia(n, 12), description: 'Luz', amount: 18500 + n * 900, kind: 'expense', accountId: itau.id, categoryId: moradia.id });
    lancamento({ date: dia(n, 15), description: 'Mercado do mês', amount: 92000 + ((n * 37) % 11) * 1000, kind: 'expense', accountId: nucard.id, categoryId: alimentacao.id });
    lancamento({ date: dia(n, 18), description: 'Combustível', amount: 34000, kind: 'expense', accountId: itaucard.id, categoryId: transporte.id });
    lancamento({ date: dia(n, 22), description: 'Restaurante', amount: 16000 + ((n * 13) % 7) * 2000, kind: 'expense', accountId: nucard.id, categoryId: alimentacao.id });
    lancamento({ date: dia(n, 25), description: 'Guardar', amount: 100000, kind: 'transfer', accountId: nubank.id, toAccountId: tesouro.id });
    if (n % 3 === 0) {
      lancamento({ date: dia(n, 20), description: 'Freela de design', amount: 150000, kind: 'income', accountId: itau.id, categoryId: freelas.id });
    }
  }

  // Um lançamento antigo numa conta que, fora ele, não tem nada — o caso que
  // fazia a conta parecer vazia e mesmo assim não deixar apagar.
  lancamento({ date: dia(-11, 3), description: 'Tarifa antiga', amount: 3200, kind: 'expense', accountId: bb.id, categoryId: moradia.id });

  // E um previsto lá na frente, fora de qualquer mês que alguém vá olhar.
  lancamento({ date: dia(9, 14), description: 'Seguro do carro', amount: 210000, kind: 'expense', accountId: amex.id, categoryId: transporte.id, status: 'pending' });

  const purchases: InstallmentPurchase[] = [];
  const parcelar = (descricao: string, total: number, vezes: number, primeiro: string, accountId: string, categoryId: string) => {
    const { purchase, entries: parcelas } = buildPurchase(
      { description: descricao, totalAmount: total, installments: vezes, firstDate: primeiro, accountId, categoryId },
      id,
      stamp,
    );
    purchases.push(purchase);
    entries.push(...parcelas);
  };

  parcelar('Notebook', 720000, 12, dia(-4, 8), nucard.id, educacao.id);
  parcelar('Geladeira', 384000, 10, dia(-2, 15), itaucard.id, moradia.id);
  parcelar('Passagens', 540000, 6, dia(-1, 3), intercard.id, lazer.id);
  parcelar('Dentista', 240000, 8, dia(0, 6), amex.id, saude.id);

  const recorrente = (over: Partial<RecurringRule> & Pick<RecurringRule, 'description' | 'amount' | 'kind' | 'accountId'>): RecurringRule => ({
    id: id(), toAccountId: null, categoryId: null,
    frequency: 'monthly', interval: 1, startDate: monthStart(mes(-11)),
    endDate: null, maxOccurrences: null, skippedDates: [], active: true,
    createdAt: stamp, updatedAt: stamp, ...over,
  });

  const recurring: RecurringRule[] = [
    recorrente({ description: 'Internet', amount: 12900, kind: 'expense', accountId: nubank.id, categoryId: moradia.id, startDate: dia(-11, 8) }),
    recorrente({ description: 'Streaming', amount: 5590, kind: 'expense', accountId: nucard.id, categoryId: lazer.id, startDate: dia(-11, 14) }),
    recorrente({ description: 'Academia', amount: 13900, kind: 'expense', accountId: itaucard.id, categoryId: saude.id, startDate: dia(-11, 2) }),
    recorrente({ description: 'Plano de saúde', amount: 89000, kind: 'expense', accountId: itau.id, categoryId: saude.id, startDate: dia(-11, 20) }),
    recorrente({ description: 'Faculdade da Marina', amount: 118000, kind: 'expense', accountId: itau.id, categoryId: educacao.id, startDate: dia(-11, 7) }),
  ];

  return { version: SCHEMA_VERSION, accounts, categories, entries, recurring, purchases, tombstones: [] };
}
