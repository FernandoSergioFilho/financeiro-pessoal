/**
 * O substituto de `banco-pesados.ts` no build de arquivo único.
 *
 * Inlinar o pdf.js e o reconhecimento de texto faria o `financeiro.html` passar
 * de 640 kB para dezenas de megabytes — num arquivo cuja graça é caber num
 * pendrive e abrir com dois cliques. Quem abre o arquivo solto do disco tem o
 * CSV, a planilha e o colar texto, que cobrem o mesmo caminho; para PDF e print
 * o lugar é o site.
 *
 * A mesma assinatura do original, de propósito: a tela não precisa saber em
 * qual dos dois builds está.
 */

const RECADO =
  'Esta versão em arquivo único não lê PDF nem imagem — eles pesariam mais do que o app inteiro. '
  + 'Abra o site para importar esses formatos, ou use o CSV, a planilha, ou cole o texto aqui mesmo.';

export async function textoDoPdf(_arquivo: ArrayBuffer): Promise<string> {
  throw new Error(RECADO);
}

export async function textoDaImagem(
  _arquivo: File | Blob,
  _aoProgredir?: (fracao: number) => void,
): Promise<string> {
  throw new Error(RECADO);
}

export function agruparEmLinhas(): string {
  return '';
}
