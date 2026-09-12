/**
 * A leitura dos números que um analista financeiro levaria à diretoria.
 *
 * **Por que a conta é feita aqui e não por um modelo de linguagem.** O app é
 * uma página estática publicada no GitHub Pages: não existe servidor onde
 * guardar uma chave de API. Pôr a chave no código do navegador seria entregá-la
 * a qualquer visitante — diferente da chave `anon` do Supabase, que é pública
 * por desenho e protegida pelas políticas do banco, uma chave de IA é um
 * segredo de verdade, com custo por uso. Então a análise é calculada, e não
 * gerada: sai na hora, funciona sem internet, não custa nada, não manda os
 * gastos de ninguém para lugar nenhum, e dá o mesmo resultado toda vez — o que
 * para número de dinheiro é qualidade, não limitação.
 *
 * O que ela faz é o que um relatório de fechamento faz: compara o período com
 * a própria história, separa o que é estrutura (custo fixo, parcelas já
 * comprometidas) do que é escolha do mês, aponta o que fugiu do normal e diz
 * o tamanho de cada coisa. Cada achado carrega o número que o sustenta — sem
 * número é opinião, e opinião não ajuda a decidir.
 */

import { addMonthsToKey, monthEnd, monthKey, monthStart, today } from './date.ts';
import { comDataDeCaixa, quandoSai } from './faturas.ts';
import { formatMoney } from './money.ts';
import { periodTotals, totalsByCategory } from './summary.ts';
import type { Category, DisplayEntry, FinanceData, RecurringRule } from './types.ts';

/** Meses fechados usados como base de comparação. */
export const MESES_DE_BASE = 6;

/** Quanto uma categoria precisa fugir da própria média para virar achado. */
export const DESVIO_RELEVANTE = 0.35;

/** A partir de quanto o custo fixo sobre a renda vira alerta. */
export const COMPROMETIMENTO_ALTO = 0.6;

export type Tom = 'bom' | 'atencao' | 'ruim' | 'neutro';

export interface Indicador {
  rotulo: string;
  valor: string;
  detalhe: string;
  tom: Tom;
}

export interface Achado {
  /** Chave estável, para o React e para os testes não dependerem do texto. */
  id: string;
  titulo: string;
  texto: string;
  tom: Tom;
  /** Maior primeiro: é a ordem em que a pessoa deve ler. */
  peso: number;
}

export interface Analise {
  indicadores: Indicador[];
  achados: Achado[];
  /** Quantos meses fechados existem — abaixo de 3, quase nada dá para afirmar. */
  mesesDeHistorico: number;
}

/* -------------------------------------------------------------- auxiliares */

/** Quanto a regra custa por mês, em média, para poder somar com as outras. */
export function custoMensalDaRegra(regra: RecurringRule): number {
  const porPeriodo = regra.amount / Math.max(regra.interval, 1);
  if (regra.frequency === 'weekly') return Math.round((porPeriodo * 52) / 12);
  if (regra.frequency === 'yearly') return Math.round(porPeriodo / 12);
  return porPeriodo;
}

function pct(valor: number): string {
  return `${Math.round(valor * 100)}%`;
}

function mesesFechados(hoje: string, quantos: number): string[] {
  const atual = monthKey(hoje);
  return Array.from({ length: quantos }, (_, i) => addMonthsToKey(atual, -(quantos - i)));
}

interface Janela {
  chave: string;
  entries: DisplayEntry[];
}

/* ------------------------------------------------------------------ análise */

