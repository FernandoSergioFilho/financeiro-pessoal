/**
 * O período que a tela está olhando.
 *
 * Antes só existia "o mês": `EntriesPage` era literalmente a lista de um mês,
 * e não havia como ver um ano inteiro nem tudo de uma vez. Isso escondia
 * lançamentos — uma parcela lançada para daqui a oito meses não aparecia em
 * lugar nenhum — e virava bug de verdade na hora de apagar uma conta, que
 * parecia vazia e mesmo assim tinha movimento.
 *
 * Aqui o período é um dado com granularidade e âncora, e tudo que a tela
 * precisa (intervalo, título, avançar/voltar) sai de funções puras.
 */

import { addDays, addMonths, addMonthsToKey, addYears, formatDate, monthEnd, monthKey, monthStart, today } from './date.ts';

export type Grao = 'dia' | 'mes' | 'trimestre' | 'ano' | 'tudo' | 'livre';

export interface Periodo {
  grao: Grao;
  /** Uma data dentro do período; para `tudo` e `livre` é ignorada. */
  ancora: string;
  /** Só para `livre`. */
  de?: string;
  ate?: string;
}

/** Datas fora das quais nada existe — usadas como "sem limite". */
export const INICIO_DOS_TEMPOS = '0000-01-01';
export const FIM_DOS_TEMPOS = '9999-12-31';

export function periodoDoMes(chave: string): Periodo {
  return { grao: 'mes', ancora: monthStart(chave) };
}

export function periodoAtual(): Periodo {
  return { grao: 'mes', ancora: today() };
}

/** 1-4, a partir do mês da data. */
export function trimestreDe(iso: string): number {
  return Math.floor((Number(iso.slice(5, 7)) - 1) / 3) + 1;
}

function inicioDoTrimestre(iso: string): string {
  const ano = iso.slice(0, 4);
  const primeiroMes = (trimestreDe(iso) - 1) * 3 + 1;
  return `${ano}-${String(primeiroMes).padStart(2, '0')}-01`;
}

export interface Intervalo {
  de: string;
  ate: string;
}

export function intervaloDoPeriodo(periodo: Periodo): Intervalo {
  const { grao, ancora } = periodo;
  switch (grao) {
    case 'dia':
      return { de: ancora, ate: ancora };
    case 'mes':
      return { de: monthStart(monthKey(ancora)), ate: monthEnd(monthKey(ancora)) };
    case 'trimestre': {
      const de = inicioDoTrimestre(ancora);
      return { de, ate: monthEnd(addMonthsToKey(monthKey(de), 2)) };
    }
    case 'ano':
      return { de: `${ancora.slice(0, 4)}-01-01`, ate: `${ancora.slice(0, 4)}-12-31` };
    case 'tudo':
      return { de: INICIO_DOS_TEMPOS, ate: FIM_DOS_TEMPOS };
    case 'livre': {
      // Intervalo pela metade ainda é útil: "de março em diante" é uma
      // pergunta legítima, e travar a tela até o usuário digitar as duas
      // pontas só atrapalha.
      const de = periodo.de || INICIO_DOS_TEMPOS;
      const ate = periodo.ate || FIM_DOS_TEMPOS;
      return de <= ate ? { de, ate } : { de: ate, ate: de };
    }
  }
}

/** Avança (ou volta) um período inteiro. `tudo` e `livre` não se movem. */
export function moverPeriodo(periodo: Periodo, passos: number): Periodo {
  switch (periodo.grao) {
    case 'dia':
      return { ...periodo, ancora: addDays(periodo.ancora, passos) };
    case 'mes':
      return { ...periodo, ancora: monthStart(addMonthsToKey(monthKey(periodo.ancora), passos)) };
    case 'trimestre':
      return { ...periodo, ancora: addMonths(inicioDoTrimestre(periodo.ancora), passos * 3) };
    case 'ano':
      return { ...periodo, ancora: addYears(`${periodo.ancora.slice(0, 4)}-01-01`, passos) };
    default:
      return periodo;
  }
}

export function podeMover(periodo: Periodo): boolean {
  return periodo.grao !== 'tudo' && periodo.grao !== 'livre';
}

/**
 * Troca a granularidade mantendo a âncora, para que "setembro" vire "3º
 * trimestre de 2026" e não pule para outro ano.
 */
export function trocarGrao(periodo: Periodo, grao: Grao): Periodo {
  if (grao === periodo.grao) return periodo;
  if (grao === 'livre') {
    const { de, ate } = intervaloDoPeriodo(periodo);
    const limitado = periodo.grao === 'tudo' ? intervaloDoPeriodo({ grao: 'mes', ancora: today() }) : { de, ate };
    return { grao: 'livre', ancora: periodo.ancora, de: limitado.de, ate: limitado.ate };
  }
  const ancora = periodo.grao === 'tudo' || periodo.grao === 'livre' ? today() : periodo.ancora;
  return { grao, ancora };
}

