/**
 * O que some junto quando se apaga em lote.
 *
 * Apagar uma conta recorrente e apagar uma compra parcelada parecem a mesma
 * ação e não são: a regra recorrente some e os lançamentos que ela já gerou
 * **ficam** — são histórico, dinheiro que de fato saiu — apenas perdendo o
 * vínculo; já a compra parcelada leva as parcelas junto, porque elas só
 * existem por causa dela.
 *
 * Num lote de trinta itens essa diferença é a fronteira entre limpar o
 * cadastro e apagar meio ano de histórico. Por isso a confirmação não diz
 * "apagar 30 itens": diz quantos lançamentos somem e quantos ficam.
 */

import type { DisplayEntry, FinanceData } from './types.ts';

export interface ImpactoDeExclusao {
  /** Quantos cadastros serão apagados. */
  itens: number;
  /** Lançamentos que somem junto com eles. */
  lancamentosApagados: number;
  /** Lançamentos que ficam, perdendo só o vínculo com o cadastro. */
  lancamentosDesvinculados: number;
}

export function impactoDeApagarCompras(data: FinanceData, ids: ReadonlySet<string>): ImpactoDeExclusao {
  const existentes = data.purchases.filter((compra) => ids.has(compra.id));
  const alvos = new Set(existentes.map((compra) => compra.id));
  return {
    itens: existentes.length,
    lancamentosApagados: data.entries.filter((e) => e.purchaseId && alvos.has(e.purchaseId)).length,
    lancamentosDesvinculados: 0,
  };
}

export function impactoDeApagarRecorrentes(data: FinanceData, ids: ReadonlySet<string>): ImpactoDeExclusao {
  const existentes = data.recurring.filter((regra) => ids.has(regra.id));
  const alvos = new Set(existentes.map((regra) => regra.id));
  return {
    itens: existentes.length,
    lancamentosApagados: 0,
    lancamentosDesvinculados: data.entries.filter((e) => e.recurringId && alvos.has(e.recurringId)).length,
  };
}

/** A frase da confirmação, montada a partir do impacto. */
export function descreverImpacto(impacto: ImpactoDeExclusao, um: string, varios: string): string {
  const { itens, lancamentosApagados, lancamentosDesvinculados } = impacto;
  const cabeca = `${itens} ${itens === 1 ? um : varios}`;

  if (lancamentosApagados > 0) {
    const n = lancamentosApagados;
    return `${cabeca} e ${n} ${n === 1 ? 'lançamento' : 'lançamentos'} — as parcelas somem junto, inclusive as já pagas.`;
  }
  if (lancamentosDesvinculados > 0) {
    const n = lancamentosDesvinculados;
    return (
      `${cabeca}. ${n} ${n === 1 ? 'lançamento já gerado continua' : 'lançamentos já gerados continuam'} no histórico, ` +
      'só sem o vínculo com a regra.'
    );
  }
  return `${cabeca}. Nenhum lançamento é afetado.`;
}


/* ------------------------------------------------- lançamentos em lote */

export interface ImpactoEmLancamentos {
  /** Lançamentos gravados que serão apagados. */
  gravados: number;
  /**
   * Ocorrências previstas de contas fixas. Elas não existem como registro —
   * são geradas pela regra a cada mês —, então não há o que apagar: o que
   * acontece é a ocorrência daquele mês ser dispensada, e a regra continuar
   * valendo nos outros. Chamar isso de "apagar" sem explicar faria alguém
   * achar que acabou de matar a conta de luz inteira.
   */
  previstos: number;
  /**
   * Compras parceladas que perdem **todas** as parcelas de uma vez e somem
   * junto — o mesmo que acontece ao apagar a última parcela à mão.
   */
  comprasEsvaziadas: number;
}

function ehPrevisao(entrada: DisplayEntry): boolean {
  return 'projected' in entrada && entrada.projected === true;
}

export function impactoDeApagarLancamentos(
  data: FinanceData,
  selecionados: readonly DisplayEntry[],
): ImpactoEmLancamentos {
  const gravados = selecionados.filter((entrada) => !ehPrevisao(entrada));
  const idsGravados = new Set(gravados.map((entrada) => entrada.id));

  const compras = new Set(
    gravados.map((entrada) => entrada.purchaseId).filter((id): id is string => Boolean(id)),
  );
  let comprasEsvaziadas = 0;
  for (const compra of compras) {
    const todas = data.entries.filter((entrada) => entrada.purchaseId === compra);
    if (todas.length > 0 && todas.every((entrada) => idsGravados.has(entrada.id))) comprasEsvaziadas += 1;
  }

  return {
    gravados: gravados.length,
    previstos: selecionados.length - gravados.length,
    comprasEsvaziadas,
  };
}

/** A frase da confirmação de lançamentos, que distingue apagar de dispensar. */
export function descreverImpactoEmLancamentos(impacto: ImpactoEmLancamentos): string {
  const { gravados, previstos, comprasEsvaziadas } = impacto;
  const partes: string[] = [];

  if (gravados > 0) {
    partes.push(`${gravados} ${gravados === 1 ? 'lançamento será apagado' : 'lançamentos serão apagados'}`);
  }
  if (previstos > 0) {
    partes.push(
      `${previstos} ${previstos === 1 ? 'ocorrência prevista de conta fixa será dispensada' : 'ocorrências previstas de contas fixas serão dispensadas'} ` +
        `${previstos === 1 ? 'naquele mês' : 'naqueles meses'} — a regra continua valendo nos outros`,
    );
  }
  if (comprasEsvaziadas > 0) {
    partes.push(
      `${comprasEsvaziadas} ${comprasEsvaziadas === 1 ? 'compra parcelada fica' : 'compras parceladas ficam'} sem nenhuma parcela e ` +
        `${comprasEsvaziadas === 1 ? 'some' : 'somem'} junto`,
    );
  }

  if (partes.length === 0) return 'Nada foi selecionado.';
  const frase = partes.length === 1 ? partes[0]! : `${partes.slice(0, -1).join('; ')}; e ${partes.at(-1)}`;
  return `${frase[0]!.toUpperCase()}${frase.slice(1)}.`;
}
