/** Backup, restauração e troca de planilha (exportar e importar). */

import { isValidISO, toISO } from '../domain/date.ts';
import { formatAmount, parseMoney } from '../domain/money.ts';
import type { DisplayEntry, Entry, EntryKind, EntryStatus, FinanceData } from '../domain/types.ts';
import { looksLikeFinanceData, migrate } from './schema.ts';

const KIND_LABEL = { income: 'Entrada', expense: 'Saída', transfer: 'Transferência' } as const;
const STATUS_LABEL = { settled: 'Efetivado', pending: 'Previsto' } as const;

/** As mesmas colunas na volta, para o arquivo exportado poder ser reenviado. */
export const CSV_COLUNAS = [
  'Data',
  'Descrição',
  'Categoria',
  'Conta',
  'Destino',
  'Tipo',
  'Situação',
  'Valor',
  'Parcela',
  'Recorrente',
  'ID',
] as const;

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
      // Vazio nas projeções: elas não são registros gravados, e sim contas
      // recorrentes calculadas na hora. É o que permite reenviar o arquivo
      // exportado sem duplicar o que já está no aplicativo.
      'projected' in entry && entry.projected ? '' : entry.id,
    ]);

  return [[...CSV_COLUNAS], ...rows].map((row) => row.map(csvCell).join(';')).join('\r\n');
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

/* ------------------------------------------------------------- importação */

/**
 * Divide o CSV em células.
 *
 * Escrito à mão em vez de um `split(';')` porque a descrição pode conter o
 * próprio separador, aspas ou quebra de linha — e aí o campo vem entre aspas,
 * com as internas dobradas. Um split simples embaralharia as colunas dessa
 * linha e o erro só apareceria no valor errado, muito depois.
 */
export function parseCsv(texto: string): string[][] {
  const limpo = texto.replace(/^﻿/, '');
  const linhas: string[][] = [];
  let celula = '';
  let linha: string[] = [];
  let dentroDeAspas = false;

  for (let i = 0; i < limpo.length; i += 1) {
    const c = limpo[i]!;

    if (dentroDeAspas) {
      if (c === '"') {
        if (limpo[i + 1] === '"') {
          celula += '"';
          i += 1;
        } else {
          dentroDeAspas = false;
        }
      } else {
        celula += c;
      }
      continue;
    }

    if (c === '"') dentroDeAspas = true;
    else if (c === ';') {
      linha.push(celula);
      celula = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && limpo[i + 1] === '\n') i += 1;
      linha.push(celula);
      linhas.push(linha);
      celula = '';
      linha = [];
    } else celula += c;
  }

  if (celula !== '' || linha.length > 0) {
    linha.push(celula);
    linhas.push(linha);
  }

  return linhas.filter((l) => l.some((c) => c.trim() !== ''));
}

/**
 * Aceita a data como o aplicativo exporta (2026-09-07) e como o Excel costuma
 * devolver depois de abrir e salvar o arquivo (07/09/2026). Reformatar a
 * coluna é a primeira coisa que o Excel faz, então recusar esse formato
 * quebraria justamente o caminho que o usuário vai percorrer.
 */
export function parseDataCsv(valor: string): string | null {
  const texto = valor.trim();
  if (isValidISO(texto)) return texto;

  const br = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(texto);
  if (br) {
    const iso = toISO({ year: Number(br[3]), month: Number(br[2]), day: Number(br[1]) });
    return isValidISO(iso) ? iso : null;
  }
  return null;
}

export type EntryDraftCsv = Omit<Entry, 'id' | 'createdAt' | 'updatedAt'>;

/** O mesmo que a compra parcelada precisa para nascer (ver `buildPurchase`). */
export interface CompraCsv {
  description: string;
  totalAmount: number;
  installments: number;
  firstDate: string;
  accountId: string;
  categoryId: string | null;
}

/**
 * A coluna `Parcela` diz duas coisas diferentes, e a forma distingue:
 *
 * - `10x` (ou só `10`) — esta linha é uma **compra parcelada** a criar: o
 *   `Valor` é o total e as N parcelas nascem a partir da `Data`.
 * - `3/10` — é como a exportação escreve uma parcela que já existe. Na volta
 *   ela é ignorada: recriá-la geraria uma compra duplicada, parcela por
 *   parcela.
 */