export function analisar(
  data: FinanceData,
  entradasDoPeriodo: readonly DisplayEntry[],
  categorias: readonly Category[],
  hoje: string = today(),
): Analise {
  const doPeriodo = periodTotals(entradasDoPeriodo);

  // A base de comparação são meses **fechados**: comparar o mês corrente pela
  // metade com meses inteiros diria que tudo caiu, todo dia primeiro.
  // Pela data de caixa, e não pela da compra: o mês de comparação tem de ser o
  // mesmo que a tela mostra, senão a análise diz que Mercado subiu num mês em
  // que a lista não mostra nada.
  const comCaixa = comDataDeCaixa(data.accounts, data.entries);
  const janelas: Janela[] = mesesFechados(hoje, MESES_DE_BASE)
    .map((chave) => ({
      chave,
      entries: comCaixa.filter((e) => {
        const sai = quandoSai(e);
        return sai >= monthStart(chave) && sai <= monthEnd(chave);
      }),
    }))
    .filter((janela) => janela.entries.length > 0);

  const mesesDeHistorico = janelas.length;
  const totaisPorMes = janelas.map((janela) => periodTotals(janela.entries));

  const media = (valores: number[]) =>
    valores.length === 0 ? null : Math.round(valores.reduce((a, b) => a + b, 0) / valores.length);

  const despesaMedia = media(totaisPorMes.map((t) => t.expense));
  const receitaMedia = media(totaisPorMes.map((t) => t.income));

  const indicadores: Indicador[] = [];
  const achados: Achado[] = [];

  /* 1. Resultado e margem — a primeira linha de qualquer fechamento. */
  const taxa = doPeriodo.income > 0 ? doPeriodo.net / doPeriodo.income : null;
  indicadores.push({
    rotulo: 'Resultado',
    valor: formatMoney(doPeriodo.net),
    detalhe:
      taxa === null
        ? 'Sem entradas no período'
        : `${pct(taxa)} do que entrou`,
    tom: doPeriodo.net < 0 ? 'ruim' : taxa !== null && taxa >= 0.2 ? 'bom' : 'neutro',
  });

  if (doPeriodo.net < 0) {
    achados.push({
      id: 'resultado-negativo',
      titulo: 'O período fecha no vermelho',
      texto:
        `Saiu ${formatMoney(doPeriodo.expense)} contra ${formatMoney(doPeriodo.income)} que entrou — ` +
        `${formatMoney(-doPeriodo.net)} a mais do que veio.`,
      tom: 'ruim',
      peso: 100,
    });
  } else if (taxa !== null && taxa < 0.1 && doPeriodo.income > 0) {
    achados.push({
      id: 'margem-apertada',
      titulo: 'Sobra pouco do que entra',
      texto:
        `Sobraram ${formatMoney(doPeriodo.net)} de ${formatMoney(doPeriodo.income)} — ${pct(taxa)}. ` +
        'Abaixo de 10% qualquer imprevisto vira dívida.',
      tom: 'atencao',
      peso: 80,
    });
  } else if (taxa !== null && taxa >= 0.2) {
    achados.push({
      id: 'margem-boa',
      titulo: 'A margem está saudável',
      texto: `Sobraram ${formatMoney(doPeriodo.net)}, ${pct(taxa)} do que entrou.`,
      tom: 'bom',
      peso: 20,
    });
  }

  /* 2. O período contra a própria média. */
  if (despesaMedia !== null && despesaMedia > 0) {
    const variacao = (doPeriodo.expense - despesaMedia) / despesaMedia;
    indicadores.push({
      rotulo: 'Gasto vs. média',
      valor: `${variacao >= 0 ? '+' : ''}${pct(variacao)}`,
      detalhe: `Média de ${formatMoney(despesaMedia)} nos ${mesesDeHistorico} meses fechados`,
      tom: variacao > 0.15 ? 'ruim' : variacao < -0.1 ? 'bom' : 'neutro',
    });

    if (Math.abs(variacao) >= 0.15 && mesesDeHistorico >= 3) {
      const subiu = variacao > 0;
      achados.push({
        id: 'variacao-do-gasto',
        titulo: subiu ? 'Gastou acima do seu normal' : 'Gastou abaixo do seu normal',
        texto:
          `${formatMoney(doPeriodo.expense)} contra uma média de ${formatMoney(despesaMedia)} — ` +
          `${subiu ? formatMoney(doPeriodo.expense - despesaMedia) + ' a mais' : formatMoney(despesaMedia - doPeriodo.expense) + ' a menos'}.`,
        tom: subiu ? 'atencao' : 'bom',
        peso: subiu ? 70 : 25,
      });
    }
  }

  /* 3. Custo fixo sobre a renda — a estrutura, o que não se decide no mês. */
  const fixoMensal = data.recurring
    .filter((regra) => regra.active && regra.kind === 'expense')
    .reduce((total, regra) => total + custoMensalDaRegra(regra), 0);

  const rendaDeReferencia = receitaMedia && receitaMedia > 0 ? receitaMedia : doPeriodo.income;
  const comprometimento = rendaDeReferencia > 0 ? fixoMensal / rendaDeReferencia : null;

  if (fixoMensal > 0) {
    indicadores.push({
      rotulo: 'Custo fixo por mês',
      valor: formatMoney(fixoMensal),
      detalhe: comprometimento === null ? 'Das contas recorrentes' : `${pct(comprometimento)} da renda`,
      tom: comprometimento !== null && comprometimento >= COMPROMETIMENTO_ALTO ? 'ruim' : 'neutro',
    });

    if (comprometimento !== null && comprometimento >= COMPROMETIMENTO_ALTO) {
      achados.push({
        id: 'fixo-alto',
        titulo: 'O custo fixo come a maior parte da renda',
        texto:
          `${formatMoney(fixoMensal)} por mês em contas recorrentes, ${pct(comprometimento)} do que entra. ` +
          'Sobra pouca margem de manobra: cortar gasto variável rende pouco quando o fixo é este.',
        tom: 'ruim',
        peso: 90,
      });
    }
  }

  /* 4. Parcelas já comprometidas — dinheiro do futuro que já foi gasto. */
  const parcelasFuturas = data.entries.filter((e) => e.purchaseId && e.date > hoje);
  const totalParcelas = parcelasFuturas.reduce((total, e) => total + e.amount, 0);
  if (totalParcelas > 0) {
    const ultimaData = parcelasFuturas.reduce((maior, e) => (e.date > maior ? e.date : maior), hoje);
    const mesesRestantes = Math.max(
      1,
      Math.round((Date.parse(`${ultimaData}T00:00:00Z`) - Date.parse(`${hoje}T00:00:00Z`)) / 2_592_000_000),
    );
    indicadores.push({
      rotulo: 'Parcelas a vencer',
      valor: formatMoney(totalParcelas),
      detalhe: `Espalhadas por ${mesesRestantes} ${mesesRestantes === 1 ? 'mês' : 'meses'}`,
      tom: despesaMedia !== null && totalParcelas > despesaMedia * 2 ? 'atencao' : 'neutro',
    });

    if (despesaMedia !== null && despesaMedia > 0 && totalParcelas > despesaMedia * 2) {
      achados.push({
        id: 'parcelas-pesadas',
        titulo: 'As parcelas já comprometem meses à frente',
        texto:
          `${formatMoney(totalParcelas)} de parcelas ainda a vencer — mais de dois meses inteiros de gasto. ` +
          'Cada compra parcelada nova entra numa fila que já está cheia.',
        tom: 'atencao',
        peso: 75,
      });
    }
  }

  /* 5. Concentração: onde o dinheiro realmente vai. */
  const porCategoria = totalsByCategory(entradasDoPeriodo, categorias, 'expense');
  if (porCategoria.length >= 3 && doPeriodo.expense > 0) {
    const tresMaiores = porCategoria.slice(0, 3);
    const fatia = tresMaiores.reduce((t, linha) => t + linha.amount, 0) / doPeriodo.expense;
    const nomes = tresMaiores.map((linha) => linha.category?.name ?? 'Sem categoria');
    achados.push({
      id: 'concentracao',
      titulo: 'Onde o dinheiro realmente vai',
      texto:
        `${nomes.join(', ')} respondem por ${pct(fatia)} de tudo que saiu. ` +
        'É onde qualquer corte tem efeito de verdade; o resto é ruído.',
      tom: 'neutro',
      peso: 60,
    });
  }

  /* 6. Categorias que fugiram do próprio normal. */
  if (mesesDeHistorico >= 3) {
    const mediaPorCategoria = new Map<string, number[]>();
    for (const janela of janelas) {
      const totais = totalsByCategory(janela.entries, categorias, 'expense');
      for (const linha of totais) {
        const chave = linha.category?.id ?? 'sem-categoria';
        mediaPorCategoria.set(chave, [...(mediaPorCategoria.get(chave) ?? []), linha.amount]);
      }
    }

    const desvios = porCategoria
      .map((linha) => {
        const chave = linha.category?.id ?? 'sem-categoria';
        const historico = mediaPorCategoria.get(chave) ?? [];
        if (historico.length < 3) return null;
        const base = Math.round(historico.reduce((a, b) => a + b, 0) / historico.length);
        if (base <= 0) return null;
        const desvio = (linha.amount - base) / base;
        return Math.abs(desvio) >= DESVIO_RELEVANTE
          ? { nome: linha.category?.name ?? 'Sem categoria', atual: linha.amount, base, desvio }
          : null;
      })
      .filter((d): d is NonNullable<typeof d> => d !== null)
      .sort((a, b) => Math.abs(b.atual - b.base) - Math.abs(a.atual - a.base));

    for (const [posicao, desvio] of desvios.slice(0, 3).entries()) {
      const subiu = desvio.desvio > 0;
      achados.push({
        id: `desvio-${desvio.nome}`,
        titulo: `${desvio.nome} ${subiu ? 'saiu do padrão para cima' : 'caiu bem abaixo do padrão'}`,
        texto:
          `${formatMoney(desvio.atual)} neste período contra ${formatMoney(desvio.base)} de costume — ` +
          `${subiu ? '+' : ''}${pct(desvio.desvio)}.`,
        tom: subiu ? 'atencao' : 'bom',
        peso: (subiu ? 65 : 30) - posicao,
      });
    }
  }

  /* 7. Quantos meses fecharam no vermelho — o histórico de risco. */
  const negativos = totaisPorMes.filter((t) => t.net < 0).length;
  if (mesesDeHistorico >= 3) {
    indicadores.push({
      rotulo: 'Meses no vermelho',
      valor: `${negativos} de ${mesesDeHistorico}`,
      detalhe: 'Nos meses fechados que já têm lançamento',
      tom: negativos === 0 ? 'bom' : negativos >= mesesDeHistorico / 2 ? 'ruim' : 'atencao',
    });

    if (negativos >= mesesDeHistorico / 2) {
      achados.push({
        id: 'padrao-negativo',
        titulo: 'Fechar no vermelho virou padrão, não exceção',
        texto:
          `${negativos} dos últimos ${mesesDeHistorico} meses fecharam gastando mais do que entrou. ` +
          'Não é um mês ruim: é o desenho atual das contas.',
        tom: 'ruim',
        peso: 95,
      });
    }
  }

  /* 8. Histórico curto demais para afirmar o que quer que seja. */
  if (mesesDeHistorico < 3) {
    achados.push({
      id: 'pouco-historico',
      titulo: 'Ainda falta histórico para comparar',
      texto:
        `Com ${mesesDeHistorico} ${mesesDeHistorico === 1 ? 'mês fechado' : 'meses fechados'}, dá para ver o ` +
        'que está acontecendo agora, mas não o que é normal para você. A partir de três meses a análise ' +
        'passa a apontar o que fugiu do padrão.',
      tom: 'neutro',
      peso: 10,
    });
  }

  return {
    indicadores,
    achados: achados.sort((a, b) => b.peso - a.peso),
    mesesDeHistorico,
  };
}
