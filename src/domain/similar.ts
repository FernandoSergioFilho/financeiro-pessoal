/**
 * Procurar lançamento repetido antes de gravar.
 *
 * Lançar duas vezes a mesma conta é o erro mais fácil de cometer num app de
 * finanças: a pessoa registra pelo celular, esquece, e registra de novo pelo
 * computador. O estrago é silencioso — o saldo fica errado e nada avisa.
 *
 * A busca é de propósito conservadora. Um alarme falso ensina a pessoa a
 * clicar em "gravar mesmo assim" sem ler, e aí o aviso deixa de servir para
 * qualquer coisa. Por isso o valor tem de bater **exatamente** e a descrição
 * tem de ser a mesma (ou uma conter a outra: "Mercado" dentro de "Mercado do
 * mês"); só a data é que tem folga.
 */

import { addDays } from './date.ts';
import { chaveDeNome } from './text.ts';
import type { DisplayEntry, Entry, InstallmentPurchase, RecurringRule } from './types.ts';

/** Quantos dias de diferença ainda contam como "pode ser o mesmo". */
export const DIAS_DE_FOLGA = 7;

export type Motivo = 'igual' | 'parecido';

export interface Semelhante {
  entry: Entry;
  /** `igual`: mesma data e mesma descrição. `parecido`: data por perto. */
  motivo: Motivo;
}

/** Descrição comparável: sem acento, sem caixa, sem pontuação, sem espaço à toa. */
export function textoComparavel(valor: string): string {
  return chaveDeNome(valor)
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function descricoesBatem(a: string, b: string): boolean {
  const x = textoComparavel(a);
  const y = textoComparavel(b);
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
}

export interface RascunhoLancamento {
  date: string;
  description: string;
  amount: number;
  kind: Entry['kind'];
  accountId: string;
}

/**
 * Lançamentos já gravados que podem ser este mesmo.
 *
 * `ignorar` existe para a edição: ao mudar um lançamento, ele não pode
 * aparecer como cópia de si próprio.
 */
export function procurarSemelhantes(
  entries: readonly Entry[],
  rascunho: RascunhoLancamento,
  { diasDeFolga = DIAS_DE_FOLGA, ignorar }: { diasDeFolga?: number; ignorar?: string } = {},
): Semelhante[] {
  const de = addDays(rascunho.date, -diasDeFolga);
  const ate = addDays(rascunho.date, diasDeFolga);

  const achados: Semelhante[] = [];
  for (const entry of entries) {
    if (entry.id === ignorar) continue;
    if (entry.amount !== rascunho.amount) continue;
    if (entry.kind !== rascunho.kind) continue;
    if (entry.date < de || entry.date > ate) continue;
    if (!descricoesBatem(entry.description, rascunho.description)) continue;

    const mesmoDia = entry.date === rascunho.date;
    const mesmoTexto = textoComparavel(entry.description) === textoComparavel(rascunho.description);
    achados.push({ entry, motivo: mesmoDia && mesmoTexto ? 'igual' : 'parecido' });
  }

  // O mais provável primeiro: exato antes de parecido, mais perto antes de
  // mais longe. Quem lê o aviso decide olhando o primeiro da lista.
  return achados.sort((a, b) => {
    if (a.motivo !== b.motivo) return a.motivo === 'igual' ? -1 : 1;
    const distancia = (s: Semelhante) => Math.abs(Number(s.entry.date.replaceAll('-', '')) - Number(rascunho.date.replaceAll('-', '')));
    return distancia(a) - distancia(b);
  });
}

export interface RascunhoRegra {
  description: string;
  amount: number;
  kind: RecurringRule['kind'];
  frequency: RecurringRule['frequency'];
  interval: number;
}

/**
 * Regra recorrente que já faz o mesmo.
 *
 * Aqui não há folga de data: duas regras iguais cobrando o mesmo valor na
 * mesma frequência são a mesma conta cadastrada duas vezes, comecem quando
 * começarem.
 */
export function procurarRegrasSemelhantes(
  regras: readonly RecurringRule[],
  rascunho: RascunhoRegra,
  { ignorar }: { ignorar?: string } = {},
): RecurringRule[] {
  return regras.filter(
    (regra) =>
      regra.id !== ignorar &&
      regra.amount === rascunho.amount &&
      regra.kind === rascunho.kind &&
      regra.frequency === rascunho.frequency &&
      regra.interval === rascunho.interval &&
      descricoesBatem(regra.description, rascunho.description),
  );
}

export interface RascunhoCompra {
  description: string;
  totalAmount: number;
  installments: number;
  firstDate: string;
}

/** Compra parcelada que parece a mesma: total, número de parcelas e mês inicial. */
export function procurarComprasSemelhantes(
  compras: readonly InstallmentPurchase[],
  rascunho: RascunhoCompra,
  { diasDeFolga = 31, ignorar }: { diasDeFolga?: number; ignorar?: string } = {},
): InstallmentPurchase[] {
  const de = addDays(rascunho.firstDate, -diasDeFolga);
  const ate = addDays(rascunho.firstDate, diasDeFolga);
  return compras.filter(
    (compra) =>
      compra.id !== ignorar &&
      compra.totalAmount === rascunho.totalAmount &&
      compra.installments === rascunho.installments &&
      compra.firstDate >= de &&
      compra.firstDate <= ate &&
      descricoesBatem(compra.description, rascunho.description),
  );
}

/** "05/09 · Mercado · R$ 92,00" — o suficiente para reconhecer o que já existe. */
export function resumoDoSemelhante(entry: DisplayEntry): { data: string; descricao: string; valor: number } {
  return { data: entry.date, descricao: entry.description, valor: entry.amount };
}