export function parseParcela(
  valor: string,
): { tipo: 'compra'; parcelas: number } | { tipo: 'parcela-existente' } | { tipo: 'invalido' } | null {
  const texto = valor.trim().toLowerCase().replace(/\s+/g, '');
  if (!texto) return null;
  if (/^\d+\/\d+$/.test(texto)) return { tipo: 'parcela-existente' };

  const compra = /^(\d+)x?$/.exec(texto);
  if (compra) {
    const parcelas = Number(compra[1]);
    return parcelas >= 2 && parcelas <= 360 ? { tipo: 'compra', parcelas } : { tipo: 'invalido' };
  }
  return { tipo: 'invalido' };
}

export interface ImportContext {
  /** Nome da conta → id. Comparação sem diferenciar maiúsculas nem acentos. */
  contaPorNome: (nome: string) => string | undefined;
  categoriaPorNome: (nome: string) => string | undefined;
  /** Ids já gravados, para não trazer de novo o que o arquivo já continha. */
  idsExistentes: ReadonlySet<string>;
}

export interface ProblemaImportacao {
  linha: number;
  motivo: string;
}

export interface ResultadoImportacao {
  novos: EntryDraftCsv[];
  /** Compras parceladas a criar, cada uma gerando as suas N parcelas. */
  compras: CompraCsv[];
  /** Linhas com ID que o aplicativo já tem: reenvio do próprio arquivo. */
  jaExistiam: number;
  /** Ocorrências de conta recorrente: quem manda nelas é a regra. */
  recorrentes: number;
  /** Parcelas de compras que já existem, escritas como `3/10`. */
  parcelasExistentes: number;
  problemas: ProblemaImportacao[];
}

const TIPOS: Record<string, EntryKind> = {
  entrada: 'income',
  saida: 'expense',
  transferencia: 'transfer',
};
const SITUACOES: Record<string, EntryStatus> = {
  efetivado: 'settled',
  previsto: 'pending',
  '': 'settled',
};

