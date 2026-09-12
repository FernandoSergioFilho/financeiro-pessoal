/**
 * O texto para levar os seus números a uma IA de fora.
 *
 * **Por que isto existe ao lado da análise calculada.** `domain/analise.ts`
 * explica por que a leitura automática é conta e não modelo de linguagem: o app
 * é uma página estática, não há servidor onde guardar uma chave de API, e pôr
 * uma chave paga no navegador seria entregá-la a qualquer visitante. Isso
 * resolve o "o que aconteceu" — que é o que um fechamento responde —, mas não
 * o "e agora, o que eu faço", que é conversa: depende do que você quer, do que
 * está disposto a cortar, do que vem pela frente.
 *
 * Então a saída honesta é esta: o app monta o texto, você leva. Cola no
 * ChatGPT, no Claude, no que preferir. Nada sai daqui sozinho — quem manda é
 * você, no momento em que colar, e é por isso que o aviso de privacidade fica
 * na tela e não numa nota de rodapé.
 *
 * **O que vai no texto, e o que não vai.** Vão os agregados: totais do período,
 * a série dos meses fechados, saídas por categoria, o custo fixo, o que já está
 * comprometido em parcelas, o saldo por conta e os achados que a análise daqui
 * já apontou. **Não vai a descrição de nenhum lançamento** — "Farmácia São
 * João", "Dr. Fulano", o nome de quem te mandou um Pix. É nas descrições que
 * mora o que é íntimo, e nenhuma pergunta sobre orçamento precisa delas: para
 * saber que Saúde subiu 40%, o total de Saúde basta.
 */

import { analisar, custoMensalDaRegra } from './analise.ts';
import { addMonthsToKey, monthEnd, monthKey, monthStart, today } from './date.ts';
import { comDataDeCaixa, quandoSai } from './faturas.ts';
import { formatMoney } from './money.ts';
import { rotuloDoPeriodo, type Periodo } from './period.ts';
import { periodTotals, totalsByCategory } from './summary.ts';
import type { Account, Category, DisplayEntry, FinanceData } from './types.ts';

/** Quantos meses fechados entram na série histórica. */
export const MESES_DA_SERIE = 12;

/** Até onde olhar as parcelas já compradas. */
export const MESES_DE_PARCELAS = 12;

export type ChaveDePrompt = 'diagnostico' | 'corte' | 'dividas' | 'compra' | 'fechamento';

export interface ModeloDePrompt {
  chave: ChaveDePrompt;
  /** O nome do botão. */
  titulo: string;
  /** O que essa pergunta entrega, para a pessoa escolher sem tentar todas. */
  descricao: string;
  /** O pedido em si, que vira o topo do texto. */
  pedido: string;
  /**
   * O que a pessoa precisa completar antes de colar. Quando existe, a tela
   * avisa — um prompt com `[preencha aqui]` esquecido no meio rende resposta
   * inventada, que é pior do que nenhuma.
   */
  aCompletar?: string;
}

/*
 * Cinco perguntas, e não uma caixa de texto livre. Uma caixa livre parece mais
 * poderosa e entrega menos: quem sabe o que perguntar não precisa do app, e
 * quem não sabe fica olhando para o cursor. Estas são as cinco que alguém com
 * as contas na mão realmente faz.
 */
