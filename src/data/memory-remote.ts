/**
 * Servidor de mentira, guardado em memória.
 *
 * Existe para que a mecânica de sincronizar — a parte que pode perder
 * lançamentos — seja testada de ponta a ponta sem depender de rede, de conta
 * em serviço nenhum e do projeto estar no ar. Os testes de dois aparelhos
 * rodam contra ele.
 *
 * Imita o essencial do servidor de verdade: carimba cada registro com a
 * própria contagem, e não com o relógio do cliente.
 */

import { emptyData } from './schema.ts';
import type { PullResult, RemoteStore } from './remote.ts';
import type { FinanceData, SyncableRecord, TableName, Tombstone } from '../domain/types.ts';
import { TABLE_NAMES } from '../domain/types.ts';

interface Linha {
  table: TableName;
  id: string;
  /** Ordem de chegada ao servidor — é o cursor. */
  seq: number;
  record?: SyncableRecord;
  tombstone?: Tombstone;
}

export class MemoryRemote implements RemoteStore {
  private linhas: Linha[] = [];
  private seq = 0;

  /** Quantas idas ao servidor aconteceram — os testes conferem isso. */
  pulls = 0;
  pushes = 0;
  /** Ligado, todo acesso falha: serve para testar o app offline. */
  offline = false;

  async pull(since: string | null): Promise<PullResult> {
    this.pulls += 1;
    this.falharSeOffline();

    const corte = since ? Number(since) : 0;
    const changes = emptyData();

    for (const linha of this.linhas) {
      if (linha.seq <= corte) continue;
      if (linha.tombstone) changes.tombstones.push(linha.tombstone);
      else if (linha.record) (changes[linha.table] as SyncableRecord[]).push(linha.record);
    }

    return { changes, cursor: String(this.seq) };
  }

  async push(changes: FinanceData): Promise<void> {
    this.pushes += 1;
    this.falharSeOffline();

    for (const table of TABLE_NAMES) {
      for (const record of changes[table] as readonly SyncableRecord[]) {
        this.gravar({ table, id: record.id, seq: ++this.seq, record });
      }
    }
    for (const tombstone of changes.tombstones) {
      this.gravar({ table: tombstone.table, id: tombstone.id, seq: ++this.seq, tombstone });
    }
  }

  /** Uma linha por registro: a nova substitui a anterior, como um upsert. */
  private gravar(linha: Linha): void {
    this.linhas = this.linhas.filter((l) => !(l.table === linha.table && l.id === linha.id));
    this.linhas.push(linha);
  }

  private falharSeOffline(): void {
    if (this.offline) throw new Error('Sem conexão com o servidor de teste.');
  }

  /** Atalho de inspeção para os testes. */
  snapshot(): FinanceData {
    const data = emptyData();
    for (const linha of this.linhas) {
      if (linha.tombstone) data.tombstones.push(linha.tombstone);
      else if (linha.record) (data[linha.table] as SyncableRecord[]).push(linha.record);
    }
    return data;
  }
}
