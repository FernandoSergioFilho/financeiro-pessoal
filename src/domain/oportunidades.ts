/**
 * O que fazer com o que os números dizem.
 *
 * `analise.ts` responde "o que aconteceu". Este módulo responde **"e o que eu
 * faço com isso"**, e a diferença é que aqui toda conclusão vem com um número
 * em reais e um caminho concreto — quase sempre um serviço que o banco já
 * oferece e que a pessoa não está usando.
 *
 * **Por que isto é calculado e não pesquisado.** Seria melhor comparar com as
 * taxas do mercado de hoje, e não dá: o app é uma página estática, sem servidor
 * para buscar nada. Mas a parte que importa não precisa de internet — quanto
 * você tem parado, quanto está pagando de juros, quanto sobe o custo fixo, o
 * que as tarifas somam no ano — tudo isso está nos seus próprios lançamentos.
 * O que vem de fora é **uma taxa só**, que fica editável e vale para todas as
 * contas de "quanto isso renderia".
 *
 * **A régua de cada achado.** Nenhum aparece sem passar por três perguntas:
 * o número é grande o bastante para valer a atenção? existe uma ação concreta,
 * e não um conselho genérico? o valor em reais está dito? Um painel cheio de
 * "considere revisar seus gastos" não ajuda ninguém, e ensina a pessoa a
 * ignorar a tela.
 */

import { addMonthsToKey, monthEnd, monthKey, monthStart, today } from './date.ts';
import { comDataDeCaixa, quandoSai } from './faturas.ts';
import { mediana, tendencia, CONFIANCA_MINIMA } from './estatistica.ts';
import { custoMensalDaRegra } from './analise.ts';
import { formatMoney } from './money.ts';
import { accountBalance } from './summary.ts';
import type { Account, Category, DisplayEntry, FinanceData } from './types.ts';

/**
 * Quanto rende, ao ano, o dinheiro que fica parado — a única coisa aqui que
 * não sai dos lançamentos.
 *
 * O padrão é uma taxa de renda fixa conservadora, perto do que um CDB de
 * liquidez diária ou o Tesouro Selic pagavam quando isto foi escrito. Fica
 * editável porque vai envelhecer, e porque a régua de cada um é diferente.
 */
export const RENDIMENTO_PADRAO_AO_ANO = 0.1;

/** Abaixo disto não vale ocupar a tela: é ruído com cara de conselho. */
export const VALOR_MINIMO = 5000;

/** Quanto se considera "parado" na conta corrente, além da reserva do mês. */
export const MESES_DE_FOLGA = 1;

export type Peso = 'alto' | 'medio' | 'baixo';

/**
 * Nem todo achado é da mesma natureza, e somá-los daria um número falso.
 *
 * - **vazamento**: dinheiro saindo por nada — juros, tarifa, custo fixo que
 *   subiu. Parar de perder é ganho imediato e certo.
 * - **ganho**: dinheiro que existe e não está rendendo. O ganho é real mas
 *   depende de uma taxa que pode mudar.
 * - **contexto**: nem um nem outro. As parcelas comprometidas não são perda
 *   nem ganho: são uma decisão já tomada que convém enxergar antes de tomar a
 *   próxima. Somá-las ao resto inflaria o total com um número que não se
 *   recupera de jeito nenhum.
 */
export type TipoDeAchado = 'vazamento' | 'ganho' | 'contexto';

export interface Oportunidade {
  id: string;
  titulo: string;
  /** O que está acontecendo, com o número que sustenta. */
  texto: string;
  /** O que fazer — concreto, e de preferência algo que o banco já oferece. */
  acao: string;
  /** Quanto está em jogo por ano, em centavos. Ordena a lista. */
  porAno: number;
  peso: Peso;
  tipo: TipoDeAchado;
}

/** A ordem de leitura: o que está queimando, o que está dormindo, o que é aviso. */
const ORDEM: Record<TipoDeAchado, number> = { vazamento: 0, ganho: 1, contexto: 2 };

export interface Achados {
  lista: Oportunidade[];
  /** Quanto se para de perder, por ano. */
  vazando: number;
  /** Quanto se passaria a ganhar, por ano. */
  ganhando: number;
}

