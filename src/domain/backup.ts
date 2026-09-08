/**
 * Quando vale a pena guardar uma cópia do estado anterior.
 *
 * O que precisa ser protegido não é o erro de digitação — esse a pessoa
 * conserta na hora —, é a perda em massa: um "apagar tudo" no botão errado,
 * uma importação que entrou torta, uma sincronização que trouxe uma carteira
 * vazia por cima da cheia. Isso some sem ruído e só é percebido depois.
 *
 * Guardar a cópia a cada gravação não protege de nada: o app grava a cada
 * poucos segundos, então a cópia boa seria substituída pela ruim antes de
 * alguém perceber. Por isso são duas cópias com propósitos diferentes:
 *
 * - **rotina** — de tempos em tempos, sobrescrevendo a anterior. É o "ontem
 *   estava assim";
 * - **queda** — tirada no instante anterior a uma perda grande, e só
 *   substituída por outra queda. É a que salva o dia, e uma rotina nunca a
 *   apaga por cima.
 */

import type { FinanceData } from './types.ts';

/** De quanto em quanto tempo a cópia de rotina se renova. */
export const HORAS_DE_ROTINA = 6;

/** Quanto do conteúdo pode sumir de uma vez antes de virar "queda". */
export const FRACAO_DE_QUEDA = 0.3;

export type MotivoDaCopia = 'rotina' | 'queda';

export function quantidadeDeRegistros(data: FinanceData): number {
  return data.accounts.length + data.categories.length + data.entries.length
    + data.recurring.length + data.purchases.length;
}

/**
 * Vale guardar `anterior` antes de gravar `novo`?
 *
 * `ultimaRotinaEm` é quando a cópia de rotina foi tirada; `null` se ainda não
 * existe nenhuma.
 */
export function motivoParaCopiar(
  anterior: FinanceData,
  novo: FinanceData,
  ultimaRotinaEm: string | null,
  agora: string,
): MotivoDaCopia | null {
  const antes = quantidadeDeRegistros(anterior);
  // Não há o que proteger numa carteira vazia, e a primeira carga do app
  // (vazio → cheio) não é perda nenhuma.
  if (antes === 0) return null;

  const depois = quantidadeDeRegistros(novo);
  if (depois === 0 || depois < antes * (1 - FRACAO_DE_QUEDA)) return 'queda';

  if (!ultimaRotinaEm) return 'rotina';
  const horas = (Date.parse(agora) - Date.parse(ultimaRotinaEm)) / 3_600_000;
  return Number.isFinite(horas) && horas >= HORAS_DE_ROTINA ? 'rotina' : null;
}

export interface Copia {
  gravadaEm: string;
  motivo: MotivoDaCopia;
  registros: number;
  data: FinanceData;
}

/** "312 registros, de 08/09/2026 às 14:32" — o que a tela mostra sobre a cópia. */
export function descreverCopia(copia: Copia): string {
  const quando = new Date(copia.gravadaEm);
  const dois = (n: number) => String(n).padStart(2, '0');
  const dia = `${dois(quando.getDate())}/${dois(quando.getMonth() + 1)}/${quando.getFullYear()}`;
  const hora = `${dois(quando.getHours())}:${dois(quando.getMinutes())}`;
  const plural = copia.registros === 1 ? 'registro' : 'registros';
  return `${copia.registros} ${plural}, de ${dia} às ${hora}`;
}
