/**
 * Fusão de duas versões dos dados.
 *
 * Esta é a parte que pode perder dinheiro se estiver errada, então é uma
 * função pura, sem rede e sem relógio: recebe os dois lados e devolve o
 * resultado. Toda a conversa com o servidor mora em `src/data/`.
 *
 * A regra é **por registro, o mais recente vence** (`updatedAt`). Para duas
 * pessoas compartilhando uma carteira, o único conflito real seria as duas
 * editarem o mesmo lançamento nos mesmos segundos; qualquer coisa mais
 * elaborada que isso custaria complexidade sem melhorar o resultado.
 *
 * Exclusão vence empate: se um lado apagou e o outro apenas leu, o registro
 * some. Mas uma edição *posterior* à exclusão ressuscita o registro — quem
 * mexeu por último decidiu depois, e é mais fácil apagar de novo do que
 * redigitar um lançamento que sumiu sozinho.
 */

import type {
  FinanceData,
  SyncableRecord,
  TableName,
  Tombstone,
} from './types.ts';
import { TABLE_NAMES } from './types.ts';

/** Um tombstone deixa de ser necessário quando todos os aparelhos já o viram. */
export const TOMBSTONE_TTL_DAYS = 90;

function newest(a: string | undefined, b: string | undefined): string {
  return (a ?? '') >= (b ?? '') ? (a ?? '') : (b ?? '');
}

/** Junta os dois conjuntos de marcas de exclusão, mantendo a mais antiga de cada. */
export function mergeTombstones(a: readonly Tombstone[], b: readonly Tombstone[]): Tombstone[] {
  const porChave = new Map<string, Tombstone>();
  for (const t of [...a, ...b]) {
    const chave = `${t.table}:${t.id}`;
    const atual = porChave.get(chave);
    // A mais antiga é a que conta: é o instante em que o registro morreu.
    if (!atual || t.deletedAt < atual.deletedAt) porChave.set(chave, t);
  }
  return [...porChave.values()].sort(
    (x, y) => x.deletedAt.localeCompare(y.deletedAt) || x.id.localeCompare(y.id),
  );
}

/**
 * Descarta marcas antigas para a lista não crescer para sempre.
 * `now` entra como parâmetro para o teste não depender do relógio.
 */
export function pruneTombstones(
  tombstones: readonly Tombstone[],
  now: string,
  ttlDays = TOMBSTONE_TTL_DAYS,
): Tombstone[] {
  const limite = new Date(new Date(now).getTime() - ttlDays * 86_400_000).toISOString();
  return tombstones.filter((t) => t.deletedAt >= limite);
}

/** Funde uma coleção: o registro mais recente vence, o apagado some. */
export function mergeCollection<T extends SyncableRecord>(
  locais: readonly T[],
  remotos: readonly T[],
  mortos: ReadonlyMap<string, string>,
): T[] {
  const porId = new Map<string, T>();

  for (const registro of [...locais, ...remotos]) {
    const atual = porId.get(registro.id);
    if (!atual || registro.updatedAt > atual.updatedAt) porId.set(registro.id, registro);
  }

  return [...porId.values()]
    .filter((registro) => {
      const morteEm = mortos.get(registro.id);
      // Editado depois de apagado: quem mexeu por último decidiu depois.
      return morteEm === undefined || registro.updatedAt > morteEm;
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Funde as duas versões inteiras. Comutativa (tanto faz quem é "local")
 * e idempotente (aplicar de novo não muda nada), que é o que permite
 * sincronizar quantas vezes for sem estragar os dados.
 */
export function mergeData(local: FinanceData, remoto: FinanceData, now: string): FinanceData {
  const tombstones = pruneTombstones(mergeTombstones(local.tombstones, remoto.tombstones), now);

  const mortosPorTabela = new Map<TableName, Map<string, string>>(
    TABLE_NAMES.map((table) => [table, new Map<string, string>()]),
  );
  for (const t of tombstones) mortosPorTabela.get(t.table)?.set(t.id, t.deletedAt);

  const semMortos = (table: TableName) => mortosPorTabela.get(table) ?? new Map<string, string>();

  return {
    version: Math.max(local.version, remoto.version),
    accounts: mergeCollection(local.accounts, remoto.accounts, semMortos('accounts')),
    categories: mergeCollection(local.categories, remoto.categories, semMortos('categories')),
    entries: mergeCollection(local.entries, remoto.entries, semMortos('entries')),
    recurring: mergeCollection(local.recurring, remoto.recurring, semMortos('recurring')),
    purchases: mergeCollection(local.purchases, remoto.purchases, semMortos('purchases')),
    tombstones,
  };
}

/** Instante da última alteração conhecida — o corte para pedir novidades. */
export function highWaterMark(data: FinanceData): string {
  let marca = '';
  for (const table of TABLE_NAMES) {
    for (const registro of data[table] as readonly SyncableRecord[]) {
      marca = newest(marca, registro.updatedAt);
    }
  }
  for (const t of data.tombstones) marca = newest(marca, t.deletedAt);
  return marca;
}
