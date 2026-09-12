/**
 * Ler a planilha do Excel que o banco exporta.
 *
 * **Por que não uma biblioteca pronta.** A mais usada (SheetJS) traz 7 MB para
 * resolver escrita, fórmulas, gráficos, macros e trinta anos de formatos. Aqui
 * é preciso ler células de texto de uma aba, e o app inteiro tem 640 kB — a
 * dependência seria dez vezes maior do que o produto. Um `.xlsx` é um zip com
 * XML dentro, e `fflate` descompacta em 10 kB; o resto é `DOMParser`, que o
 * navegador já tem.
 *
 * **O que este leitor faz e o que não faz.** Lê a primeira aba com conteúdo,
 * texto e números, e converte a data serial do Excel. Não lê fórmulas (lê o
 * último valor calculado, que é o que o arquivo guarda e o que interessa), não
 * lê `.xls` antigo — que é outro formato, binário — e não lê planilha protegida
 * por senha. Nos dois últimos casos ele diz isso, em vez de devolver vazio.
 */

import { unzipSync, strFromU8 } from 'fflate';

import { toISO } from '../domain/date.ts';

/** O dia zero do Excel, com o bug do ano 1900 que ele nunca corrigiu. */
const EPOCA_DO_EXCEL = Date.UTC(1899, 11, 30);

/**
 * Número serial do Excel para `YYYY-MM-DD`.
 *
 * O Excel guarda data como "quantos dias desde 30/12/1899" — 46007 é
 * 07/09/2026. Sem converter, a coluna de data chegaria como um número de cinco
 * dígitos e nenhuma linha seria lida.
 */
export function dataDoExcel(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 1 || serial > 2958466) return null;
  const d = new Date(EPOCA_DO_EXCEL + Math.floor(serial) * 86400000);
  return toISO({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() });
}

/** `BC12` → coluna 54. As células trazem o endereço, não a posição. */
export function colunaDaReferencia(ref: string): number {
  const letras = /^([A-Z]+)/.exec(ref)?.[1] ?? '';
  let n = 0;
  for (const letra of letras) n = n * 26 + (letra.charCodeAt(0) - 64);
  return n - 1;
}

function texto(no: Element | null): string {
  return no?.textContent ?? '';
}

/**
 * A planilha como uma tabela de texto, pronta para `lerTabelaDeBanco`.
 *
 * Lança com mensagem em português quando o arquivo não é um `.xlsx` legível —
 * quem chama transforma isso no aviso da tela.
 */
export function lerXlsx(arquivo: Uint8Array): string[][] {
  let zip: Record<string, Uint8Array>;
  try {
    zip = unzipSync(arquivo);
  } catch {
    // `.xls` antigo é binário, não zip; e o zip cifrado também falha aqui.
    throw new Error(
      'Não consegui abrir esta planilha. Se ela for um arquivo .xls antigo ou estiver protegida '
      + 'por senha, abra no Excel e salve como .xlsx (ou exporte em CSV).',
    );
  }

  const parser = new DOMParser();

  // O texto das células vive numa tabela à parte, e a célula guarda o índice.
  const compartilhadas: string[] = [];
  const brutoCompartilhado = zip['xl/sharedStrings.xml'];
  if (brutoCompartilhado) {
    const doc = parser.parseFromString(strFromU8(brutoCompartilhado), 'application/xml');
    for (const si of Array.from(doc.getElementsByTagName('si'))) {
      // Texto formatado vem picado em vários <t>; junta tudo.
      const partes = Array.from(si.getElementsByTagName('t')).map((t) => texto(t));
      compartilhadas.push(partes.join(''));
    }
  }

  const nomeDaAba = Object.keys(zip)
    .filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
    .sort()[0];
  if (!nomeDaAba) throw new Error('Esta planilha não tem nenhuma aba com dados.');

  const doc = parser.parseFromString(strFromU8(zip[nomeDaAba]!), 'application/xml');
  const tabela: string[][] = [];

  for (const linha of Array.from(doc.getElementsByTagName('row'))) {
    const celulas: string[] = [];
    for (const c of Array.from(linha.getElementsByTagName('c'))) {
      const onde = colunaDaReferencia(c.getAttribute('r') ?? '');
      const tipo = c.getAttribute('t');
      let valor: string;

      if (tipo === 's') {
        valor = compartilhadas[Number(texto(c.getElementsByTagName('v')[0] ?? null))] ?? '';
      } else if (tipo === 'inlineStr') {
        valor = Array.from(c.getElementsByTagName('t')).map((t) => texto(t)).join('');
      } else {
        const cru = texto(c.getElementsByTagName('v')[0] ?? null);
        // Data do Excel é número; o estilo diz que é data, mas ler a tabela de
        // estilos inteira por causa disso não se paga. O critério é a faixa: um
        // valor entre 1980 e 2100 em dias seriais não é dinheiro nem quantidade.
        const numero = Number(cru);
        const comoData = cru !== '' && Number.isFinite(numero) && numero >= 29221 && numero <= 73050
          ? dataDoExcel(numero)
          : null;
        valor = comoData ?? cru;
      }

      if (onde >= 0) {
        while (celulas.length < onde) celulas.push('');
        celulas[onde] = valor.trim();
      }
    }
    // Linha inteiramente vazia não entra: planilha de banco costuma ter várias
    // no meio, e cada uma viraria um problema relatado.
    if (celulas.some((c) => c !== '')) tabela.push(celulas);
  }

  if (tabela.length === 0) throw new Error('A planilha está vazia.');
  return tabela;
}