/** Sem acento e sem caixa: "Alimentação" e "alimentacao" são o mesmo nome. */
export function chaveDeNome(valor: string): string {
  return valor
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Lê a planilha e devolve o que dá para trazer, o que foi ignorado e por quê.
 *
 * Não grava nada: quem chama mostra o resumo antes e só então confirma. Uma
 * importação que aplica metade e reclama do resto deixaria o usuário sem saber
 * o que ficou de fora nem como repetir.
 */
export function csvToEntries(texto: string, ctx: ImportContext): ResultadoImportacao {
  const linhas = parseCsv(texto);
  const resultado: ResultadoImportacao = {
    novos: [],
    compras: [],
    jaExistiam: 0,
    recorrentes: 0,
    parcelasExistentes: 0,
    problemas: [],
  };
  if (linhas.length === 0) {
    resultado.problemas.push({ linha: 0, motivo: 'O arquivo está vazio.' });
    return resultado;
  }

  // O cabeçalho dá a posição de cada coluna: assim a planilha pode ter as
  // colunas em outra ordem, ou trazer colunas a mais que o usuário criou.
  const cabecalho = linhas[0]!.map((c) => chaveDeNome(c));
  const onde = (nome: string) => cabecalho.indexOf(chaveDeNome(nome));
  const iData = onde('Data');
  const iDescricao = onde('Descrição');
  const iValor = onde('Valor');

  if (iData === -1 || iDescricao === -1 || iValor === -1) {
    resultado.problemas.push({
      linha: 1,
      motivo: 'O cabeçalho precisa ter pelo menos as colunas Data, Descrição e Valor. Exporte a planilha do mês para ter o modelo certo.',
    });
    return resultado;
  }

  const iCategoria = onde('Categoria');
  const iConta = onde('Conta');
  const iDestino = onde('Destino');
  const iTipo = onde('Tipo');
  const iSituacao = onde('Situação');
  const iRecorrente = onde('Recorrente');
  const iParcela = onde('Parcela');
  const iId = onde('ID');

  const celula = (linha: string[], indice: number) => (indice === -1 ? '' : (linha[indice] ?? '').trim());

  for (let n = 1; n < linhas.length; n += 1) {
    const linha = linhas[n]!;
    const numero = n + 1; // como o usuário vê na planilha, com o cabeçalho sendo 1
    const problema = (motivo: string) => resultado.problemas.push({ linha: numero, motivo });

    const id = celula(linha, iId);
    if (id && ctx.idsExistentes.has(id)) {
      resultado.jaExistiam += 1;
      continue;
    }

    // Ocorrência de uma conta recorrente sem lançamento gravado: quem a
    // produz é a regra, todo mês. Trazer como lançamento solto criaria uma
    // cópia ao lado da projeção, e as duas apareceriam na lista.
    if (!id && chaveDeNome(celula(linha, iRecorrente)) === 'sim') {
      resultado.recorrentes += 1;
      continue;
    }

    const parcela = parseParcela(celula(linha, iParcela));
    if (parcela?.tipo === 'invalido') {
      problema(
        `Parcela inválida: "${celula(linha, iParcela)}". Para criar uma compra parcelada use o número de vezes, como "10x".`,
      );
      continue;
    }
    // `3/10` é como a exportação escreve uma parcela que já existe: recriá-la
    // duplicaria a compra inteira, parcela por parcela.
    if (parcela?.tipo === 'parcela-existente') {
      resultado.parcelasExistentes += 1;
      continue;
    }

    const data = parseDataCsv(celula(linha, iData));
    if (!data) {
      problema(`Data inválida: "${celula(linha, iData)}". Use 07/09/2026 ou 2026-09-07.`);
      continue;
    }

    const descricao = celula(linha, iDescricao);
    if (!descricao) {
      problema('Sem descrição.');
      continue;
    }

    const valor = parseMoney(celula(linha, iValor));
    if (valor === null || valor === 0) {
      problema(`Valor inválido: "${celula(linha, iValor)}".`);
      continue;
    }

    // O tipo pode vir na coluna ou ser deduzido do sinal, que é como a pessoa
    // naturalmente digita numa planilha: negativo é saída.
    const textoTipo = chaveDeNome(celula(linha, iTipo));
    const kind: EntryKind | undefined = textoTipo ? TIPOS[textoTipo] : valor < 0 ? 'expense' : 'income';
    if (!kind) {
      problema(`Tipo desconhecido: "${celula(linha, iTipo)}". Use Entrada, Saída ou Transferência.`);
      continue;
    }

    const situacao = SITUACOES[chaveDeNome(celula(linha, iSituacao))];
    if (!situacao) {
      problema(`Situação desconhecida: "${celula(linha, iSituacao)}". Use Efetivado ou Previsto.`);
      continue;
    }

    const nomeConta = celula(linha, iConta);
    const accountId = nomeConta ? ctx.contaPorNome(nomeConta) : undefined;
    if (!accountId) {
      problema(
        nomeConta
          ? `Conta "${nomeConta}" não existe. Cadastre em Ajustes ou use o nome exato de uma que já existe.`
          : 'Sem conta.',
      );
      continue;
    }

    let toAccountId: string | null = null;
    if (kind === 'transfer') {
      const nomeDestino = celula(linha, iDestino);
      const destino = nomeDestino ? ctx.contaPorNome(nomeDestino) : undefined;
      if (!destino) {
        problema(`Transferência precisa de uma conta de destino válida na coluna Destino.`);
        continue;
      }
      if (destino === accountId) {
        problema('A transferência tem origem e destino iguais.');
        continue;
      }
      toAccountId = destino;
    }

    // Categoria é opcional: sem ela o lançamento fica "Sem categoria", como
    // acontece pelo formulário.
    const nomeCategoria = celula(linha, iCategoria);
    let categoryId: string | null = null;
    if (nomeCategoria && chaveDeNome(nomeCategoria) !== 'sem categoria') {
      const achada = ctx.categoriaPorNome(nomeCategoria);
      if (!achada) {
        problema(`Categoria "${nomeCategoria}" não existe. Cadastre em Ajustes ou deixe a coluna vazia.`);
        continue;
      }
      categoryId = achada;
    }

    // Compra parcelada: o valor da linha é o TOTAL, e as N parcelas nascem
    // dela — é `buildPurchase` que divide os centavos para somar exatamente.
    if (parcela?.tipo === 'compra') {
      if (kind !== 'expense') {
        problema('Compra parcelada só faz sentido como saída.');
        continue;
      }
      resultado.compras.push({
        description: descricao,
        totalAmount: Math.abs(valor),
        installments: parcela.parcelas,
        firstDate: data,
        accountId,
        categoryId,
      });
      continue;
    }

    resultado.novos.push({
      date: data,
      description: descricao,
      // O sinal da planilha já foi lido pelo tipo; o domínio guarda sempre positivo.
      amount: Math.abs(valor),
      kind,
      accountId,
      toAccountId,
      categoryId,
      status: situacao,
      recurringId: null,
      occurrenceDate: null,
      purchaseId: null,
      installmentNumber: null,
      installmentTotal: null,
    });
  }

  return resultado;
}

/** Lê um backup escolhido pelo usuário, recusando arquivo de outro tipo. */
export async function readBackup(file: File): Promise<FinanceData> {
  const parsed: unknown = JSON.parse(await file.text());
  if (!looksLikeFinanceData(parsed)) {
    throw new Error('Este arquivo não parece um backup do controle financeiro.');
  }
  return migrate(parsed);
}
