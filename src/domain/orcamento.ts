/**
 * "Quanto ainda posso gastar?" — a pergunta que o painel não respondia.
 *
 * Os cartões mostravam entradas, saídas e sobra. São três números corretos e
 * nenhum deles é a decisão: para saber se dá para pedir a pizza, é preciso
 * subtrair do que entrou tudo o que já saiu **e** tudo o que ainda vai sair
 * este mês por conta de contas fixas, parcelas e boletos marcados. O que
 * sobra dessa conta é o dinheiro que ainda é escolha.
 *
 * O segundo número é o mesmo dividido pelos dias que faltam, porque "sobram
 * R$ 1.200" e "sobram R$ 60 por dia até o dia 30" pedem comportamentos
 * diferentes de quem lê.
 */

import { addDays } from './date.ts';
import type { DisplayEntry } from './types.ts';
import { contaNoFluxo } from './investimentos.ts';

export interface Orcamento {
  /** Tudo que entra no período, confirmado ou previsto. */
  entradas: number;
  /** Saídas já marcadas como pagas. */
  gastoRealizado: number;
  /** Saídas do período que ainda não foram pagas: contas, parcelas, fixas. */
  comprometido: number;
  /** Entradas menos o que já saiu e o que ainda vai sair. É o que é escolha. */
  disponivel: number;
  /** Quantos dias faltam até o fim do período, contando hoje. Zero se já acabou. */
  diasRestantes: number;
  /** `disponivel` dividido pelos dias que faltam. Nulo quando o período acabou. */
  porDia: number | null;
  /** Hoje está dentro do período? Fora dele, "quanto posso gastar" não faz sentido. */
  emAndamento: boolean;

  /* ---- ritmo: estou gastando mais rápido do que o mês aguenta? ---- */

  /** Quanto do período já passou, de 0 a 1. */
  fracaoDecorrida: number;
  /** O que teria sido gasto a esta altura, se o gasto fosse parelho no período. */
  gastoEsperado: number;
  /**
   * Quanto o gasto real foge do esperado, em fração. `+0.2` é 20% acima do
   * ritmo. Nulo quando ainda não há período decorrido para comparar.
   */
  desvioDoRitmo: number | null;
}

function diasEntre(de: string, ate: string): number {
  if (ate < de) return 0;
  let dias = 1;
  for (let dia = de; dia < ate; dia = addDays(dia, 1)) {
    dias += 1;
    // Uma janela absurda (o período "Tudo") não precisa ser contada dia a dia
    // para o resultado ser usado: acima disso a divisão por dia não informa.
    if (dias > 3660) return dias;
  }
  return dias;
}

export function calcularOrcamento(
  entradasDoPeriodo: readonly DisplayEntry[],
  janela: { de: string; ate: string },
  hoje: string,
): Orcamento {
  let entradas = 0;
  let gastoRealizado = 0;
  let comprometido = 0;

  for (const entrada of entradasDoPeriodo) {
    // Transferência entre contas próprias não é receita nem despesa: sai de um
    // lado e entra no outro, e contá-la inflaria os dois lados da conta.
    // E o rendimento que ficou dentro do investimento: ele não é dinheiro que
    // dá para gastar este mês, e contá-lo aqui diria que sobrou mais.
    if (entrada.kind === 'transfer' || !contaNoFluxo(entrada)) continue;
    if (entrada.kind === 'income') entradas += entrada.amount;
    else if (entrada.status === 'settled') gastoRealizado += entrada.amount;
    else comprometido += entrada.amount;
  }

  const disponivel = entradas - gastoRealizado - comprometido;
  const emAndamento = hoje >= janela.de && hoje <= janela.ate;
  const diasRestantes = emAndamento ? diasEntre(hoje, janela.ate) : 0;

  const totalDeDias = diasEntre(janela.de, janela.ate);
  const decorridos = hoje > janela.ate ? totalDeDias : emAndamento ? diasEntre(janela.de, hoje) : 0;
  const fracaoDecorrida = totalDeDias > 0 ? decorridos / totalDeDias : 0;

  // O esperado é medido contra o gasto **total** do período — o que já saiu
  // mais o que ainda vai sair. Comparar com o realizado sozinho diria que
  // todo mês começa adiantado.
  const gastoTotal = gastoRealizado + comprometido;
  const gastoEsperado = Math.round(gastoTotal * fracaoDecorrida);

  return {
    entradas,
    gastoRealizado,
    comprometido,
    disponivel,
    diasRestantes,
    porDia: diasRestantes > 0 ? Math.round(disponivel / diasRestantes) : null,
    emAndamento,
    fracaoDecorrida,
    gastoEsperado,
    desvioDoRitmo: gastoEsperado > 0 ? (gastoRealizado - gastoEsperado) / gastoEsperado : null,
  };
}
