/**
 * A porta única da importação: qualquer formato entra por aqui.
 *
 * Os quatro caminhos convergem cedo, de propósito:
 *
 *     CSV      → texto      → separador → tabela ─┐
 *     planilha → células               → tabela ─┤→ descobrir colunas → lançamentos
 *     PDF      → linhas soltas                  ─┤
 *     imagem   → OCR → linhas soltas            ─┤
 *     colar    → linhas soltas                  ─┘
 *
 * Convergir cedo é o que faz a conferência, a detecção de repetidos e o
 * reconhecimento de parcelas valerem para todos sem uma linha de código a mais.
 * Se cada formato tivesse a sua ideia do que é a coluna de valor, seriam quatro
 * jeitos de errar em vez de um jeito de acertar.
 *
 * **Tabela ou linhas soltas.** CSV e planilha têm cabeçalho, e a descoberta é
 * por nome de coluna. PDF, print e texto colado não têm, e a descoberta é por
 * conteúdo (`banco-texto.ts`). Quando o texto de um PDF por acaso tem uma linha
 * de títulos reconhecível, os dois leitores dão certo — e o desempate é simples:
 * vence quem achou mais lançamentos.
 */

import { lerCsvDeBanco, type LeituraBanco } from './banco-csv.ts';
import { lerLinhasSoltas } from './banco-texto.ts';
import { lerXlsx } from './banco-xlsx.ts';
// `#pesados` e não caminho relativo: é por este nome que o build de arquivo
// único troca os leitores caros pelo substituto que explica a ausência.
import { textoDaImagem, textoDoPdf } from '#pesados';

export type FormatoDeEntrada = 'csv' | 'planilha' | 'pdf' | 'imagem' | 'colado';

export interface LeituraDeArquivo extends LeituraBanco {
  formatoDeEntrada: FormatoDeEntrada;
  /** Linhas que não pareciam lançamento e foram ignoradas sem reclamar. */
  ignoradas: number;
}

/** Como o app decide o que é cada arquivo: pela extensão, e depois pelo tipo. */
export function formatoDoArquivo(nome: string, tipo: string): FormatoDeEntrada | null {
  const ext = nome.toLowerCase().split('.').pop() ?? '';
  if (ext === 'csv' || ext === 'txt') return 'csv';
  if (ext === 'xlsx' || ext === 'xlsm') return 'planilha';
  if (ext === 'pdf') return 'pdf';
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'heic', 'heif'].includes(ext)) return 'imagem';
  // Sem extensão reconhecida, o tipo que o navegador informa decide. Acontece
  // com o que vem de aplicativo de mensagem, que às vezes renomeia o arquivo.
  if (tipo.startsWith('image/')) return 'imagem';
  if (tipo === 'application/pdf') return 'pdf';
  if (tipo.includes('spreadsheet') || tipo.includes('excel')) return 'planilha';
  if (tipo.startsWith('text/')) return 'csv';
  return null;
}

/** O que dizer quando o arquivo não é de nenhum formato conhecido. */
export const FORMATOS_ACEITOS = '.csv, .txt, .xlsx, .pdf e imagens (print da tela)';

/**
 * Lê texto sem cabeçalho pelos dois caminhos e fica com o melhor.
 *
 * O PDF de alguns bancos traz "Data Histórico Valor" numa linha, e aí a
 * descoberta por cabeçalho acerta mais; o de outros não traz nada. Tentar os
 * dois e comparar o resultado é mais honesto do que escolher no escuro — e o
 * critério é o único que importa: quantos lançamentos saíram.
 */
function melhorLeituraDeTexto(texto: string): { leitura: LeituraBanco; ignoradas: number } {
  const soltas = lerLinhasSoltas(texto);
  const comCabecalho = lerCsvDeBanco(texto);
  if (comCabecalho.linhas.length > soltas.linhas.length) {
    return { leitura: comCabecalho, ignoradas: 0 };
  }
  return { leitura: soltas, ignoradas: soltas.ignoradas };
}

/** Lê um arquivo de qualquer formato aceito. */
export async function lerArquivoDeBanco(
  arquivo: File,
  aoProgredir?: (fracao: number) => void,
): Promise<LeituraDeArquivo> {
  const formato = formatoDoArquivo(arquivo.name, arquivo.type);
  if (!formato) {
    throw new Error(`Não sei ler "${arquivo.name}". Os formatos aceitos são ${FORMATOS_ACEITOS}.`);
  }

  if (formato === 'csv') {
    const leitura = lerCsvDeBanco(await arquivo.text());
    // Um `.txt` colado do aplicativo do banco raramente tem cabeçalho; se o
    // leitor de CSV não achou nada, o de linhas soltas costuma achar.
    if (leitura.linhas.length === 0) {
      const { leitura: solta, ignoradas } = melhorLeituraDeTexto(await arquivo.text());
      if (solta.linhas.length > 0) return { ...solta, formatoDeEntrada: 'csv', ignoradas };
    }
    return { ...leitura, formatoDeEntrada: 'csv', ignoradas: 0 };
  }

  if (formato === 'planilha') {
    const tabela = lerXlsx(new Uint8Array(await arquivo.arrayBuffer()));
    const { lerTabelaDeBanco } = await import('./banco-csv.ts');
    return { ...lerTabelaDeBanco(tabela, 'planilha'), formatoDeEntrada: 'planilha', ignoradas: 0 };
  }

  if (formato === 'pdf') {
    const texto = await textoDoPdf(await arquivo.arrayBuffer());
    const { leitura, ignoradas } = melhorLeituraDeTexto(texto);
    return { ...leitura, formatoDeEntrada: 'pdf', ignoradas };
  }

  const texto = await textoDaImagem(arquivo, aoProgredir);
  const { leitura, ignoradas } = melhorLeituraDeTexto(texto);
  return { ...leitura, formatoDeEntrada: 'imagem', ignoradas };
}

/** Lê o que a pessoa colou na caixa de texto. */
export function lerTextoColado(texto: string): LeituraDeArquivo {
  const { leitura, ignoradas } = melhorLeituraDeTexto(texto);
  return { ...leitura, formatoDeEntrada: 'colado', ignoradas };
}
