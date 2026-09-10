/**
 * Conciliar o extrato do banco com o que já está lançado.
 *
 * O risco de importar um extrato é lançar de novo o que já foi digitado à
 * mão, ou reimportar o mesmo arquivo por engano — e o estrago é silencioso: o
 * saldo fica errado e nada avisa. Por isso a importação não grava direto.
 * Cada linha do arquivo vira uma **proposta**, com um veredito e o motivo:
 *
 * - `nova` — nada parecido no aplicativo; entra marcada;
 * - `repetida` — o mesmo valor, no mesmo dia ou por perto, e a descrição bate;
 *   entra desmarcada, com o lançamento existente ao lado;
 * - `talvez` — mesmo valor e mesmo dia, mas descrição diferente. Acontece
 *   quando a pessoa digitou "Mercado" e o banco escreve "PAG*SUPERMERCADOX".
 *   Fica desmarcada, porque errar para o lado de não duplicar é o certo aqui:
 *   um lançamento que faltou a pessoa percebe e adiciona; um duplicado passa
 *   despercebido e envenena todos os números.
 *
 * Quem decide é sempre a pessoa: nada aqui grava nada.
 */

import { addDays } from './date.ts';
import { lerMarcaDeParcela, type MarcaDeParcela } from './installments.ts';
import { descricoesCasam, textoComparavel } from './similar.ts';

// Reexportados porque a tela de importação já os consome daqui.
export { lerMarcaDeParcela };
export type { MarcaDeParcela };
import type { Category, Entry, EntryKind } from './types.ts';

/** Dias de folga ao procurar o mesmo lançamento — banco e pessoa datam diferente. */
export const FOLGA_DE_DIAS = 3;

export type Veredito = 'nova' | 'repetida' | 'talvez';

export interface LinhaDeExtrato {
  data: string;
  descricao: string;
  /** Centavos, com sinal: negativo é saída. */
  valor: number;
  identificador: string | null;
  linha: number;
}

export interface Proposta {
  linha: LinhaDeExtrato;
  veredito: Veredito;
  /** O lançamento que já existe e parece ser este. */
  jaExiste?: Entry;
  motivo: string;
  /** Como o lançamento entraria, se entrar. */
  kind: EntryKind;
  valorAbsoluto: number;
  categoriaSugerida: string | null;
  /** "1/6" lido da descrição, quando o banco escreve. */
  parcela: MarcaDeParcela | null;
}

export interface OpcoesConciliacao {
  /** A conta que recebe os lançamentos. */
  accountId: string;
  /**
   * Fatura de cartão: os valores vêm positivos e são todos gasto. Sem isto,
   * uma fatura inteira entraria como receita.
   */
  tudoEhGasto?: boolean;
  folgaDeDias?: number;
  categorias?: readonly Category[];
}

/**
 * Categoria provável, aprendida do próprio histórico.
 *
 * "UBER *TRIP" nunca vai casar com "Uber" por igualdade, mas casa por
 * palavra: se todas as vezes que apareceu "uber" a pessoa marcou Transporte,
 * a sugestão é Transporte. É palpite, e por isso a linha continua editável.
 */
export function sugerirCategoria(
  historico: readonly Entry[],
  descricao: string,
  kind: EntryKind,
): string | null {
  const palavras = textoComparavel(descricao).split(' ').filter((p) => p.length >= 4);
  if (palavras.length === 0) return null;

  const votos = new Map<string, number>();
  for (const entry of historico) {
    if (!entry.categoryId || entry.kind !== kind) continue;
    const alvo = textoComparavel(entry.description);
    if (!alvo) continue;
    for (const palavra of palavras) {
      if (alvo.includes(palavra)) {
        votos.set(entry.categoryId, (votos.get(entry.categoryId) ?? 0) + 1);
        break;
      }
    }
  }

  let melhor: string | null = null;
  let melhorVoto = 0;
  for (const [categoria, voto] of votos) {
    if (voto > melhorVoto) {
      melhor = categoria;
      melhorVoto = voto;
    }
  }
  return melhor;
}

export function conciliar(
  existentes: readonly Entry[],
  linhas: readonly LinhaDeExtrato[],
  opcoes: OpcoesConciliacao,
): Proposta[] {
  const folga = opcoes.folgaDeDias ?? FOLGA_DE_DIAS;

  // Um lançamento existente só pode explicar **uma** linha do extrato: duas
  // compras iguais no mesmo dia são duas compras, e a segunda tem de entrar.
  const gastos = new Set<string>();

  return linhas.map((linha) => {
    const kind: EntryKind = opcoes.tudoEhGasto ? 'expense' : linha.valor < 0 ? 'expense' : 'income';
    const valorAbsoluto = Math.abs(linha.valor);
    const de = addDays(linha.data, -folga);
    const ate = addDays(linha.data, folga);

    const candidatos = existentes.filter(
      (entry) =>
        !gastos.has(entry.id) &&
        entry.kind === kind &&
        entry.amount === valorAbsoluto &&
        entry.date >= de &&
        entry.date <= ate,
    );

    const casaPelaDescricao = candidatos.find((entry) => descricoesCasam(entry.description, linha.descricao));
    const mesmoDia = candidatos.find((entry) => entry.date === linha.data);
    const escolhido = casaPelaDescricao ?? mesmoDia;

    const base = {
      linha,
      kind,
      valorAbsoluto,
      categoriaSugerida: sugerirCategoria(existentes, linha.descricao, kind),
      parcela: lerMarcaDeParcela(linha.descricao),
    };

    if (!escolhido) {
      return { ...base, veredito: 'nova' as const, motivo: 'Não achei nada parecido.' };
    }

    gastos.add(escolhido.id);

    if (casaPelaDescricao) {
      return {
        ...base,
        veredito: 'repetida' as const,
        jaExiste: escolhido,
        motivo:
          escolhido.date === linha.data
            ? 'Já existe com o mesmo valor, no mesmo dia e com a mesma descrição.'
            : 'Já existe com o mesmo valor e a mesma descrição, poucos dias antes ou depois.',
      };
    }

    return {
      ...base,
      veredito: 'talvez' as const,
      jaExiste: escolhido,
      motivo: `Mesmo valor no mesmo dia, com outra descrição ("${escolhido.description}").`,
    };
  });
}

export interface ResumoConciliacao {
  novas: number;
  repetidas: number;
  talvez: number;
}

export function resumirConciliacao(propostas: readonly Proposta[]): ResumoConciliacao {
  return {
    novas: propostas.filter((p) => p.veredito === 'nova').length,
    repetidas: propostas.filter((p) => p.veredito === 'repetida').length,
    talvez: propostas.filter((p) => p.veredito === 'talvez').length,
  };
}
