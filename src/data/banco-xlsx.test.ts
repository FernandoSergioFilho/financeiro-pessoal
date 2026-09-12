/**
 * O teste monta um `.xlsx` de verdade — zip com os mesmos XML que o Excel
 * grava — e lê de volta. Um arquivo montado à mão prova mais do que um objeto
 * simulado: se o formato mudar de entendimento, o teste quebra aqui e não no
 * celular de alguém.
 */

import { DOMParser } from '@xmldom/xmldom';
import { zipSync, strToU8 } from 'fflate';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { lerTabelaDeBanco } from './banco-csv.ts';
import { colunaDaReferencia, dataDoExcel, lerXlsx } from './banco-xlsx.ts';

// O ambiente de teste é Node, que não tem DOMParser.
beforeAll(() => {
  vi.stubGlobal('DOMParser', DOMParser);
});

/** Monta um xlsx com uma aba, usando a tabela de textos compartilhados. */
function planilha(linhas: readonly (readonly (string | number)[])[]): Uint8Array {
  const textos: string[] = [];
  const indice = (t: string) => {
    const achado = textos.indexOf(t);
    if (achado !== -1) return achado;
    textos.push(t);
    return textos.length - 1;
  };

  const letra = (n: number) => String.fromCharCode(65 + n);
  const xmlLinhas = linhas
    .map((linha, i) => {
      const celulas = linha
        .map((valor, j) => {
          const ref = `${letra(j)}${i + 1}`;
          return typeof valor === 'number'
            ? `<c r="${ref}"><v>${valor}</v></c>`
            : `<c r="${ref}" t="s"><v>${indice(valor)}</v></c>`;
        })
        .join('');
      return `<row r="${i + 1}">${celulas}</row>`;
    })
    .join('');

  const compartilhadas = `<?xml version="1.0"?><sst>${
    textos.map((t) => `<si><t>${t}</t></si>`).join('')
  }</sst>`;
  const aba = `<?xml version="1.0"?><worksheet><sheetData>${xmlLinhas}</sheetData></worksheet>`;

  return zipSync({
    '[Content_Types].xml': strToU8('<?xml version="1.0"?><Types/>'),
    'xl/sharedStrings.xml': strToU8(compartilhadas),
    'xl/worksheets/sheet1.xml': strToU8(aba),
  });
}

describe('dataDoExcel', () => {
  /*
   * O Excel guarda data como "dias desde 30/12/1899". Sem converter, a coluna
   * de data chega como um número de cinco dígitos e nenhuma linha é lida.
   */
  it('converte o número serial na data', () => {
    expect(dataDoExcel(46272)).toBe('2026-09-07');
    expect(dataDoExcel(1)).toBe('1899-12-31');
  });

  it('número fora do calendário não é data', () => {
    expect(dataDoExcel(0)).toBeNull();
    expect(dataDoExcel(-5)).toBeNull();
    expect(dataDoExcel(Number.NaN)).toBeNull();
  });
});

describe('colunaDaReferencia', () => {
  it('lê o endereço da célula, inclusive de duas letras', () => {
    expect(colunaDaReferencia('A1')).toBe(0);
    expect(colunaDaReferencia('C7')).toBe(2);
    expect(colunaDaReferencia('AA1')).toBe(26);
    expect(colunaDaReferencia('BC12')).toBe(54);
  });
});

describe('lerXlsx', () => {
  it('devolve a planilha como tabela de texto', () => {
    const arquivo = planilha([
      ['Data', 'Descrição', 'Valor'],
      [46272, 'PIX RECEBIDO MARIA', '1250,00'],
    ]);
    expect(lerXlsx(arquivo)).toEqual([
      ['Data', 'Descrição', 'Valor'],
      ['2026-09-07', 'PIX RECEBIDO MARIA', '1250,00'],
    ]);
  });

  /*
   * Planilha de banco costuma ter linhas em branco entre os blocos. Cada uma
   * viraria um problema relatado, enchendo a tela de ruído.
   */
  it('pula as linhas totalmente vazias', () => {
    const arquivo = planilha([['Data', 'Valor'], ['', ''], ['2026-09-07', '10,00']]);
    expect(lerXlsx(arquivo)).toHaveLength(2);
  });

  it('um número que não é data continua número', () => {
    const arquivo = planilha([['Valor'], [1250.5]]);
    expect(lerXlsx(arquivo)[1]).toEqual(['1250.5']);
  });

  /*
   * `.xls` antigo é binário, não zip. Devolver vazio faria o usuário achar que
   * o extrato dele não tem nada; a mensagem diz o que fazer.
   */
  it('arquivo que não é xlsx explica o que fazer, em vez de falhar calado', () => {
    const binario = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    expect(() => lerXlsx(binario)).toThrow(/\.xls antigo|senha/);
  });

  it('planilha sem aba nenhuma diz isso', () => {
    const semAba = zipSync({ 'xl/sharedStrings.xml': strToU8('<?xml version="1.0"?><sst/>') });
    expect(() => lerXlsx(semAba)).toThrow(/nenhuma aba/);
  });

  /*
   * A razão de o leitor devolver tabela e não lançamentos: a descoberta de
   * colunas é a mesma do CSV, testada uma vez e valendo para os dois.
   */
  it('a tabela entra direto na descoberta de colunas do CSV', () => {
    const arquivo = planilha([
      ['Data', 'Histórico', 'Valor'],
      [46272, 'PIX RECEBIDO MARIA', '1250,00'],
      [46273, 'SUPERMERCADO', '-70,00'],
    ]);
    const lido = lerTabelaDeBanco(lerXlsx(arquivo), 'planilha');
    expect(lido.linhas.map((l) => [l.data, l.descricao, l.valor])).toEqual([
      ['2026-09-07', 'PIX RECEBIDO MARIA', 125000],
      ['2026-09-08', 'SUPERMERCADO', -7000],
    ]);
    expect(lido.formato?.colunaDescricao).toBe('Histórico');
  });
});
