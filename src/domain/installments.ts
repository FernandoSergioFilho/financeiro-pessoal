/**
 * Compras parceladas.
 *
 * Diferente da recorrente, o total é finito e conhecido no cadastro, então
 * as parcelas viram lançamentos reais na hora: dá para editar a parcela de
 * março isoladamente sem precisar de um modelo de exceções, e a fatura
 * futura já nasce completa.
 */

import { addMonths } from './date.ts';
import { splitInstallments } from './money.ts';
import type { Entry, FinanceData, InstallmentPurchase } from './types.ts';

/**
 * A marca de parcela que o banco escreve na descrição.
 *
 * O Nubank escreve "Netshoes - Parcela 1/6"; outros escrevem "LOJA X 2/10" ou
 * "Compra parcelada 3 de 12". Reconhecer isso é o que permite propor sozinho
 * "esta linha é uma compra em 6 vezes" — a pessoa confirma ou corrige, mas não
 * precisa contar as parcelas na mão.
 *
 * O denominador é limitado a 120 porque acima disso é quase certo que o número
 * casado veio de outra coisa (uma data, um código de estabelecimento), e um
 * parcelamento inventado em 500 vezes seria pior que nenhum.
 */
export interface MarcaDeParcela {
  numero: number;
  total: number;
}

const PADROES_DE_PARCELA: RegExp[] = [
  // "Parcela 1/6", "parcelada 3 de 12" — a palavra antes remove a dúvida.
  /parcela\w*\s+(\d{1,3})\s*(?:\/|de)\s*(\d{1,3})\b/i,
  /\((\d{1,3})\s*(?:\/|de)\s*(\d{1,3})\)/,
  /\b(\d{1,3})\s+de\s+(\d{1,3})\b/i,
  /\b(\d{1,3})\s*\/\s*(\d{1,3})\b/,
];

export function lerMarcaDeParcela(descricao: string): MarcaDeParcela | null {
  for (const padrao of PADROES_DE_PARCELA) {
    const achado = padrao.exec(descricao);
    if (!achado) continue;
    const numero = Number(achado[1]);
    const total = Number(achado[2]);
    if (numero >= 1 && total >= 2 && total <= 120 && numero <= total) return { numero, total };
  }
  return null;
}

/**
 * A descrição sem a marca de parcela, e sem o traço que a prendia.
 *
 * O extrato do banco traz "Nina Saude Floripa - Parcela 1/10". Guardar isso
 * como nome da compra faria as dez parcelas se chamarem "Parcela 1/10" — a
 * segunda diria 1/10 no nome e 2/10 na etiqueta, contradizendo a si mesma.
 * O nome da compra é o que sobra: "Nina Saude Floripa".
 */
