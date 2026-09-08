/**
 * Ler o CSV que o banco exporta.
 *
 * Não é o CSV do próprio aplicativo (esse mora em `exchange.ts` e tem colunas
 * conhecidas). Aqui o arquivo vem de fora e cada banco escreve do seu jeito:
 * o Nubank exporta o extrato como `Data,Valor,Identificador,Descrição` com
 * vírgula e data brasileira, e a fatura do cartão como `date,title,amount`
 * com data ISO e nomes em inglês. Outros usam ponto e vírgula, escrevem
 * "Histórico" ou "Lançamento" no lugar de "Descrição", e separam centavos com
 * vírgula.
 *
 * Em vez de uma lista de bancos suportados — que envelhece e falha calada no
 * dia em que o banco muda uma coluna —, o leitor descobre o formato pelo
 * conteúdo: qual separador divide o arquivo em colunas parelhas, e qual
 * cabeçalho é data, valor e descrição. O que ele não entender vira problema
 * relatado, nunca lançamento inventado.
 */

import { isValidISO, toISO } from '../domain/date.ts';
import { parseMoney } from '../domain/money.ts';
import { chaveDeNome } from '../domain/text.ts';

export interface LinhaBanco {
  /** `YYYY-MM-DD`. */
  data: string;
  descricao: string;
  /** Centavos, com sinal: negativo é saída. */
  valor: number;
  /** O identificador do banco, quando existe — o jeito mais seguro de não repetir. */
  identificador: string | null;
  /** Número da linha no arquivo, para o usuário achar o que deu errado. */
  linha: number;
}

export interface ProblemaLeitura {
  linha: number;
  motivo: string;
}

export interface LeituraBanco {
  linhas: LinhaBanco[];
  problemas: ProblemaLeitura[];
  /** O que o leitor descobriu, para poder ser mostrado e conferido. */
  formato: {
    separador: string;
    colunaData: string;
    colunaDescricao: string;
    colunaValor: string;
    colunaIdentificador: string | null;
  } | null;
}

const SEPARADORES = [',', ';', '\t', '|'];

/** Nomes de coluna que já vimos, e os que são a mesma coisa em inglês. */
const NOMES = {
  data: ['data', 'date', 'data lancamento', 'data da compra', 'data do lancamento', 'dt', 'data mov', 'data movimento'],
  descricao: [
    'descricao', 'description', 'title', 'historico', 'lancamento', 'detalhe', 'detalhes',
    'estabelecimento', 'memo', 'observacao', 'nome',
  ],
  valor: ['valor', 'amount', 'value', 'quantia', 'montante', 'valor r', 'valor brl'],
  identificador: ['identificador', 'id', 'transaction id', 'idtransacao', 'codigo', 'referencia'],
} as const;

/**
 * O separador é o que produz mais colunas de forma **consistente**.
 *
 * Contar ocorrências não basta: uma descrição cheia de vírgulas venceria um
 * arquivo de ponto e vírgula. Consistência entre as linhas é o que distingue
 * um separador de verdade de um caractere que só aparece no meio do texto.
 */
export function descobrirSeparador(texto: string): string {
  const linhas = texto.split(/\r?\n/).filter((l) => l.trim() !== '').slice(0, 20);
  if (linhas.length === 0) return ',';

  let melhor = ',';
  let melhorNota = -1;
  for (const sep of SEPARADORES) {
    const contagens = linhas.map((l) => dividirLinha(l, sep).length);
    const primeira = contagens[0]!;
    if (primeira < 2) continue;
    const iguais = contagens.filter((c) => c === primeira).length / contagens.length;
    const nota = iguais * 10 + primeira;
    if (nota > melhorNota) {
      melhorNota = nota;
      melhor = sep;
    }
  }
  return melhor;
}

/** Divide uma linha respeitando aspas, como manda o formato. */
function dividirLinha(linha: string, sep: string): string[] {
  const celulas: string[] = [];
  let atual = '';
  let dentroDeAspas = false;
  for (let i = 0; i < linha.length; i += 1) {
    const c = linha[i]!;
    if (dentroDeAspas) {
      if (c === '"') {
        if (linha[i + 1] === '"') { atual += '"'; i += 1; } else dentroDeAspas = false;
      } else atual += c;
    } else if (c === '"') dentroDeAspas = true;
    else if (c === sep) { celulas.push(atual); atual = ''; }
    else atual += c;
  }
  celulas.push(atual);
  return celulas;
}

