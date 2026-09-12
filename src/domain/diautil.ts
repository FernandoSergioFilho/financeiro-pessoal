/**
 * O dinheiro não se move no fim de semana.
 *
 * Uma conta cadastrada para o dia 5 não sai no dia 5 quando o dia 5 é um
 * domingo, e num fluxo de caixa isso não é detalhe: é a diferença entre o
 * saldo de sexta e o de segunda, que é exatamente onde o aperto aparece.
 *
 * **Entrada antecipa, saída posterga.** É o que os bancos fazem no Brasil: o
 * salário do dia 5 cai na sexta, dia 3; o boleto do dia 5 é pago na segunda,
 * dia 7. As duas regras andam para lados opostos de propósito — juntar as duas
 * numa só faria o salário atrasar, que é justamente o que ninguém vê acontecer.
 *
 * **O que isto NÃO ajusta:** a data que a pessoa digitou. Se ela lançou um
 * gasto num sábado, foi num sábado que ela gastou — cartão e Pix funcionam no
 * fim de semana. A regra vale para as datas que o app **deriva**: a ocorrência
 * de uma conta recorrente e o vencimento de uma fatura.
 *
 * **Feriados ficaram de fora**, e é bom que isso esteja dito: só o fim de
 * semana é tratado. Os feriados nacionais brasileiros são uma tabela pequena
 * (e os móveis saem da Páscoa), então dá para acrescentar depois sem mexer em
 * mais nada — quem chama estas funções não precisa saber por que um dia não é
 * útil, só que não é.
 */

import { addDays, weekday } from './date.ts';

/** Sábado ou domingo? */
export function ehFimDeSemana(iso: string): boolean {
  const dia = weekday(iso);
  return dia === 0 || dia === 6;
}

/** O dia é útil? Hoje isso quer dizer apenas "não é fim de semana". */
export function ehDiaUtil(iso: string): boolean {
  return !ehFimDeSemana(iso);
}

/** O primeiro dia útil em `iso` ou antes dele. */
export function diaUtilAnterior(iso: string): string {
  let dia = iso;
  // No máximo dois passos: nenhum fim de semana tem três dias.
  while (!ehDiaUtil(dia)) dia = addDays(dia, -1);
  return dia;
}

/** O primeiro dia útil em `iso` ou depois dele. */
export function diaUtilSeguinte(iso: string): string {
  let dia = iso;
  while (!ehDiaUtil(dia)) dia = addDays(dia, 1);
  return dia;
}

/**
 * Quando o dinheiro se move de verdade, para uma data que o app derivou.
 *
 * Entrada antecipa, saída posterga. A transferência entre contas próprias
 * segue a regra da saída: quem manda é quem paga.
 */
export function ajustarParaDiaUtil(iso: string, kind: 'income' | 'expense' | 'transfer'): string {
  if (ehDiaUtil(iso)) return iso;
  return kind === 'income' ? diaUtilAnterior(iso) : diaUtilSeguinte(iso);
}
