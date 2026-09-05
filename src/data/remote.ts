/**
 * O outro lado da sincronização.
 *
 * Só o que o app precisa saber sobre a nuvem: pedir o que mudou e enviar o
 * que mudou aqui. Quem implementa isso — Supabase hoje, outra coisa amanhã —
 * fica atrás desta interface, e a mecânica de sincronizar não muda.
 */

import type { FinanceData } from '../domain/types.ts';

export interface PullResult {
  /**
   * Só o que mudou desde o cursor pedido, no mesmo formato dos dados
   * completos — assim a fusão em `domain/sync.ts` serve sem adaptação.
   */
  changes: FinanceData;
  /**
   * Marca do servidor para pedir a próxima leva.
   *
   * Vem do servidor, e não do relógio daqui, de propósito: dois aparelhos
   * com relógios levemente diferentes perderiam alterações se cada um
   * decidisse sozinho onde parou.
   */
  cursor: string;
}

export interface RemoteStore {
  /** `null` na primeira vez: traz tudo. */
  pull(since: string | null): Promise<PullResult>;
  push(changes: FinanceData): Promise<void>;
}

/** Erro que vale tentar de novo mais tarde (rede caiu, servidor fora do ar). */
export class TransientRemoteError extends Error {}
