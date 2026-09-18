/**
 * Ir de um número até os lançamentos que o formaram.
 *
 * Todo número na tela é uma pergunta pela metade: "gastei R$ 8.632" só vira
 * decisão quando dá para ver *no quê*. Antes, cada tela era um beco — via-se o
 * total e tinha de se ir à mão até Lançamentos, escolher o período, escolher a
 * conta, escolher a categoria. Aqui um destino carrega tudo isso junto, e o
 * clique no número leva à lista já filtrada.
 *
 * O `token` muda a cada pedido de propósito: clicar duas vezes no mesmo
 * atalho reaplica o filtro, mesmo que a pessoa o tenha limpado no meio.
 */

import type { FiltroBasico } from '../domain/filtros.ts';
import type { Periodo } from '../domain/period.ts';
import type { AtalhoDeRecorte } from '../domain/recorte-lista.ts';

/**
 * Recortes que a lista de lançamentos entende como atalho.
 *
 * Um valor só, de propósito: quem clica em "Saídas" no painel está pedindo uma
 * coisa. Lá na lista ele vira posição nos dois eixos (tipo e situação), e a
 * pessoa ajusta qualquer um deles sem perder o outro — ver
 * `domain/recorte-lista.ts`.
 */
export type RecorteDaLista = AtalhoDeRecorte;

export interface Destino {
  pagina: string;
  filtro?: Partial<FiltroBasico>;
  recorte?: RecorteDaLista;
  /** Trocar o período ao chegar — "ver o ano todo desta categoria". */
  periodo?: Periodo;
}

export interface DestinoAplicado extends Destino {
  token: number;
}

export type IrPara = (destino: Destino) => void;