export function descricaoSemMarcaDeParcela(descricao: string): string {
  let limpa = descricao;
  for (const padrao of PADROES_DE_PARCELA) {
    limpa = limpa.replace(padrao, ' ');
  }
  return (
    limpa
      // "Nina Saude Floripa - " e "Loja X — " perdem o traço que ficou órfão.
      .replace(/[\s\u2013\u2014-]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim() || descricao.trim()
  );
}

/** "Nina Saude Floripa 3/10" — o nome que cada parcela carrega. */
export function descricaoDaParcela(base: string, numero: number, total: number): string {
  return `${descricaoSemMarcaDeParcela(base)} ${numero}/${total}`;
}

export interface PurchaseDraft {
  description: string;
  totalAmount: number;
  installments: number;
  firstDate: string;
  accountId: string;
  categoryId?: string | null;
}

/**
 * Monta a compra e suas parcelas. As parcelas caem no mesmo dia do mês da
 * primeira; meses curtos puxam para o último dia (31/01 → 28/02).
 */
export function buildPurchase(
  draft: PurchaseDraft,
  newId: () => string,
  now = new Date().toISOString(),
): { purchase: InstallmentPurchase; entries: Entry[] } {
  // O nome da compra é o do estabelecimento; o número fica em cada parcela.
  const nomeBase = descricaoSemMarcaDeParcela(draft.description);

  const purchase: InstallmentPurchase = {
    id: newId(),
    description: nomeBase,
    totalAmount: draft.totalAmount,
    installments: draft.installments,
    firstDate: draft.firstDate,
    accountId: draft.accountId,
    categoryId: draft.categoryId ?? null,
    createdAt: now,
    updatedAt: now,
  };

  const amounts = splitInstallments(draft.totalAmount, draft.installments);

  const entries: Entry[] = amounts.map((amount, i) => {
    const date = addMonths(draft.firstDate, i);
    return {
      id: newId(),
      date,
      // Cada parcela diz qual é: sem isto, as dez linhas da lista ficavam com
      // o mesmo texto e só a etiqueta as distinguia — e, quando o texto vinha
      // do banco já numerado, ele contradizia a etiqueta.
      description: descricaoDaParcela(nomeBase, i + 1, draft.installments),
      amount,
      kind: 'expense',
      accountId: draft.accountId,
      toAccountId: null,
      categoryId: draft.categoryId ?? null,
      // Toda parcela nasce prevista, inclusive as de data já vencida.
      // Antes, as vencidas entravam como pagas — o app decidia por conta
      // própria que uma data no passado significa dinheiro que saiu, e não
      // significa: a compra pode ter sido cancelada, a fatura pode não ter
      // sido paga, e a pessoa via como quitado o que ainda devia. Quem diz
      // que pagou é quem pagou, no ✓ da lista.
      status: 'pending',
      recurringId: null,
      occurrenceDate: null,
      purchaseId: purchase.id,
      installmentNumber: i + 1,
      installmentTotal: draft.installments,
      createdAt: now,
      updatedAt: now,
    };
  });

  return { purchase, entries };
}

export interface PurchaseProgress {
  paid: number;
  total: number;
  paidAmount: number;
  remainingAmount: number;
  nextDate: string | null;
}

export function purchaseProgress(
  purchase: InstallmentPurchase,
  entries: readonly Entry[],
): PurchaseProgress {
  const own = entries
    .filter((e) => e.purchaseId === purchase.id)
    .sort((a, b) => a.date.localeCompare(b.date));

  const settled = own.filter((e) => e.status === 'settled');
  const pending = own.filter((e) => e.status === 'pending');

  return {
    paid: settled.length,
    total: own.length || purchase.installments,
    paidAmount: settled.reduce((sum, e) => sum + e.amount, 0),
    remainingAmount: pending.reduce((sum, e) => sum + e.amount, 0),
    nextDate: pending[0]?.date ?? null,
  };
}

/** "3/10" — sufixo de parcela na descrição do lançamento. */
export function installmentLabel(entry: Entry): string | null {
  if (!entry.installmentNumber || !entry.installmentTotal) return null;
  return `${entry.installmentNumber}/${entry.installmentTotal}`;
}

export interface ResultadoDeRenomeacao {
  data: FinanceData;
  /** Quantas parcelas mudaram de nome. */
  parcelas: number;
  /** Quantas compras perderam a marca de parcela do nome. */
  compras: number;
}

/**
 * Acerta o nome das parcelas que já estão gravadas.
 *
 * As compras importadas antes desta correção ficaram com as dez parcelas
 * chamadas "Nina Saude Floripa - Parcela 1/10": a segunda dizia 1/10 no nome e
 * 2/10 na etiqueta. Isto reescreve cada parcela a partir do nome limpo da
 * compra, e tira a marca do nome da compra.
 *
 * É ação pedida, e não automática: uma parcela pode ter sido renomeada de
 * propósito ("Nina — consulta de outubro"), e reescrever isso calado seria
 * apagar uma decisão da pessoa.
 */
export function corrigirNomesDeParcelas(data: FinanceData, agora: string): ResultadoDeRenomeacao {
  const nomePorCompra = new Map<string, string>();
  let compras = 0;

  const purchases = data.purchases.map((purchase) => {
    const base = descricaoSemMarcaDeParcela(purchase.description);
    nomePorCompra.set(purchase.id, base);
    if (base === purchase.description) return purchase;
    compras += 1;
    return { ...purchase, description: base, updatedAt: agora };
  });

  let parcelas = 0;
  const entries = data.entries.map((entry) => {
    if (!entry.purchaseId || !entry.installmentNumber || !entry.installmentTotal) return entry;
    const base = nomePorCompra.get(entry.purchaseId);
    if (!base) return entry; // parcela órfã: sem compra, não há nome de onde partir
    const esperado = descricaoDaParcela(base, entry.installmentNumber, entry.installmentTotal);
    if (entry.description === esperado) return entry;
    parcelas += 1;
    return { ...entry, description: esperado, updatedAt: agora };
  });

  if (parcelas === 0 && compras === 0) return { data, parcelas: 0, compras: 0 };
  return { data: { ...data, entries, purchases }, parcelas, compras };
}

/** Quantas parcelas gravadas não batem com o próprio número. */
export function parcelasComNomeErrado(data: FinanceData): number {
  return corrigirNomesDeParcelas(data, '').parcelas;
}
