/**
 * O recorte por situação: tudo, só o que já foi pago, ou só o que falta.
 *
 * O painel somava sempre as duas coisas — o que aconteceu e o que está
 * previsto — e mostrava o previsto só como uma linha de apoio embaixo do
 * número. Isso responde mal a duas perguntas diferentes e igualmente
 * legítimas: "quanto eu já gastei de verdade este mês?" e "quanto ainda tenho
 * de pagar?". Aqui elas viram um filtro só, aplicado antes de qualquer conta,
 * para que todo indicador da tela fale do mesmo recorte.
 */

import type { DisplayEntry } from './types.ts';

export type RecorteDeSituacao = 'tudo' | 'pago' | 'a-pagar';

export const RECORTES: { valor: RecorteDeSituacao; rotulo: string; explicacao: string }[] = [
  { valor: 'tudo', rotulo: 'Tudo', explicacao: 'O que já aconteceu somado ao que ainda está previsto.' },
  { valor: 'pago', rotulo: 'Já pago', explicacao: 'Só o que você marcou como pago.' },
  { valor: 'a-pagar', rotulo: 'A pagar', explicacao: 'Só o que ainda não foi marcado como pago.' },
];

export function filtrarPorSituacao(
  entradas: readonly DisplayEntry[],
  recorte: RecorteDeSituacao,
): DisplayEntry[] {
  if (recorte === 'tudo') return [...entradas];
  const querPago = recorte === 'pago';
  return entradas.filter((entrada) => (entrada.status === 'settled') === querPago);
}

/**
 * O sufixo que os rótulos da tela ganham, para o número nunca ficar ambíguo.
 *
 * A forma existe porque português concorda: "Saídas já pagas" mas "Sobra já
 * paga". Sem isso, o cartão de sobra saía escrito "Sobra já pagas".
 */
export function sufixoDoRecorte(recorte: RecorteDeSituacao, forma: 'plural' | 'singular' = 'plural'): string {
  if (recorte === 'pago') return forma === 'plural' ? ' já pagas' : ' já paga';
  if (recorte === 'a-pagar') return ' a pagar';
  return '';
}
