/**
 * O recorte por situação: tudo, só o que já foi confirmado, ou só o que falta.
 *
 * **"Em aberto" e "confirmado", e não "a pagar" e "pago".** Nem todo lançamento
 * é conta a pagar: entrada também tem os dois estados, e "salário a pagar" é
 * exatamente ao contrário do que acontece. O par em aberto/confirmado descreve
 * o estado sem supor a direção do dinheiro, que é o que o filtro precisa fazer.
 *
 * O painel somava sempre as duas coisas — o que aconteceu e o que está
 * previsto — e mostrava o previsto só como uma linha de apoio embaixo do
 * número. Isso responde mal a duas perguntas diferentes e igualmente
 * legítimas: "quanto eu já gastei de verdade este mês?" e "quanto ainda tenho
 * de pagar?". Aqui elas viram um filtro só, aplicado antes de qualquer conta,
 * para que todo indicador da tela fale do mesmo recorte.
 */

import type { DisplayEntry } from './types.ts';

export type RecorteDeSituacao = 'tudo' | 'confirmado' | 'em-aberto';

export const RECORTES: { valor: RecorteDeSituacao; rotulo: string; explicacao: string }[] = [
  { valor: 'tudo', rotulo: 'Tudo', explicacao: 'O que já aconteceu somado ao que ainda está previsto.' },
  { valor: 'confirmado', rotulo: 'Confirmados', explicacao: 'Só o que você confirmou que entrou ou saiu.' },
  { valor: 'em-aberto', rotulo: 'Em aberto', explicacao: 'Só o que ainda está previsto, sem confirmação.' },
];

export function filtrarPorSituacao(
  entradas: readonly DisplayEntry[],
  recorte: RecorteDeSituacao,
): DisplayEntry[] {
  if (recorte === 'tudo') return [...entradas];
  const querConfirmado = recorte === 'confirmado';
  return entradas.filter((entrada) => (entrada.status === 'settled') === querConfirmado);
}

/**
 * O sufixo que os rótulos da tela ganham, para o número nunca ficar ambíguo.
 *
 * A forma existe porque português concorda: "Saídas confirmadas" mas "Sobra
 * confirmada". Sem isso, o cartão de sobra saía escrito "Sobra confirmadas".
 */
export function sufixoDoRecorte(recorte: RecorteDeSituacao, forma: 'plural' | 'singular' = 'plural'): string {
  if (recorte === 'confirmado') return forma === 'plural' ? ' confirmadas' : ' confirmada';
  if (recorte === 'em-aberto') return ' em aberto';
  return '';
}
