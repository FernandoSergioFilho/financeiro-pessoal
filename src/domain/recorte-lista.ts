/**
 * O recorte da lista de lançamentos, em dois eixos que se combinam.
 *
 * Antes era um controle só, com seis opções na mesma fila: Tudo, Saídas,
 * Entradas, Transferências, Em aberto, Atrasados. Escolher uma apagava a
 * outra, e por isso "as saídas que estão atrasadas" — que é uma pergunta
 * comum, e a razão de existir de um fluxo de caixa — não tinha como ser feita.
 *
 * O erro estava em tratar como uma escolha o que são **duas perguntas
 * independentes**: de que tipo é o lançamento, e em que situação ele está. Um
 * lançamento tem as duas coisas ao mesmo tempo, sempre. Separadas em dois
 * eixos, qualquer combinação passa a existir sem nenhuma opção nova.
 *
 * "Atrasado" fica no eixo da situação, e não num eixo próprio, porque é um
 * caso de "em aberto": em aberto com a data já passada. Pô-lo à parte deixaria
 * escolher "confirmado e atrasado", que não quer dizer nada.
 */

import type { DisplayEntry } from './types.ts';

export type TipoDaLista = 'tudo' | 'expense' | 'income' | 'transfer';
export type SituacaoDaLista = 'tudo' | 'confirmado' | 'em-aberto' | 'atrasado';

export interface RecorteDaLista {
  tipo: TipoDaLista;
  situacao: SituacaoDaLista;
}

/** Sem recorte nenhum: o período inteiro. */
export const RECORTE_ABERTO: RecorteDaLista = { tipo: 'tudo', situacao: 'tudo' };

export const TIPOS: { valor: TipoDaLista; rotulo: string }[] = [
  { valor: 'tudo', rotulo: 'Tudo' },
  { valor: 'expense', rotulo: 'Saídas' },
  { valor: 'income', rotulo: 'Entradas' },
  { valor: 'transfer', rotulo: 'Transferências' },
];

export const SITUACOES: { valor: SituacaoDaLista; rotulo: string; explicacao: string }[] = [
  { valor: 'tudo', rotulo: 'Tudo', explicacao: 'O que já aconteceu somado ao que ainda está previsto.' },
  { valor: 'confirmado', rotulo: 'Confirmados', explicacao: 'Só o que você confirmou que entrou ou saiu.' },
  { valor: 'em-aberto', rotulo: 'Em aberto', explicacao: 'Só o que ainda está previsto, sem confirmação.' },
  { valor: 'atrasado', rotulo: 'Atrasados', explicacao: 'Em aberto e com a data já passada.' },
];

/**
 * Os atalhos que os números do painel usam para chegar aqui já filtrados.
 *
 * Continuam sendo um valor só, e não dois: quem clica em "Saídas" no painel
 * está pedindo uma coisa. O que muda é que agora esse pedido vira uma posição
 * nos dois eixos, e a pessoa pode ajustar qualquer um deles sem perder o
 * outro.
 */
export type AtalhoDeRecorte = 'all' | 'expense' | 'income' | 'transfer' | 'pending' | 'atrasados';

export function dimensoesDoAtalho(atalho: AtalhoDeRecorte): RecorteDaLista {
  switch (atalho) {
    case 'expense':
    case 'income':
    case 'transfer':
      return { tipo: atalho, situacao: 'tudo' };
    case 'pending':
      return { tipo: 'tudo', situacao: 'em-aberto' };
    case 'atrasados':
      return { tipo: 'tudo', situacao: 'atrasado' };
    default:
      return RECORTE_ABERTO;
  }
}

function passaNoTipo(entry: DisplayEntry, tipo: TipoDaLista): boolean {
  return tipo === 'tudo' || entry.kind === tipo;
}

function passaNaSituacao(entry: DisplayEntry, situacao: SituacaoDaLista, hoje: string): boolean {
  switch (situacao) {
    case 'confirmado':
      return entry.status === 'settled';
    case 'em-aberto':
      return entry.status === 'pending';
    case 'atrasado':
      return entry.status === 'pending' && entry.date < hoje;
    default:
      return true;
  }
}

export function passaNoRecorte(entry: DisplayEntry, recorte: RecorteDaLista, hoje: string): boolean {
  return passaNoTipo(entry, recorte.tipo) && passaNaSituacao(entry, recorte.situacao, hoje);
}

export function temRecorte(recorte: RecorteDaLista): boolean {
  return recorte.tipo !== 'tudo' || recorte.situacao !== 'tudo';
}

/**
 * O recorte em palavras, para a contagem dizer o que está mostrando.
 *
 * Com dois eixos, "12 de 40 lançamentos" deixa de se explicar sozinho: some a
 * informação de POR QUE são 12. A frase resolve isso sem obrigar a pessoa a
 * reler os dois controles acima.
 */
export function descreverRecorte(recorte: RecorteDaLista): string {
  const tipo = TIPOS.find((t) => t.valor === recorte.tipo);
  const situacao = SITUACOES.find((s) => s.valor === recorte.situacao);
  const partes = [
    recorte.tipo === 'tudo' ? '' : tipo!.rotulo.toLowerCase(),
    recorte.situacao === 'tudo' ? '' : situacao!.rotulo.toLowerCase(),
  ].filter(Boolean);
  return partes.join(' · ');
}
