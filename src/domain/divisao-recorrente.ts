/**
 * Mudar uma conta recorrente **daqui em diante**, sem mexer no passado.
 *
 * É o caso da assinatura que mudou de preço. Os meses que já passaram foram
 * pagos pelo valor antigo e precisam continuar contando o valor antigo —
 * reescrevê-los falsificaria o histórico e o saldo de meses fechados. Os que
 * ainda vêm é que valem o preço novo.
 *
 * O app tinha os dois extremos e nada no meio: editar a ocorrência mudava um
 * mês só, e editar a regra mudava todos, inclusive os que já aconteceram.
 *
 * **A operação é um corte, não uma edição.** A regra que existia ganha uma
 * data de término na véspera do corte e fica sendo a história do passado; uma
 * regra nova começa no corte com os valores novos. É o mesmo que a agenda do
 * Google faz com "este e os eventos seguintes", e pelo mesmo motivo: só duas
 * regras conseguem descrever uma série que mudou no meio.
 *
 * Esta função não grava nada — devolve o que precisa ser feito, e quem chama
 * aplica. É o que permite testá-la inteira sem estado.
 */

import { addDays } from './date.ts';
import { indiceDaData } from './recurrence.ts';
import type { Entry, EntryKind, RecurringRule } from './types.ts';

/** O que de uma ocorrência editada cabe dentro de uma regra. */
export interface ValoresDaRegra {
  description: string;
  amount: number;
  kind: EntryKind;
  accountId: string;
  toAccountId: string | null;
  categoryId: string | null;
}

/** Uma regra pronta para nascer: falta só o id e as datas de criação. */
export type RegraNova = Omit<RecurringRule, 'id' | 'createdAt' | 'updatedAt'>;

/** Ocorrência já gravada que o corte alcança. */
export interface OcorrenciaAlcancada {
  id: string;
  /**
   * Trocar também os valores, e não só o vínculo.
   *
   * Falso quando o lançamento já está confirmado: ali o dinheiro já se moveu
   * pelo valor antigo, e mudá-lo reescreveria um fato. Mesmo assim o vínculo
   * muda, senão a regra nova projetaria aquele dia de novo e o mês apareceria
   * em dobro.
   */
  atualizarValores: boolean;
}

export interface Divisao {
  /** O que muda na regra que já existia. */
  patchDaAnterior: Partial<RecurringRule>;
  /** A regra nova; `null` quando o corte cai na primeira ocorrência. */
  nova: RegraNova | null;
  mover: OcorrenciaAlcancada[];
}

/**
 * O corte.
 *
 * `cortarEm` é a data da ocorrência a partir da qual vale o novo — a original,
 * mesmo que a edição tenha mudado o dia. `novaData` é o dia em que a série
 * passa a cair, que é o que permite "daqui em diante o aluguel vence no 10".
 *
 * **Quando o corte cai na primeira ocorrência, não há corte**: não existe
 * passado para preservar, e duas regras onde cabe uma só deixariam uma regra
 * morta na lista. Aí `nova` vem `null` e o patch carrega os valores novos.
 */
export function dividirRecorrente(
  regra: RecurringRule,
  cortarEm: string,
  novaData: string,
  valores: ValoresDaRegra,
  entries: readonly Entry[],
): Divisao {
  const mover = entries
    .filter((entry) => entry.recurringId === regra.id)
    .filter((entry) => entry.occurrenceDate !== null && entry.occurrenceDate !== undefined)
    .filter((entry) => entry.occurrenceDate! >= cortarEm)
    .map((entry) => ({ id: entry.id, atualizarValores: entry.status !== 'settled' }));

  const indice = indiceDaData(regra, cortarEm);

  if (indice === 0) {
    return { patchDaAnterior: { ...valores, startDate: novaData }, nova: null, mover };
  }

  const vespera = addDays(cortarEm, -1);
  const termino = regra.endDate && regra.endDate < vespera ? regra.endDate : vespera;

  return {
    patchDaAnterior: { endDate: termino },
    nova: {
      ...valores,
      frequency: regra.frequency,
      interval: regra.interval,
      startDate: novaData,
      endDate: regra.endDate ?? null,
      // O teto de ocorrências é da série inteira: a parte que já passou sai
      // dele. Sem saber a posição do corte não dá para descontar, e aí a
      // regra nova fica sem teto — melhor contar demais que cortar cedo.
      maxOccurrences:
        regra.maxOccurrences == null || indice === null
          ? null
          : Math.max(1, regra.maxOccurrences - indice),
      active: regra.active,
      // As dispensas do passado ficam com a regra do passado.
      skippedDates: regra.skippedDates.filter((data) => data >= cortarEm),
    },
    mover,
  };
}