export const MODELOS: ModeloDePrompt[] = [
  {
    chave: 'diagnostico',
    titulo: 'O que está acontecendo com meu dinheiro',
    descricao: 'Uma leitura geral: para onde o dinheiro está indo e o que mudou.',
    pedido:
      'Leia estes números e me diga, em ordem de importância, o que está acontecendo com o meu '
      + 'dinheiro. Aponte o que mudou em relação aos meses anteriores, o que é estrutura (custo '
      + 'fixo e parcelas já assumidas) e o que é escolha do mês. Diga o tamanho de cada coisa em '
      + 'reais, não só em porcentagem.',
  },
  {
    chave: 'corte',
    titulo: 'Onde dá para cortar',
    descricao: 'Um plano de corte com valores, do mais fácil para o mais difícil.',
    pedido:
      'Monte um plano para eu gastar menos por mês. Liste os cortes possíveis do mais fácil para '
      + 'o mais doloroso, com quanto cada um economiza por mês em reais e o que eu perco em troca. '
      + 'Separe o que dá para cortar já do que só muda no vencimento do contrato. Some quanto sobra '
      + 'no fim se eu fizer tudo.',
  },
  {
    chave: 'dividas',
    titulo: 'Como sair das parcelas',
    descricao: 'A ordem de quitação e quando o mês volta a respirar.',
    pedido:
      'Olhe o que já está comprometido em parcelas e contas fixas e me diga em que ordem quitar, '
      + 'e por quê. Diga em que mês o comprometimento cai de verdade, quanto eu preciso segurar '
      + 'por mês até lá, e se faz mais sentido antecipar parcelas ou guardar o dinheiro.',
  },
  {
    chave: 'compra',
    titulo: 'Posso fazer esta compra?',
    descricao: 'A conta de caber ou não caber, com o efeito nos próximos meses.',
    pedido:
      'Quero fazer esta compra: [DESCREVA A COMPRA, O VALOR TOTAL E EM QUANTAS VEZES]. Diga se ela '
      + 'cabe, considerando o que já está comprometido nos próximos meses. Mostre como ficaria o mês '
      + 'com ela dentro, à vista e parcelada, e o que eu teria que deixar de fazer para que coubesse.',
    aCompletar: 'Troque [DESCREVA A COMPRA...] pelo que você quer comprar, o valor e em quantas vezes.',
  },
  {
    chave: 'fechamento',
    titulo: 'Relatório de fechamento',
    descricao: 'O texto formal, como um analista levaria à diretoria.',
    pedido:
      'Escreva o relatório de fechamento deste período como um analista financeiro levaria à '
      + 'diretoria: comece pela conclusão em três linhas, depois os números que a sustentam, '
      + 'depois os riscos, depois o que recomenda fazer. Sem rodeio e sem elogio — cada afirmação '
      + 'com o número do lado.',
  },
];

export function modeloPorChave(chave: ChaveDePrompt): ModeloDePrompt {
  const achado = MODELOS.find((m) => m.chave === chave);
  // Chave inválida só chega aqui por engano de programação; devolver o primeiro
  // é melhor do que deixar a tela cair na mão de quem só queria um texto.
  return achado ?? MODELOS[0]!;
}

/* ------------------------------------------------------------------- dados */

export interface DadosDoPrompt {
  hoje: string;
  periodo: string;
  totais: { entradas: number; saidas: number; resultado: number };
  serie: { mes: string; entradas: number; saidas: number }[];
  categorias: { nome: string; valor: number; fatia: number }[];
  fixas: { nome: string; porMes: number }[];
  parcelas: { mes: string; valor: number }[];
  contas: { nome: string; saldo: number }[];
  achados: string[];
  /** Quantos meses fechados existem. Abaixo de 3, quase nada dá para afirmar. */
  mesesDeHistorico: number;
}

/** Um mês como "set/2026", que é como se lê, e não "2026-09". */
export function mesLegivel(chave: string): string {
  const NOMES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const [ano, mes] = chave.split('-');
  const indice = Number(mes) - 1;
  return NOMES[indice] ? `${NOMES[indice]}/${ano}` : chave;
}

