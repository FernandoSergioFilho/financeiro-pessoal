/**
 * Persistência.
 *
 * A interface é assíncrona de propósito, mesmo que a implementação local
 * seja síncrona: quando os dados passarem a vir de um servidor, só esta
 * pasta muda — a UI já trata carregamento e escrita como operações que
 * podem demorar e falhar.
 */

import type { FinanceData } from '../domain/types.ts';
import { emptyData, migrate } from './schema.ts';

export interface FinanceRepository {
  load(): Promise<FinanceData>;
  save(data: FinanceData): Promise<void>;
  clear(): Promise<void>;
}

const STORAGE_KEY = 'financeiro-pessoal';

/** Guarda tudo no navegador. Sem conta, sem rede, sem servidor. */
export class LocalStorageRepository implements FinanceRepository {
  constructor(private readonly key: string = STORAGE_KEY) {}

  async load(): Promise<FinanceData> {
    try {
      const raw = window.localStorage.getItem(this.key);
      if (!raw) return emptyData();
      return migrate(JSON.parse(raw));
    } catch (error) {
      // Dado corrompido não pode derrubar o app: começa limpo e avisa no console.
      console.error('Não foi possível ler os dados salvos; começando do zero.', error);
      return emptyData();
    }
  }

  async save(data: FinanceData): Promise<void> {
    window.localStorage.setItem(this.key, JSON.stringify(data));
  }

  async clear(): Promise<void> {
    window.localStorage.removeItem(this.key);
  }
}
