/**
 * A estatística que sustenta as conclusões.
 *
 * Fica separada de quem tira conclusões (`oportunidades.ts`, `analise.ts`) de
 * propósito: aqui não há opinião nenhuma, só número. É o que torna as duas
 * testáveis — uma contra casos aritméticos, a outra contra casos de decisão.
 *
 * **Mediana, e não média.** Um mês com a compra do notebook levanta a média de
 * "Educação" e faz o app dizer que você gasta R$ 600 por mês numa categoria em
 * que gasta R$ 90. A mediana ignora o extremo, que é exatamente o que se quer
 * de "quanto isto costuma custar". A média continua disponível, porque para
 * projetar o total do ano é ela que fecha a conta.
 *
 * **Tendência por mínimos quadrados.** Comparar o último mês com o anterior é
 * ler ruído: todo mês tem um a mais e um a menos. A reta que melhor atravessa
 * a série responde a pergunta certa — "isto está subindo?" — e o coeficiente
 * dela é em reais por mês, que é uma unidade que dá para agir sobre.
 */

/** Menos do que isto não é série: é um punhado de pontos. */
export const MINIMO_PARA_TENDENCIA = 4;

export function media(valores: readonly number[]): number | null {
  if (valores.length === 0) return null;
  return Math.round(valores.reduce((a, b) => a + b, 0) / valores.length);
}

/** O valor do meio. Com quantidade par, a média dos dois centrais. */
export function mediana(valores: readonly number[]): number | null {
  if (valores.length === 0) return null;
  const ordenados = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(ordenados.length / 2);
  return ordenados.length % 2 === 1
    ? ordenados[meio]!
    : Math.round((ordenados[meio - 1]! + ordenados[meio]!) / 2);
}

export interface Tendencia {
  /** Reais por mês. Positivo é subindo. */
  porMes: number;
  /** Onde a reta cruza o mês zero — serve para projetar. */
  base: number;
  /**
   * Quanto da variação a reta explica, de 0 a 1.
   *
   * Abaixo de `CONFIANCA_MINIMA` a série é barulho demais para afirmar
   * qualquer direção, e quem chama deve dizer "varia muito" em vez de
   * "está subindo".
   */
  confianca: number;
}

/** Abaixo disto, a reta não descreve a série: é chute com aparência de conta. */
export const CONFIANCA_MINIMA = 0.5;

/**
 * A reta que melhor atravessa a série, por mínimos quadrados.
 *
 * `null` com menos de `MINIMO_PARA_TENDENCIA` pontos: com três meses qualquer
 * reta passa perfeitamente por qualquer coisa, e a confiança sairia alta
 * dizendo nada.
 */
export function tendencia(valores: readonly number[]): Tendencia | null {
  const n = valores.length;
  if (n < MINIMO_PARA_TENDENCIA) return null;

  const mediaX = (n - 1) / 2;
  const mediaY = valores.reduce((a, b) => a + b, 0) / n;

  let cima = 0;
  let baixo = 0;
  for (let i = 0; i < n; i += 1) {
    cima += (i - mediaX) * (valores[i]! - mediaY);
    baixo += (i - mediaX) ** 2;
  }
  if (baixo === 0) return null;

  const inclinacao = cima / baixo;
  const base = mediaY - inclinacao * mediaX;

  // R²: quanto da variação a reta explica.
  let residuo = 0;
  let total = 0;
  for (let i = 0; i < n; i += 1) {
    residuo += (valores[i]! - (base + inclinacao * i)) ** 2;
    total += (valores[i]! - mediaY) ** 2;
  }
  const confianca = total === 0 ? 1 : Math.max(0, 1 - residuo / total);

  return { porMes: Math.round(inclinacao), base: Math.round(base), confianca };
}

/**
 * O quanto a série balança, como fração da própria média.
 *
 * Separa o gasto que dá para prever do que não dá: aluguel tem variação zero,
 * "Lazer" tem 80%. É a diferença entre uma conta que se pode planejar e uma
 * que só se pode acompanhar — e muda o conselho que faz sentido dar.
 */
export function variacao(valores: readonly number[]): number | null {
  if (valores.length < 2) return null;
  const m = valores.reduce((a, b) => a + b, 0) / valores.length;
  if (m === 0) return null;
  const desvio = Math.sqrt(
    valores.reduce((soma, v) => soma + (v - m) ** 2, 0) / valores.length,
  );
  return desvio / Math.abs(m);
}

/**
 * Quanto do total está nos `quantos` maiores.
 *
 * Responde "meu gasto está concentrado ou espalhado?", que decide onde vale a
 * pena mexer: com 70% em três categorias, cortar as pequenas não muda nada.
 */
export function concentracao(valores: readonly number[], quantos = 3): number | null {
  const total = valores.reduce((a, b) => a + Math.abs(b), 0);
  if (total === 0) return null;
  const maiores = [...valores].map(Math.abs).sort((a, b) => b - a).slice(0, quantos);
  return maiores.reduce((a, b) => a + b, 0) / total;
}

/**
 * Projeta o próximo valor da série.
 *
 * Usa a reta quando ela explica a série, e a mediana quando não explica —
 * porque projetar com uma reta que não descreve nada é inventar com aparência
 * de método.
 */
export function projetar(valores: readonly number[]): number | null {
  const t = tendencia(valores);
  if (t && t.confianca >= CONFIANCA_MINIMA) {
    return Math.max(0, Math.round(t.base + t.porMes * valores.length));
  }
  return mediana(valores);
}
