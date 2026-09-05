/** Backup, restauração e exportação em planilha. */

import { formatAmount } from '../domain/money.ts';
import type { DisplayEntry, FinanceData } from '../domain/types.ts';
import { looksLikeFinanceData, migrate } from './schema.ts';

const KIND_LABEL = { income: 'Entrada', expense: 'Saída', transfer: 'Transferência' } as const;
const STATUS_LABEL = { settled: 'Efetivado', pending: 'Previsto' } as const;

export interface CsvContext {
  accountName: (id: string | null | undefined) => string;
  categoryName: (id: string | null | undefined) => string;
}

function csvCell(value: string): string {
  return /[";\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * CSV com `;` e vírgula decimal — é o que o Excel e o LibreOffice em
 * português abrem sem passar pelo assistente de importação.
 */
export function entriesToCsv(entries: readonly DisplayEntry[], ctx: CsvContext): string {
  const header = ['Data', 'Descrição', 'Categoria', 'Conta', 'Destino', 'Tipo', 'Situação', 'Valor', 'Parcela', 'Recorrente'];
  const rows = [...entries]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((entry) => [
      entry.date,
      entry.description,
      ctx.categoryName(entry.categoryId),
      ctx.accountName(entry.accountId),
      entry.kind === 'transfer' ? ctx.accountName(entry.toAccountId) : '',
      KIND_LABEL[entry.kind],
      STATUS_LABEL[entry.status],
      // Saída sai negativa para a planilha somar a coluna direto.
      formatAmount(entry.kind === 'expense' ? -entry.amount : entry.amount),
      entry.installmentNumber ? `${entry.installmentNumber}/${entry.installmentTotal}` : '',
      entry.recurringId ? 'Sim' : '',
    ]);

  return [header, ...rows].map((row) => row.map(csvCell).join(';')).join('\r\n');
}

/** O BOM faz o Excel reconhecer o acento como UTF-8. */
export function download(filename: string, content: string, mime: string): void {
  const blob = new Blob([mime.startsWith('text/csv') ? `﻿${content}` : content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function downloadCsv(filename: string, csv: string): void {
  download(filename, csv, 'text/csv;charset=utf-8');
}

export function downloadJson(filename: string, data: unknown): void {
  download(filename, JSON.stringify(data, null, 2), 'application/json');
}

/** Lê um backup escolhido pelo usuário, recusando arquivo de outro tipo. */
export async function readBackup(file: File): Promise<FinanceData> {
  const parsed: unknown = JSON.parse(await file.text());
  if (!looksLikeFinanceData(parsed)) {
    throw new Error('Este arquivo não parece um backup do controle financeiro.');
  }
  return migrate(parsed);
}
