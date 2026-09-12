/**
 * Ler lançamentos de um texto que não tem cabeçalho nenhum.
 *
 * O CSV e a planilha trazem uma linha de títulos, e `lerTabelaDeBanco` descobre
 * as colunas por ali. O PDF do extrato, o print da tela do banco e o texto
 * copiado do aplicativo não trazem: o que chega é uma pilha de linhas soltas,
 *
 *     07/09/2026  PIX RECEBIDO MARIA SILVA      1.250,00      3.480,12
 *     08/09/2026  SUPERMERCADO BOM PRECO          -70,00      3.410,12
 *
 * e às vezes nem isso. Então aqui a descoberta é **pelo conteúdo**: numa linha,
 * o que se parece com data é a data, o que se parece com dinheiro é dinheiro, e
 * o que sobra é a descrição.
 *
 * **O problema do saldo.** A linha acima tem dois números, e o último é o saldo
 * corrente, não o valor — importá-lo lançaria R$ 3.480,12 de PIX. Não dá para
 * decidir isso linha a linha: decide-se pelo **formato do arquivo inteiro**. Se
 * a maioria das linhas tem dois números, o segundo é saldo. Se tem um, é valor.
 * É o mesmo princípio que já escolhe o separador do CSV — consistência entre as
 * linhas, e não o que parece certo numa delas.
 *
 * **O sinal.** Extrato de banco frequentemente não traz o menos: escreve "D" e
 * "C", ou pinta de vermelho (que o texto não guarda). Quando há saldo, o sinal
 * sai de graça — se o saldo caiu, saiu dinheiro. É a leitura mais confiável que
 * existe aqui, porque não depende de convenção nenhuma do banco.
 */

import { parseMoney } from '../domain/money.ts';
import { isValidISO, toISO, today } from '../domain/date.ts';
import type { LeituraBanco, LinhaBanco, ProblemaLeitura } from './banco-csv.ts';

const MESES: Record<string, number> = {
  jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6,
  jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
  // Os mesmos em inglês: alguns aplicativos exportam assim.
  feb: 2, apr: 4, may: 5, aug: 8, sep: 9, oct: 10, dec: 12,
};

/** `07/09/2026`, `07/09/26`, `2026-09-07`, `07 set 2026`, `07 set`. */
const PADROES_DE_DATA = [
  /\b(\d{4})-(\d{2})-(\d{2})\b/,
  /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b/,
  /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2})\b/,
  /\b(\d{1,2})\s*(?:de\s+)?([a-zç]{3,9})\.?\s*(?:de\s+)?(\d{4})\b/i,
  /\b(\d{1,2})[/.-](\d{1,2})\b/,
  /\b(\d{1,2})\s*(?:de\s+)?([a-zç]{3,9})\b/i,
];

/**
 * Dinheiro no formato brasileiro, com ou sem `R$`, com ou sem sinal.
 *
 * Exige a vírgula decimal de propósito: sem ela, o `12` de "PARCELA 3/12" e o
 * `2026` de uma data viram valores, e o extrato importa lixo.
 */
const DINHEIRO = /(?:R\$\s*)?(-|\+|−)?\s*(\d{1,3}(?:\.\d{3})*|\d+),(\d{2})\b\s*(D|C)?/gi;

export interface ValorAchado {
  texto: string;
  valor: number;
  inicio: number;
  fim: number;
}

/** Todos os valores em dinheiro de uma linha, na ordem em que aparecem. */
export function acharValores(linha: string): ValorAchado[] {
  const achados: ValorAchado[] = [];
  DINHEIRO.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = DINHEIRO.exec(linha)) !== null) {
    const valor = parseMoney(`${m[2]},${m[3]}`);
    if (valor === null) continue;
    const negativo = m[1] === '-' || m[1] === '−' || (m[4] ?? '').toUpperCase() === 'D';
    achados.push({
      texto: m[0].trim(),
      valor: negativo ? -valor : valor,
      inicio: m.index,
      fim: m.index + m[0].length,
    });
  }
  return achados;
}