export function reunirDados(
  data: FinanceData,
  entradasDoPeriodo: readonly DisplayEntry[],
  categorias: readonly Category[],
  contas: readonly Account[],
  periodo: Periodo,
  hoje: string = today(),
): DadosDoPrompt {
  const doPeriodo = periodTotals(entradasDoPeriodo);
  const atual = monthKey(hoje);

  // Meses **fechados**: incluir o mês corrente pela metade na série faria a IA
  // ler queda de gasto todo dia primeiro.
  // Pela data de caixa: o mês do texto tem de ser o mesmo mês da tela.
  const comCaixa = comDataDeCaixa(data.accounts, data.entries);
  const serie = Array.from({ length: MESES_DA_SERIE }, (_, i) =>
    addMonthsToKey(atual, -(MESES_DA_SERIE - i)),
  )
    .map((mes) => {
      const doMes = comCaixa.filter((e) => {
        const sai = quandoSai(e);
        return sai >= monthStart(mes) && sai <= monthEnd(mes);
      });
      const t = periodTotals(doMes as DisplayEntry[]);
      return { mes, entradas: t.income, saidas: t.expense, vazio: doMes.length === 0 };
    })
    .filter((m) => !m.vazio)
    .map(({ mes, entradas, saidas }) => ({ mes, entradas, saidas }));

  const saidas = totalsByCategory(entradasDoPeriodo, categorias, 'expense');

  const fixas = data.recurring
    .filter((r) => r.active && r.kind === 'expense')
    .map((r) => ({ nome: r.description, porMes: custoMensalDaRegra(r) }))
    .sort((a, b) => b.porMes - a.porMes);

  // Parcelas que já estão compradas e ainda vão nascer: é o que aperta os
  // próximos meses sem aparecer no extrato de hoje.
  const limite = addMonthsToKey(atual, MESES_DE_PARCELAS);
  const porMes = new Map<string, number>();
  for (const entrada of comCaixa) {
    if (!entrada.purchaseId || entrada.kind !== 'expense') continue;
    // Em que mês a parcela vai pesar no bolso, que é o que aperta.
    const mes = monthKey(quandoSai(entrada));
    if (mes < atual || mes > limite) continue;
    porMes.set(mes, (porMes.get(mes) ?? 0) + entrada.amount);
  }
  const parcelas = [...porMes.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([mes, valor]) => ({ mes, valor }));

  const analise = analisar(data, entradasDoPeriodo, categorias, hoje);

  return {
    hoje,
    periodo: rotuloDoPeriodo(periodo),
    totais: { entradas: doPeriodo.income, saidas: doPeriodo.expense, resultado: doPeriodo.net },
    serie,
    categorias: saidas.map((c) => ({
      nome: c.category?.name ?? 'Sem categoria',
      valor: c.amount,
      fatia: c.share,
    })),
    fixas,
    parcelas,
    contas: contas.map((c) => ({ nome: nomeCompletoDaConta(c), saldo: saldoDaConta(data, c.id) })),
    achados: analise.achados.map((a) => `${a.titulo}: ${a.texto}`),
    mesesDeHistorico: analise.mesesDeHistorico,
  };
}

/**
 * "Nubank — Conta corrente", e não "Conta corrente".
 *
 * Na tela a conta aparece agrupada embaixo do nome do banco, então o nome
 * curto basta. Numa lista corrida não: com quatro cartões e três contas
 * correntes, o texto saía com "Conta corrente" e "Cartão" repetidos duas vezes
 * cada, com saldos diferentes — e quem lê não tem como saber qual é qual.
 */
function nomeCompletoDaConta(conta: Account): string {
  const banco = conta.institution?.trim();
  return banco && banco !== conta.name ? `${banco} — ${conta.name}` : conta.name;
}

function saldoDaConta(data: FinanceData, contaId: string): number {
  const conta = data.accounts.find((c) => c.id === contaId);
  let saldo = conta?.openingBalance ?? 0;
  for (const e of data.entries) {
    if (e.status !== 'settled') continue;
    if (e.kind === 'transfer') {
      if (e.accountId === contaId) saldo -= e.amount;
      if (e.toAccountId === contaId) saldo += e.amount;
      continue;
    }
    if (e.accountId !== contaId) continue;
    saldo += e.kind === 'income' ? e.amount : -e.amount;
  }
  return saldo;
}

