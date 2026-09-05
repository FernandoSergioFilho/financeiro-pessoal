/**
 * Sincronização por cima do armazenamento local.
 *
 * O app continua gravando no navegador e funcionando offline — lançar uma
 * despesa no supermercado sem sinal precisa continuar valendo. Este
 * repositório apenas leva e traz o que mudou, por trás, e nunca deixa o
 * usuário esperando pela rede para ver os próprios dados.
 */

import { mergeData } from '../domain/sync.ts';
import type { FinanceData, SyncableRecord, TableName } from '../domain/types.ts';
import { TABLE_NAMES } from '../domain/types.ts';
import type { FinanceRepository } from './repository.ts';
import type { RemoteStore } from './remote.ts';
import { emptyData } from './schema.ts';

export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'error';

export interface SyncState {
  status: SyncStatus;
  /** Quando a última sincronização deu certo. */
  lastSyncedAt: string | null;
  message?: string;
}

const CURSOR_KEY = 'financeiro-pessoal:cursor';

/**
 * O que mudou aqui e o servidor ainda não viu.
 *
 * Reenviar algo que o servidor já tem é inofensivo — a gravação é por
 * registro e a fusão é idempotente —, então a conta erra para o lado seguro:
 * é melhor mandar de novo do que deixar um lançamento para trás.
 */
export function localChanges(data: FinanceData, since: string | null): FinanceData {
  const changes = emptyData();
  changes.version = data.version;
  if (!since) return { ...data };

  for (const table of TABLE_NAMES) {
    const novos = (data[table] as readonly SyncableRecord[]).filter((r) => r.updatedAt > since);
    (changes[table] as SyncableRecord[]).push(...novos);
  }
  changes.tombstones = data.tombstones.filter((t) => t.deletedAt > since);
  return changes;
}

/** Há algo para enviar? Evita ida à rede à toa. */
export function hasChanges(changes: FinanceData): boolean {
  return (
    changes.tombstones.length > 0 ||
    TABLE_NAMES.some((table) => (changes[table] as readonly unknown[]).length > 0)
  );
}

export class SyncingRepository implements FinanceRepository {
  private state: SyncState = { status: 'idle', lastSyncedAt: null };
  private listeners = new Set<(state: SyncState) => void>();
  /** Data da última alteração local que o servidor já recebeu. */
  private syncedThrough: string | null = null;

  constructor(
    private readonly local: FinanceRepository,
    private readonly remote: RemoteStore,
    private readonly now: () => string = () => new Date().toISOString(),
    private readonly storage: Pick<Storage, 'getItem' | 'setItem'> | null =
      typeof window === 'undefined' ? null : window.localStorage,
  ) {}

  // ---- FinanceRepository: a UI enxerga só isto, e sempre o dado local ----

  load(): Promise<FinanceData> {
    return this.local.load();
  }

  save(data: FinanceData): Promise<boolean> {
    return this.local.save(data);
  }

  clear(): Promise<void> {
    this.writeCursor(null);
    this.syncedThrough = null;
    return this.local.clear();
  }

  // ---- Sincronização ----

  onStateChange(listener: (state: SyncState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  getState(): SyncState {
    return this.state;
  }

  /**
   * Traz o que mudou lá, funde com o que há aqui, devolve o resultado e envia
   * o que é novo daqui. Devolve `null` quando não deu para falar com o
   * servidor — nesse caso o app segue com o dado local, sem erro na cara do
   * usuário, porque offline é situação esperada e não falha.
   */
  async sync(current: FinanceData): Promise<FinanceData | null> {
    this.setState({ status: 'syncing' });

    try {
      const cursorAnterior = this.readCursor();
      const { changes: remoto, cursor } = await this.remote.pull(cursorAnterior);

      // A marca é tirada ANTES de enviar, não depois. Enviar leva tempo, e
      // o usuário pode digitar um lançamento nesse meio: marcada no fim, essa
      // alteração pareceria já enviada e nunca subiria. Errar para o lado de
      // reenviar é inofensivo; para o lado de esquecer, perde lançamento.
      const marca = this.now();
      const merged = mergeData(current, remoto, marca);

      const paraEnviar = localChanges(current, this.syncedThrough);
      if (hasChanges(paraEnviar)) await this.remote.push(paraEnviar);

      // `merged` é um retrato de antes das idas à rede. Gravá-lo direto
      // apagaria o que o usuário digitou durante a espera — por isso relê o
      // que está gravado agora e funde de novo. A fusão é idempotente, então
      // repetir não custa nada e fecha a janela de perda.
      const final = mergeData(await this.local.load(), merged, marca);

      await this.local.save(final);
      this.writeCursor(cursor);
      this.syncedThrough = marca;

      this.setState({ status: 'idle', lastSyncedAt: this.now(), message: undefined });
      return final;
    } catch (error) {
      // Sem conexão não é erro de verdade: o app funciona local e tenta
      // de novo depois. Só o que não for de rede vira aviso.
      this.setState({
        status: 'offline',
        message: error instanceof Error ? error.message : undefined,
      });
      return null;
    }
  }

  private setState(patch: Partial<SyncState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener(this.state);
  }

  private readCursor(): string | null {
    try {
      return this.storage?.getItem(CURSOR_KEY) ?? null;
    } catch {
      return null;
    }
  }

  private writeCursor(cursor: string | null): void {
    try {
      this.storage?.setItem(CURSOR_KEY, cursor ?? '');
    } catch {
      // Sem poder lembrar onde parou, a próxima sincronização recomeça do
      // zero: mais lenta, mas correta.
    }
  }
}

/** Ajuda os testes a montar um repositório local sem navegador. */
export class InMemoryRepository implements FinanceRepository {
  constructor(private data: FinanceData = emptyData()) {}

  async load(): Promise<FinanceData> {
    return this.data;
  }

  async save(data: FinanceData): Promise<boolean> {
    this.data = data;
    return true;
  }

  async clear(): Promise<void> {
    this.data = emptyData();
  }

  current(): FinanceData {
    return this.data;
  }
}

export type { TableName };