const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

const NOMES_DE_MES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

/** O título que aparece na barra: "Setembro de 2026", "3º tri de 2026", "Tudo". */
export function rotuloDoPeriodo(periodo: Periodo): string {
  const { grao, ancora } = periodo;
  switch (grao) {
    case 'dia':
      return formatDate(ancora);
    case 'mes': {
      const nome = NOMES_DE_MES[Number(ancora.slice(5, 7)) - 1] ?? '';
      return `${nome.charAt(0).toUpperCase()}${nome.slice(1)} de ${ancora.slice(0, 4)}`;
    }
    case 'trimestre':
      return `${trimestreDe(ancora)}º tri de ${ancora.slice(0, 4)}`;
    case 'ano':
      return ancora.slice(0, 4);
    case 'tudo':
      return 'Tudo';
    case 'livre': {
      const { de, ate } = periodo;
      if (de && ate) return `${formatDate(de)} a ${formatDate(ate)}`;
      if (de) return `A partir de ${formatDate(de)}`;
      if (ate) return `Até ${formatDate(ate)}`;
      return 'Tudo';
    }
  }
}

/** Curto, para caber no celular. */
export function rotuloCurto(periodo: Periodo): string {
  const { grao, ancora } = periodo;
  switch (grao) {
    case 'dia':
      return `${ancora.slice(8, 10)} ${MESES_CURTOS[Number(ancora.slice(5, 7)) - 1]}`;
    case 'mes':
      return `${MESES_CURTOS[Number(ancora.slice(5, 7)) - 1]}/${ancora.slice(2, 4)}`;
    case 'trimestre':
      return `${trimestreDe(ancora)}º tri/${ancora.slice(2, 4)}`;
    default:
      return rotuloDoPeriodo(periodo);
  }
}

/** O período em que hoje cai, na mesma granularidade — o botão "Hoje". */
export function periodoDeHoje(periodo: Periodo): Periodo {
  return podeMover(periodo) ? { ...periodo, ancora: today() } : periodo;
}

export function ehPeriodoAtual(periodo: Periodo): boolean {
  if (!podeMover(periodo)) return true;
  const { de, ate } = intervaloDoPeriodo(periodo);
  const hoje = today();
  return hoje >= de && hoje <= ate;
}

/**
 * O intervalo que a tela realmente vai desenhar.
 *
 * "Tudo" vai de 0000 a 9999, o que não é um eixo de gráfico: aqui ele encolhe
 * para o que existe de verdade — do lançamento mais antigo até o horizonte de
 * previsão. Sem movimento nenhum, cai no mês corrente.
 */
export function intervaloVisivel(periodo: Periodo, datas: readonly string[], hoje = today()): Intervalo {
  const { de, ate } = intervaloDoPeriodo(periodo);
  const fim = limiteDaPrevisao(ate, hoje);
  if (de !== INICIO_DOS_TEMPOS) return { de, ate: fim };

  const dentro = datas.filter((data) => data <= fim);
  const inicio = dentro.length > 0 ? dentro.reduce((a, b) => (a < b ? a : b)) : monthStart(monthKey(hoje));
  return inicio <= fim ? { de: inicio, ate: fim } : { de: fim, ate: fim };
}

/**
 * Até onde faz sentido projetar recorrentes.
 *
 * Sem isto, o período "Tudo" pediria as ocorrências até 9999-12-31 e uma única
 * regra mensal geraria noventa e cinco mil linhas — a tela travaria. Dois anos
 * à frente cobre qualquer parcelamento longo e qualquer conta fixa que alguém
 * queira conferir; o que estiver depois disso é adivinhação, não informação.
 */
export const MESES_DE_PREVISAO = 24;

export function limiteDaPrevisao(ate: string, hoje = today()): string {
  const horizonte = addMonths(hoje, MESES_DE_PREVISAO);
  return ate < horizonte ? ate : horizonte;
}

/**
 * Quantos meses o período cobre — quem desenha gráfico usa isto para decidir
 * entre um ponto por dia e um ponto por mês.
 */
export function mesesDoPeriodo(periodo: Periodo): string[] {
  const { de, ate } = intervaloDoPeriodo(periodo);
  if (de === INICIO_DOS_TEMPOS || ate === FIM_DOS_TEMPOS) return [];
  const chaves: string[] = [];
  for (let chave = monthKey(de); chave <= monthKey(ate); chave = addMonthsToKey(chave, 1)) chaves.push(chave);
  return chaves;
}
