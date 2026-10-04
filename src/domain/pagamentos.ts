/**
 * Marcar e desmarcar pagamento em massa.
 *
 * Existe por causa de uma correção: até certa versão, parcela com data vencida
 * nascia "paga" — o app concluía sozinho que data no passado significa
 * dinheiro que saiu. As parcelas criadas antes disso continuaram com a marca
 * errada, e conferir uma a uma seria trabalho de horas. Daí o botão único que
 * devolve tudo para "a pagar", para a pessoa remarcar só o que de fato pagou.
 *
 * Não toca em transferência: mover dinheiro entre contas próprias não é uma
 * conta que se paga, e deixá-la como pendente encheria a lista de atrasados
 * com o que nunca vai ser marcado.
 */

import type { DisplayEntry, Entry, EntryStatus, FinanceData } from './types.ts';

export interface ResultadoDeMarcacao {
  data: FinanceData;
  /** Quantos lançamentos realmente mudaram de estado. */
  alterados: number;
}

function marcar(data: FinanceData, agora: string, destino: EntryStatus): ResultadoDeMarcacao {
  let alterados = 0;
  const entries: Entry[] = data.entries.map((entry) => {
    if (entry.kind === 'transfer' || entry.status === destino) return entry;
    alterados += 1;
    return { ...entry, status: destino, updatedAt: agora };
  });

  // Mesma referência quando não há nada a fazer: a tela não precisa
  // redesenhar, e a sincronização não precisa reenviar.
  return alterados === 0 ? { data, alterados: 0 } : { data: { ...data, entries }, alterados };
}

/** Tudo volta a "a pagar", e quem pagou marca de novo. */
export function desmarcarTodosComoPagos(data: FinanceData, agora: string): ResultadoDeMarcacao {
  return marcar(data, agora, 'pending');
}

/** Quantos lançamentos hoje estão marcados como pagos. */
export function quantosEstaoPagos(data: FinanceData): number {
  return data.entries.filter((entry) => entry.kind !== 'transfer' && entry.status === 'settled').length;
}

/* ------------------------------------- confirmar o que está selecionado ---- */

export interface LoteDePagamento {
  /** Os selecionados que ainda estão em aberto — os que o botão vai confirmar. */
  aConfirmar: DisplayEntry[];
  /** O que o botão deve fazer com esta seleção. */
  acao: 'confirmar' | 'desmarcar' | 'nada';
  /**
   * Quantos dos que serão confirmados são ocorrências previstas.
   *
   * Importa dizer: a ocorrência de uma conta recorrente não existe como
   * registro, e confirmá-la é o que a grava. Quem marca trinta de uma vez
   * merece saber que trinta lançamentos vão passar a existir.
   */
  previstos: number;
  total: number;
}

/**
 * O que fazer com os lançamentos selecionados — e por que um botão só.
 *
 * A barra de seleção já tem quatro controles, e a 390px cada um a mais é um
 * risco de a última ação sair da tela. Então o botão é um só e adapta: com
 * qualquer coisa em aberto na seleção, ele confirma; com tudo já confirmado,
 * confirmar não faria nada, e aí ele desmarca. O rótulo sempre diz o que vai
 * acontecer, então não há o que adivinhar.
 *
 * **Transferência entra aqui**, ao contrário do "desmarcar todos" de Ajustes.
 * Lá a regra protege de encher a lista de atrasados com o que ninguém marca;
 * aqui a pessoa escolheu as linhas uma a uma, e tirar algumas da conta sem
 * dizer seria pior do que respeitar a escolha dela.
 */
export function lerLoteDePagamento(selecionados: readonly DisplayEntry[]): LoteDePagamento {
  const aConfirmar = selecionados.filter((entrada) => entrada.status === 'pending');
  const previstos = aConfirmar.filter((entrada) => 'projected' in entrada && entrada.projected).length;
  const acao = aConfirmar.length > 0 ? 'confirmar' : selecionados.length > 0 ? 'desmarcar' : 'nada';
  return { aConfirmar, acao, previstos, total: selecionados.length };
}

/** A frase do botão, para ela e a ação saírem sempre do mesmo lugar. */
export function rotuloDoLote(lote: LoteDePagamento): string {
  if (lote.acao === 'confirmar') return `✓ Confirmar ${lote.aConfirmar.length}`;
  if (lote.acao === 'desmarcar') return `↩ Desmarcar ${lote.total}`;
  return '✓ Confirmar';
}