function acharColuna(cabecalho: readonly string[], nomes: readonly string[]): number {
  const chaves = cabecalho.map((c) => chaveDeNome(c).replace(/[^a-z0-9 ]/g, '').trim());
  // Nome exato primeiro: "data" antes de "data de vencimento" quando ambos existem.
  for (const nome of nomes) {
    const exato = chaves.indexOf(nome);
    if (exato !== -1) return exato;
  }
  for (const nome of nomes) {
    const parcial = chaves.findIndex((c) => c.startsWith(nome));
    if (parcial !== -1) return parcial;
  }
  return -1;
}

/** Aceita `2026-09-07`, `07/09/2026` e `07-09-2026`. */
export function lerDataDeBanco(valor: string): string | null {
  const texto = valor.trim();
  if (isValidISO(texto)) return texto;
  const br = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(texto);
  if (br) {
    const iso = toISO({ year: Number(br[3]), month: Number(br[2]), day: Number(br[1]) });
    return isValidISO(iso) ? iso : null;
  }
  // Alguns exportam com hora junto: fica só o dia.
  const comHora = /^(\d{4}-\d{2}-\d{2})[T ]/.exec(texto);
  if (comHora && isValidISO(comHora[1]!)) return comHora[1]!;
  return null;
}

export function lerCsvDeBanco(texto: string): LeituraBanco {
  const limpo = texto.replace(/^﻿/, '');
  const cruas = limpo.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (cruas.length === 0) {
    return { linhas: [], problemas: [{ linha: 0, motivo: 'O arquivo está vazio.' }], formato: null };
  }

  const separador = descobrirSeparador(limpo);
  const cabecalho = dividirLinha(cruas[0]!, separador).map((c) => c.trim());

  const iData = acharColuna(cabecalho, NOMES.data);
  const iDescricao = acharColuna(cabecalho, NOMES.descricao);
  const iValor = acharColuna(cabecalho, NOMES.valor);
  const iId = acharColuna(cabecalho, NOMES.identificador);

  const faltando = [
    iData === -1 ? 'data' : null,
    iDescricao === -1 ? 'descrição' : null,
    iValor === -1 ? 'valor' : null,
  ].filter(Boolean);

  if (faltando.length > 0) {
    return {
      linhas: [],
      problemas: [{
        linha: 1,
        motivo:
          `Não achei ${faltando.length === 1 ? 'a coluna de' : 'as colunas de'} ${faltando.join(' e ')}. ` +
          `O cabeçalho do arquivo é: ${cabecalho.join(' | ')}.`,
      }],
      formato: null,
    };
  }

  const linhas: LinhaBanco[] = [];
  const problemas: ProblemaLeitura[] = [];

  for (let i = 1; i < cruas.length; i += 1) {
    const numero = i + 1;
    const celulas = dividirLinha(cruas[i]!, separador);
    const data = lerDataDeBanco(celulas[iData] ?? '');
    const descricao = (celulas[iDescricao] ?? '').trim();
    const valor = parseMoney(celulas[iValor] ?? '');

    if (!data) {
      problemas.push({ linha: numero, motivo: `Data não reconhecida: "${(celulas[iData] ?? '').trim()}".` });
      continue;
    }
    if (valor === null || valor === 0) {
      problemas.push({ linha: numero, motivo: `Valor não reconhecido: "${(celulas[iValor] ?? '').trim()}".` });
      continue;
    }
    if (!descricao) {
      problemas.push({ linha: numero, motivo: 'Linha sem descrição.' });
      continue;
    }

    linhas.push({
      data,
      descricao,
      valor,
      identificador: iId === -1 ? null : (celulas[iId] ?? '').trim() || null,
      linha: numero,
    });
  }

  return {
    linhas,
    problemas,
    formato: {
      separador: separador === '\t' ? 'tabulação' : separador,
      colunaData: cabecalho[iData]!,
      colunaDescricao: cabecalho[iDescricao]!,
      colunaValor: cabecalho[iValor]!,
      colunaIdentificador: iId === -1 ? null : cabecalho[iId]!,
    },
  };
}
