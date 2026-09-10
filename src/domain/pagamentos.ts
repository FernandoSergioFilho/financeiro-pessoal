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

import type { Entry, EntryStatus, FinanceData } from './types.ts';

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
