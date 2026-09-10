/**
 * As decisões do gesto de arrastar, separadas do componente.
 *
 * Arrastar a linha para marcar como pago só é útil se não atrapalhar o rolar
 * da página — e é aí que este tipo de gesto costuma dar errado: qualquer
 * movimento do dedo tem componente horizontal, então tratar tudo como arrasto
 * trava a rolagem. As duas regras que evitam isso (quando o gesto conta como
 * horizontal, e a partir de quanto ele vale) ficam aqui, em funções puras que
 * dá para testar sem navegador.
 */

/** Quanto o dedo precisa andar até o gesto valer como marcar/desmarcar. */
export const LIMIAR_DE_SWIPE = 72;

/** Abaixo disso é toque, não arrasto: o dedo treme ao encostar. */
export const RUIDO = 8;

export type Direcao = 'indefinido' | 'horizontal' | 'vertical';

/**
 * Para onde o dedo está indo.
 *
 * Só vira `horizontal` quando o movimento lateral é claramente maior que o
 * vertical — a folga de 1,3× existe porque um dedo que quer rolar a página
 * quase nunca desce em linha reta, e sem ela a lista prenderia a rolagem.
 */
export function direcaoDoGesto(dx: number, dy: number, ruido = RUIDO): Direcao {
  const horizontal = Math.abs(dx);
  const vertical = Math.abs(dy);
  if (horizontal < ruido && vertical < ruido) return 'indefinido';
  return horizontal > vertical * 1.3 ? 'horizontal' : 'vertical';
}

export function passouDoLimiar(dx: number, limiar = LIMIAR_DE_SWIPE): boolean {
  return Math.abs(dx) >= limiar;
}

/**
 * O quanto a linha realmente anda na tela.
 *
 * Depois do limiar o arrasto fica pesado, em vez de acompanhar o dedo até o
 * fim: o freio dá a sensação de que ali já acabou o gesto, e evita a linha
 * atravessar a tela inteira num deslize distraído.
 */
export function deslocamentoVisual(dx: number, limiar = LIMIAR_DE_SWIPE): number {
  const excedente = Math.abs(dx) - limiar;
  if (excedente <= 0) return dx;
  return Math.sign(dx) * (limiar + excedente * 0.25);
}