/**
 * A primeira data de uma linha, em ISO.
 *
 * `anoDeReferencia` serve para as datas sem ano ("07/09", "12 set"), que são a
 * regra no print da tela de um banco: sem ele o extrato de dezembro importado
 * em janeiro cairia no ano errado.
 */
export function acharData(linha: string, anoDeReferencia: number): { iso: string; inicio: number; fim: number } | null {
  for (const padrao of PADROES_DE_DATA) {
    const m = padrao.exec(linha);
    if (!m) continue;

    let ano: number;
    let mes: number;
    let dia: number;

    if (padrao === PADROES_DE_DATA[0]) {
      [ano, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
    } else if (/^[a-zç]/i.test(m[2] ?? '')) {
      const chave = (m[2] ?? '').slice(0, 3).toLowerCase();
      const numero = MESES[chave];
      if (!numero) continue;
      [dia, mes, ano] = [Number(m[1]), numero, m[3] ? Number(m[3]) : anoDeReferencia];
    } else {
      dia = Number(m[1]);
      mes = Number(m[2]);
      const cru = m[3];
      // Ano de dois dígitos: 26 é 2026, não 1926.
      ano = cru === undefined ? anoDeReferencia : cru.length === 2 ? 2000 + Number(cru) : Number(cru);
    }

    if (mes < 1 || mes > 12 || dia < 1 || dia > 31) continue;
    const iso = toISO({ year: ano, month: mes, day: dia });
    if (!isValidISO(iso)) continue;
    return { iso, inicio: m.index, fim: m.index + m[0].length };
  }
  return null;
}

/**
 * O ano a assumir nas datas que não trazem ano.
 *
 * Sai de uma data completa do próprio texto, quando existe — é a resposta certa
 * e não depende de quando a importação está sendo feita. Sem nenhuma, assume o
 * ano corrente; e se isso jogasse os lançamentos mais de um mês no futuro, usa
 * o anterior: um extrato de dezembro importado em janeiro é de dezembro
 * passado, não do que ainda vem.
 */
export function anoDeReferencia(linhas: readonly string[], hoje = today()): number {
  for (const linha of linhas) {
    for (const padrao of PADROES_DE_DATA.slice(0, 4)) {
      const m = padrao.exec(linha);
      const cru = m?.[3] ?? (padrao === PADROES_DE_DATA[0] ? m?.[1] : undefined);
      if (cru && cru.length === 4) return Number(cru);
    }
  }
  return Number(hoje.slice(0, 4));
}

/** Quantos valores as linhas costumam ter — o formato, e não o caso. */
function formatoDeValores(porLinha: readonly number[]): number {
  const contagem = new Map<number, number>();
  for (const n of porLinha) if (n > 0) contagem.set(n, (contagem.get(n) ?? 0) + 1);
  let melhor = 1;
  let maior = 0;
  for (const [quantos, vezes] of contagem) {
    if (vezes > maior) { maior = vezes; melhor = quantos; }
  }
  return melhor;
}

/**
 * Linhas que têm data e valor mas não são lançamento: "SALDO EM 09/09: 2.210,12",
 * "TOTAL DA FATURA", "LIMITE DISPONÍVEL". Sem isto o saldo do rodapé entra como
 * uma receita do tamanho da conta inteira.
 *
 * O "total" pede cuidado: "TOTAL EXPRESS" é uma transportadora, e virar resumo
 * apagaria uma compra de verdade. Por isso ele só conta como resumo em
 * descrição curta — um resumo é "Total da fatura", não uma frase.
 */
function ehLinhaDeResumo(descricao: string): boolean {
  const texto = descricao
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (texto === '') return false;
  if (/^saldo\b/.test(texto)) return true;
  if (/^limite\b/.test(texto)) return true;
  if (/^pagamento minimo\b/.test(texto)) return true;
  const palavras = texto.split(' ');
  if (/^(total|subtotal|valor total)\b/.test(texto) && palavras.length <= 4) return true;
  return false;
}

export interface LeituraDeTexto extends LeituraBanco {
  /** Quantas linhas do texto não pareciam lançamento e foram ignoradas em silêncio. */
  ignoradas: number;
}

/**
 * Lê lançamentos de linhas soltas.
 *
 * Linhas que não têm data **nem** valor são descartadas sem reclamar: num PDF
 * de extrato, a maior parte da página é cabeçalho, rodapé, endereço da agência
 * e texto legal. Relatar cada uma como problema encheria a tela de ruído e
 * esconderia o que importa. Já a linha que tem data mas não tem valor — ou o
 * contrário — vira problema relatado: essa era para ser um lançamento.
 */
export function lerLinhasSoltas(texto: string, hoje = today()): LeituraDeTexto {
  const linhas = texto
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l !== '');

  if (linhas.length === 0) {
    return { linhas: [], problemas: [{ linha: 0, motivo: 'Não veio texto nenhum.' }], formato: null, ignoradas: 0 };
  }

  const ano = anoDeReferencia(linhas, hoje);
  const lidas = linhas.map((linha, i) => ({
    numero: i + 1,
    texto: linha,
    data: acharData(linha, ano),
    valores: acharValores(linha),
  }));

  const quantosValores = formatoDeValores(
    lidas.filter((l) => l.data).map((l) => l.valores.length),
  );
  // Dois números por linha e o segundo é o saldo corrente. Três ou mais: o
  // último ainda é o saldo, e o primeiro continua sendo o valor.
  const temSaldo = quantosValores >= 2;

  const achadas: LinhaBanco[] = [];
  const problemas: ProblemaLeitura[] = [];
  let ignoradas = 0;
  let saldoAnterior: number | null = null;

  for (const l of lidas) {
    if (!l.data && l.valores.length === 0) { ignoradas += 1; continue; }
    if (!l.data) { ignoradas += 1; continue; }

    if (l.valores.length === 0) {
      problemas.push({ linha: l.numero, motivo: `Achei a data mas nenhum valor: "${l.texto.slice(0, 60)}".` });
      continue;
    }

    const oValor = l.valores[0]!;
    const oSaldo = temSaldo && l.valores.length >= 2 ? l.valores.at(-1)! : null;

    // O sinal, na ordem de confiança: o que o próprio número diz; senão, o que
    // o saldo revela ao subir ou descer; senão, fica positivo e quem decide é a
    // tela de conferência.
    let valor = oValor.valor;
    if (valor > 0 && oSaldo && saldoAnterior !== null) {
      if (oSaldo.valor < saldoAnterior) valor = -valor;
    }
    if (oSaldo) saldoAnterior = oSaldo.valor;

    // A descrição é o que sobra depois de tirar a data e os números.
    const pedacos = [
      l.texto.slice(0, l.data.inicio),
      l.texto.slice(l.data.fim, oValor.inicio),
      oSaldo ? '' : l.texto.slice(oValor.fim),
    ];
    const descricao = pedacos.join(' ').replace(/\s+/g, ' ').replace(/^[\s\-–—|.:]+|[\s\-–—|.:]+$/g, '').trim();

    if (!descricao) {
      problemas.push({ linha: l.numero, motivo: `Linha sem descrição: "${l.texto.slice(0, 60)}".` });
      continue;
    }
    if (valor === 0) {
      problemas.push({ linha: l.numero, motivo: `Valor zerado: "${l.texto.slice(0, 60)}".` });
      continue;
    }
    // Resumo não é lançamento, e também não é problema: é parte do documento.
    if (ehLinhaDeResumo(descricao)) { ignoradas += 1; continue; }

    achadas.push({ data: l.data.iso, descricao, valor, identificador: null, linha: l.numero });
  }

  return {
    linhas: achadas,
    problemas,
    ignoradas,
    formato: achadas.length === 0 ? null : {
      separador: 'texto corrido',
      colunaData: 'a data de cada linha',
      colunaDescricao: 'o que sobra da linha',
      colunaValor: temSaldo ? 'o primeiro valor (o último é o saldo)' : 'o valor da linha',
      colunaIdentificador: null,
    },
  };
}