/* ------------------------------------------------------------------- texto */

function bloco(titulo: string, linhas: string[]): string[] {
  return linhas.length === 0 ? [] : [`## ${titulo}`, ...linhas, ''];
}

function pct(fatia: number): string {
  return `${Math.round(fatia * 100)}%`;
}

/** O texto pronto para colar. */
export function montarPrompt(modelo: ModeloDePrompt, dados: DadosDoPrompt): string {
  const linhas: string[] = [
    'Você é um analista financeiro pessoal. Responda em português do Brasil.',
    '',
    '## O que eu quero',
    modelo.pedido,
    '',
    '## Como responder',
    '- Use só os números que estão aqui. Se faltar algum, diga o que falta em vez de estimar.',
    '- Valores em reais, com o número do lado de cada afirmação.',
    '- Direto: sem introdução, sem elogio, sem repetir a pergunta.',
    dados.mesesDeHistorico < 3
      ? `- Atenção: só existem ${dados.mesesDeHistorico} ${
        dados.mesesDeHistorico === 1 ? 'mês fechado' : 'meses fechados'
      } de histórico. Diga o que ainda não dá para afirmar com isso.`
      : '- Compare com os meses anteriores antes de chamar qualquer coisa de alta ou baixa.',
    '',
    '## Contexto',
    `Hoje é ${dados.hoje}. Moeda: real brasileiro (R$).`,
    `Período analisado: ${dados.periodo}.`,
    `Meses fechados de histórico: ${dados.mesesDeHistorico}.`,
    'As descrições dos lançamentos não estão aqui de propósito — só os totais.',
    '',
    '## Resumo do período',
    `Entrou: ${formatMoney(dados.totais.entradas)}`,
    `Saiu: ${formatMoney(dados.totais.saidas)}`,
    `Resultado: ${formatMoney(dados.totais.resultado)}`,
    '',
    ...bloco(
      'Meses fechados (entrou / saiu / sobrou)',
      dados.serie.map(
        (m) =>
          `${mesLegivel(m.mes)}: ${formatMoney(m.entradas)} / ${formatMoney(m.saidas)} / ${
            formatMoney(m.entradas - m.saidas)
          }`,
      ),
    ),
    ...bloco(
      'Saídas por categoria no período',
      dados.categorias.map((c) => `${c.nome}: ${formatMoney(c.valor)} (${pct(c.fatia)})`),
    ),
    // O total entra na lista, e não depois do `bloco`: sozinho ele faria a
    // seção existir com "Total: R$ 0,00" para quem não tem conta fixa nenhuma.
    ...bloco(
      'Custo fixo por mês (contas recorrentes ativas)',
      dados.fixas.length === 0
        ? []
        : [
          ...dados.fixas.map((f) => `${f.nome}: ${formatMoney(f.porMes)}`),
          `Total: ${formatMoney(dados.fixas.reduce((s, f) => s + f.porMes, 0))}`,
        ],
    ),
    ...bloco(
      'Parcelas já compradas, por mês',
      dados.parcelas.map((p) => `${mesLegivel(p.mes)}: ${formatMoney(p.valor)}`),
    ),
    ...bloco(
      'Saldo por conta',
      dados.contas.map((c) => `${c.nome}: ${formatMoney(c.saldo)}`),
    ),
    ...bloco('O que a análise automática do app já apontou', dados.achados.map((a) => `- ${a}`)),
  ];

  return linhas.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Quantos caracteres o texto tem, para a tela dizer antes de a pessoa colar.
 * Não é frescura: um prompt de 40 mil caracteres é recusado por boa parte dos
 * chats, e descobrir isso depois de colar é perder a viagem.
 */
export function tamanhoDoPrompt(texto: string): number {
  return texto.length;
}
