/**
 * O `RemoteStore` falando com o Supabase.
 *
 * A conversão entre as linhas do banco e o formato do app fica em funções
 * puras, testadas sem rede: é onde mora a lógica. O resto é chamada fina ao
 * cliente, sem decisão nenhuma.
 */

import type { FinanceData, SyncableRecord, TableName, Tombstone } from '../domain/types.ts';
import { TABLE_NAMES } from '../domain/types.ts';
import type { PullResult, RemoteStore } from './remote.ts';
import { emptyData } from './schema.ts';
import { getSupabase } from './supabase.ts';

/** Uma linha da tabela `records`. */
export interface RecordRow {
  wallet_id: string;
  table_name: TableName;
  record_id: string;
  payload: unknown;
  updated_at: string;
  deleted_at: string | null;
  seq: number;
}

const TABELAS = new Set<string>(TABLE_NAMES);

/** Linhas do banco viram o formato que a fusão do domínio já entende. */
export function rowsToChanges(rows: readonly RecordRow[]): FinanceData {
  const changes = emptyData();

  for (const row of rows) {
    // Uma tabela desconhecida viria de uma versão mais nova do app gravando
    // algo que esta ainda não conhece: ignorar é melhor que quebrar.
    if (!TABELAS.has(row.table_name)) continue;

    if (row.deleted_at) {
      changes.tombstones.push({
        table: row.table_name,
        id: row.record_id,
        deletedAt: row.deleted_at,
      });
    } else if (row.payload && typeof row.payload === 'object') {
      (changes[row.table_name] as SyncableRecord[]).push(row.payload as SyncableRecord);
    }
  }

  return changes;
}

export type RecordUpsert = Omit<RecordRow, 'seq'>;

/** O que mudou aqui vira linhas prontas para gravar. */
export function changesToRows(changes: FinanceData, walletId: string): RecordUpsert[] {
  const rows: RecordUpsert[] = [];

  for (const table of TABLE_NAMES) {
    for (const record of changes[table] as readonly SyncableRecord[]) {
      rows.push({
        wallet_id: walletId,
        table_name: table,
        record_id: record.id,
        payload: record,
        updated_at: record.updatedAt,
        deleted_at: null,
      });
    }
  }

  for (const t of changes.tombstones as readonly Tombstone[]) {
    rows.push({
      wallet_id: walletId,
      table_name: t.table,
      record_id: t.id,
      // O conteúdo vai embora junto com a exclusão: não há motivo para
      // guardar no servidor um lançamento que o usuário mandou apagar.
      payload: null,
      updated_at: t.deletedAt,
      deleted_at: t.deletedAt,
    });
  }

  return rows;
}

/** Cursor da próxima leitura: a maior ordem de chegada já vista. */
export function nextCursor(rows: readonly RecordRow[], anterior: string | null): string {
  const maior = rows.reduce((max, row) => Math.max(max, row.seq), Number(anterior ?? 0));
  return String(maior);
}

/** O PostgREST devolve no máximo mil linhas por vez. */
const PAGINA = 1000;
/** Gravar tudo de uma vez estoura o limite de tamanho do pedido. */
const LOTE = 500;

export class SupabaseRemote implements RemoteStore {
  constructor(private readonly walletId: string) {}

  async pull(since: string | null): Promise<PullResult> {
    const supabase = getSupabase();
    if (!supabase) throw new Error('A sincronização não está configurada.');

    const corte = Number(since ?? 0);
    const todas: RecordRow[] = [];
    let desde = corte;

    // Página a página até acabar: uma sincronização depois de muito tempo
    // offline pode trazer mais do que cabe numa resposta só.
    for (;;) {
      const { data, error } = await supabase
        .from('records')
        .select('*')
        .eq('wallet_id', this.walletId)
        .gt('seq', desde)
        .order('seq', { ascending: true })
        .limit(PAGINA);

      if (error) throw new Error(error.message);
      const pagina = (data ?? []) as RecordRow[];
      todas.push(...pagina);
      if (pagina.length < PAGINA) break;
      desde = pagina[pagina.length - 1]!.seq;
    }

    return { changes: rowsToChanges(todas), cursor: nextCursor(todas, since) };
  }

  async push(changes: FinanceData): Promise<void> {
    const supabase = getSupabase();
    if (!supabase) throw new Error('A sincronização não está configurada.');

    const rows = changesToRows(changes, this.walletId);

    for (let i = 0; i < rows.length; i += LOTE) {
      const { error } = await supabase
        .from('records')
        .upsert(rows.slice(i, i + LOTE), { onConflict: 'wallet_id,table_name,record_id' });
      if (error) throw new Error(error.message);
    }
  }
}