/**
 * Os achados com os dois totais separados.
 *
 * Os dois números existem separados porque respondem coisas diferentes, e o
 * total único que existia antes somava compromisso com ganho potencial — um
 * número que parecia grande e não queria dizer nada.
 */
export function resumirOportunidades(lista: readonly Oportunidade[]): Achados {
  return {
    lista: [...lista],
    vazando: lista.filter((o) => o.tipo === 'vazamento').reduce((s, o) => s + o.porAno, 0),
    ganhando: lista.filter((o) => o.tipo === 'ganho').reduce((s, o) => s + o.porAno, 0),
  };
}

/* ------------------------------------------------------------- ferramentas */

/** As palavras que os bancos usam para cobrar juros e encargos. */
const PALAVRAS_DE_JUROS = [
  'juros', 'encargos', 'rotativo', 'iof', 'mora', 'multa', 'atraso', 'refinanciamento',
];

/** E as que usam para tarifa de serviço. */
const PALAVRAS_DE_TARIFA = [
  'tarifa', 'pacote de servico', 'pacote servico', 'cesta', 'anuidade', 'manutencao de conta',
  'taxa de administracao', 'custodia',
];

function comparavel(texto: string): string {
  return texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function casaComAlguma(descricao: string, palavras: readonly string[]): boolean {
  const texto = comparavel(descricao);
  return palavras.some((p) => texto.includes(p));
}

/** Os meses fechados, do mais antigo para o mais novo. */
function mesesFechados(hoje: string, quantos: number): string[] {
  const atual = monthKey(hoje);
  return Array.from({ length: quantos }, (_, i) => addMonthsToKey(atual, -(quantos - i)));
}

/* ------------------------------------------------------------------ achados */

export interface Contexto {
  data: FinanceData;
  contas: readonly Account[];
  categorias: readonly Category[];
  /** Taxa anual usada nas contas de "quanto renderia". */
  rendimentoAoAno?: number;
  hoje?: string;
}

export function procurarOportunidades(ctx: Contexto): Oportunidade[] {
  const hoje = ctx.hoje ?? today();
  const taxa = ctx.rendimentoAoAno ?? RENDIMENTO_PADRAO_AO_ANO;
  const achados: Oportunidade[] = [];

  const comCaixa = comDataDeCaixa(ctx.contas, ctx.data.entries) as DisplayEntry[];
  const meses = mesesFechados(hoje, 12);
  const doMes = (chave: string) =>
    comCaixa.filter((e) => {
      const sai = quandoSai(e);
      return sai >= monthStart(chave) && sai <= monthEnd(chave);
    });
  const janelas = meses.map(doMes).filter((m) => m.length > 0);

  const gastoPorMes = janelas.map((m) =>
    m.filter((e) => e.kind === 'expense').reduce((s, e) => s + e.amount, 0),
  );
  const gastoTipico = mediana(gastoPorMes) ?? 0;

  achados.push(...dinheiroParado(ctx.contas, comCaixa, gastoTipico, taxa, hoje));
  achados.push(...jurosPagos(janelas, taxa));
  achados.push(...tarifasEAnuidades(janelas));
  achados.push(...custoFixoSubindo(ctx.data, janelas, meses));
  achados.push(...assinaturas(ctx.data));
  achados.push(...parcelasComprometidas(comCaixa, hoje, gastoTipico));

  return achados
    .filter((o) => o.porAno >= VALOR_MINIMO)
    // Por natureza primeiro, e só depois por valor: o que está queimando vem
    // antes do que está dormindo, por maior que seja o segundo.
    .sort((a, b) => ORDEM[a.tipo] - ORDEM[b.tipo] || b.porAno - a.porAno);
}

/**
 * Dinheiro parado na conta corrente rendendo zero.
 *
 * A folga de um mês de gasto fica de fora de propósito: ninguém deve investir
 * o dinheiro do aluguel da semana que vem, e um conselho que ignora isso é um
 * conselho que quebra a pessoa.
 */
function dinheiroParado(
  contas: readonly Account[],
  entradas: readonly DisplayEntry[],
  gastoTipico: number,
  taxa: number,
  hoje: string,
): Oportunidade[] {
  const paradas = contas.filter((c) => !c.archived && c.kind === 'checking');
  const saldo = paradas.reduce((s, c) => s + accountBalance(c, entradas, { onlySettled: true, upTo: hoje }), 0);
  const folga = gastoTipico * MESES_DE_FOLGA;
  const sobrando = saldo - folga;
  if (sobrando <= 0) return [];

  const porAno = Math.round(sobrando * taxa);
  return [{
    id: 'dinheiro-parado',
    titulo: 'Tem dinheiro parado rendendo zero',
    texto:
      `Há ${formatMoney(saldo)} na conta corrente. Guardando ${formatMoney(folga)} para o mês `
      + `(o seu gasto de costume), sobram ${formatMoney(sobrando)} que não rendem nada onde estão.`,
    acao:
      `A ${(taxa * 100).toFixed(0)}% ao ano, esse dinheiro renderia ${formatMoney(porAno)} por ano — `
      + `${formatMoney(Math.round(porAno / 12))} por mês. Tesouro Selic, CDB de liquidez diária e conta `
      + 'remunerada resgatam no mesmo dia, e o seu banco oferece pelo menos um deles.',
    porAno,
    peso: 'alto',
    tipo: 'ganho',
  }];
}

/**
 * Juros e encargos que já foram pagos.
 *
 * É o achado mais valioso que existe aqui: juro de cartão no Brasil passa de
 * 400% ao ano, e qualquer coisa que substitua isso — portabilidade, crédito
 * consignado, até empréstimo pessoal — é mais barata.
 */
function jurosPagos(janelas: readonly DisplayEntry[][], taxa: number): Oportunidade[] {
  const porMes = janelas.map((m) =>
    m.filter((e) => e.kind === 'expense' && casaComAlguma(e.description, PALAVRAS_DE_JUROS))
      .reduce((s, e) => s + e.amount, 0),
  );
  const total = porMes.reduce((a, b) => a + b, 0);
  if (total === 0) return [];

  const porAno = Math.round((total / Math.max(janelas.length, 1)) * 12);
  return [{
    id: 'juros',
    titulo: 'Você está pagando juros',
    texto:
      `Nos últimos ${janelas.length} meses saíram ${formatMoney(total)} em juros, encargos, IOF e multas — `
      + `${formatMoney(Math.round(total / Math.max(janelas.length, 1)))} por mês em média.`,
    acao:
      `São ${formatMoney(porAno)} por ano que somem sem comprar nada. Juro de cartão e cheque especial são `
      + 'os mais caros que existem: portabilidade de dívida, crédito com garantia ou até um empréstimo '
      + `pessoal costumam custar menos. Quitar isso rende mais do que qualquer investimento a ${(taxa * 100).toFixed(0)}%.`,
    porAno,
    peso: 'alto',
    tipo: 'vazamento',
  }];
}

/** Tarifa, pacote de serviços, anuidade: o que se paga só por ter a conta. */
function tarifasEAnuidades(janelas: readonly DisplayEntry[][]): Oportunidade[] {
  const total = janelas.flat()
    .filter((e) => e.kind === 'expense' && casaComAlguma(e.description, PALAVRAS_DE_TARIFA))
    .reduce((s, e) => s + e.amount, 0);
  if (total === 0) return [];

  const porAno = Math.round((total / Math.max(janelas.length, 1)) * 12);
  return [{
    id: 'tarifas',
    titulo: 'Tarifas e anuidades',
    texto: `${formatMoney(total)} em tarifas, pacotes e anuidades nos últimos ${janelas.length} meses.`,
    acao:
      `${formatMoney(porAno)} por ano. Conta digital sem tarifa é o padrão hoje, e a anuidade do cartão `
      + 'costuma cair com um pedido na central — ou com o gasto mínimo que o próprio banco anuncia. '
      + 'Vale ligar antes de aceitar a cobrança do ano que vem.',
    porAno,
    peso: 'medio',
    tipo: 'vazamento',
  }];
}

/**
 * O custo fixo está subindo?
 *
 * Não é sobre um mês caro: é sobre a base do mês, aquilo que se paga antes de
 * escolher qualquer coisa. Quando ela sobe, sobe para sempre — e é o tipo de
 * coisa que passa despercebida porque cada reajuste é pequeno.
 */
function custoFixoSubindo(
  data: FinanceData,
  janelas: readonly DisplayEntry[][],
  meses: readonly string[],
): Oportunidade[] {
  if (janelas.length < 5) return [];

  const fixoPorMes = janelas.map((m) =>
    m.filter((e) => e.kind === 'expense' && e.recurringId).reduce((s, e) => s + e.amount, 0),
  );
  const t = tendencia(fixoPorMes);
  if (!t || t.confianca < CONFIANCA_MINIMA || t.porMes <= 0) return [];

  const porAno = Math.round(t.porMes * 12);
  if (porAno < VALOR_MINIMO) return [];

  const ativas = data.recurring.filter((r) => r.active && r.kind === 'expense');
  const maiores = [...ativas]
    .sort((a, b) => custoMensalDaRegra(b) - custoMensalDaRegra(a))
    .slice(0, 3)
    .map((r) => `${r.description} (${formatMoney(custoMensalDaRegra(r))})`);

  return [{
    id: 'custo-fixo-subindo',
    titulo: 'O custo fixo está subindo',
    texto:
      `As contas que se repetem subiram ${formatMoney(t.porMes)} por mês ao longo de ${meses.length} meses. `
      + 'É a base do mês: quando ela sobe, sobe para sempre.',
    acao:
      `No ritmo atual são ${formatMoney(porAno)} a mais por ano. As três maiores hoje: ${maiores.join(', ')}. `
      + 'Renegociar ou trocar uma delas vale mais do que cortar dez cafés.',
    porAno,
    peso: 'alto',
    tipo: 'vazamento',
  }];
}

/**
 * As assinaturas somadas.
 *
 * Uma a uma, nenhuma dói — é por isso que ninguém cancela. Juntas e por ano,
 * viram um número que faz pensar, e esse é o ponto.
 */
function assinaturas(data: FinanceData): Oportunidade[] {
  const pequenas = data.recurring
    .filter((r) => r.active && r.kind === 'expense' && r.frequency === 'monthly')
    .filter((r) => custoMensalDaRegra(r) <= 10000);
  if (pequenas.length < 3) return [];

  const porMes = pequenas.reduce((s, r) => s + custoMensalDaRegra(r), 0);
  const porAno = porMes * 12;

  return [{
    id: 'assinaturas',
    titulo: `${pequenas.length} assinaturas pequenas`,
    texto:
      `${pequenas.map((r) => r.description).join(', ')} somam ${formatMoney(porMes)} por mês. `
      + 'Uma a uma nenhuma dói, e é por isso que ninguém cancela.',
    acao:
      `Juntas são ${formatMoney(porAno)} por ano. Vale abrir a lista e perguntar de cada uma se você `
      + 'usou no último mês — as que não, cancele hoje; voltar a assinar leva um minuto.',
    porAno,
    peso: 'medio',
    tipo: 'vazamento',
  }];
}

/**
 * O quanto dos próximos meses já está comprometido em parcelas.
 *
 * Não é sobre estar errado ter parcelado: é sobre saber que a decisão já foi
 * tomada. Quem tem metade do mês comprometido não tem metade do mês.
 */
function parcelasComprometidas(
  entradas: readonly DisplayEntry[],
  hoje: string,
  gastoTipico: number,
): Oportunidade[] {
  const atual = monthKey(hoje);
  const limite = addMonthsToKey(atual, 12);
  const futuras = entradas.filter((e) => {
    if (!e.purchaseId || e.kind !== 'expense') return false;
    const mes = monthKey(quandoSai(e));
    return mes >= atual && mes <= limite;
  });
  const total = futuras.reduce((s, e) => s + e.amount, 0);
  if (total === 0 || gastoTipico === 0) return [];

  const porMes = Math.round(total / 12);
  const fatia = porMes / gastoTipico;
  if (fatia < 0.15) return [];

  return [{
    id: 'parcelas',
    titulo: 'Parte do mês já está vendida',
    texto:
      `${formatMoney(total)} em parcelas já compradas vencem nos próximos 12 meses — `
      + `${formatMoney(porMes)} por mês, ou ${Math.round(fatia * 100)}% do seu gasto de costume.`,
    acao:
      'Antes de parcelar a próxima coisa, olhe este número: ele é o que já está decidido. '
      + 'Se alguma dessas parcelas tem juros embutidos, antecipar costuma dar desconto — a lei '
      + 'obriga, e o banco dá se você pedir.',
    porAno: total,
    peso: 'medio',
    tipo: 'contexto',
  }];
}
