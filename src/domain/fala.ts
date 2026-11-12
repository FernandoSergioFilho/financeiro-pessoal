/**
 * Entender uma frase falada e transformá-la em lançamento.
 *
 * "Paguei o mercado quarenta e cinco reais ontem" tem tudo o que o formulário
 * pede — valor, data, descrição, tipo — só não está em campos. Este módulo faz
 * a separação. O reconhecimento de voz em si é do navegador e fica na camada
 * de tela; aqui é só texto entrando e campos saindo, o que deixa a parte
 * difícil (e a que erra) coberta por teste.
 *
 * **Nada do que sai daqui é gravado sem revisão.** A tela preenche os campos e
 * mostra o que entendeu; quem fala confere. Por isso a interpretação pode ser
 * ousada em valor, data e descrição — erro aparece na hora — e é propositalmente
 * tímida em uma só coisa: marcar como **pago**. "Paguei" no passado é a forma
 * natural de narrar qualquer gasto, inclusive o que ainda vai sair da conta;
 * tratar isso como confirmação mexeria no saldo sem ninguém pedir. Só uma frase
 * que não deixa dúvida — "já paguei", "já foi pago" — liga essa marca.
 *
 * **Como o texto é consumido.** Cada palavra reconhecida como valor, data,
 * conta ou verbo é marcada como usada; o que sobra é a descrição. É isso que
 * faz "paguei o mercado 45 reais ontem" virar o nome "Mercado", e não
 * "paguei o mercado 45 reais ontem".
 */

import { daysInMonth, parseISO, toISO, addDays } from './date.ts';
import { formatMoney, parseMoney } from './money.ts';
import { chaveDeNome } from './text.ts';
import type { CategoryKind, EntryKind } from './types.ts';

export interface ContaDaFala {
  id: string;
  name: string;
}

export interface CategoriaDaFala {
  id: string;
  name: string;
  kind: CategoryKind;
}

export interface ContextoDaFala {
  /** `YYYY-MM-DD` de hoje — "ontem" e "dia 5" se contam a partir dele. */
  hoje: string;
  contas: readonly ContaDaFala[];
  categorias: readonly CategoriaDaFala[];
}

export interface FalaEntendida {
  /** O texto como foi ouvido, para a tela mostrar e a pessoa conferir. */
  texto: string;
  /** Em centavos, como todo valor deste app. */
  amount: number | null;
  date: string | null;
  /** O que sobrou do texto, limpo e com a primeira letra maiúscula. */
  description: string;
  kind: EntryKind | null;
  accountId: string | null;
  /** Conta de destino — só quando a frase é de transferência. */
  toAccountId: string | null;
  categoryId: string | null;
  /** `null` = a frase não disse; a tela mantém o que já estava. */
  settled: boolean | null;
  /** O que foi reconhecido, em português, para a tela listar. */
  achados: string[];
}

/* ------------------------------------------------------------- vocabulário */

const NUMEROS: Record<string, number> = {
  zero: 0, um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5,
  seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12, treze: 13,
  quatorze: 14, catorze: 14, quinze: 15, dezesseis: 16, dezasseis: 16,
  dezessete: 17, dezassete: 17, dezoito: 18, dezenove: 19, dezanove: 19,
  vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60,
  setenta: 70, oitenta: 80, noventa: 90,
  cem: 100, cento: 100, duzentos: 200, duzentas: 200, trezentos: 300,
  trezentas: 300, quatrocentos: 400, quatrocentas: 400, quinhentos: 500,
  quinhentas: 500, seiscentos: 600, seiscentas: 600, setecentos: 700,
  setecentas: 700, oitocentos: 800, oitocentas: 800, novecentos: 900,
  novecentas: 900,
};

const MULTIPLICADORES: Record<string, number> = {
  mil: 1000, milhao: 1_000_000, milhoes: 1_000_000,
};

/** Palavras que dizem "o número ao lado é dinheiro". */
const MOEDA = new Set(['reais', 'real', 'conto', 'contos', 'pila', 'pilas', 'paus', 'pau']);
const CENTAVOS = new Set(['centavos', 'centavo']);

const MESES: Record<string, number> = {
  janeiro: 1, jan: 1, fevereiro: 2, fev: 2, marco: 3, mar: 3, abril: 4, abr: 4,
  maio: 5, mai: 5, junho: 6, jun: 6, julho: 7, jul: 7, agosto: 8, ago: 8,
  setembro: 9, set: 9, sete: 9, outubro: 10, out: 10, novembro: 11, nov: 11,
  dezembro: 12, dez: 12,
};

/** "primeiro de outubro" — ordinal que só aparece em data. */
const DIA_ORDINAL: Record<string, number> = { primeiro: 1, primeira: 1 };

const DIAS_RELATIVOS: Record<string, number> = {
  hoje: 0, ontem: -1, anteontem: -2, amanha: 1,
};

/**
 * Duas listas, e não uma.
 *
 * **Indicar** o tipo e **sair** da descrição são coisas diferentes. "Salário",
 * "estorno" e "rendimento" dizem que é entrada e são exatamente o nome que a
 * pessoa quer ver no lançamento; só os verbos — "recebi", "paguei" — é que
 * sobram no texto sem servir de nome. Quando as duas coisas eram uma só lista,
 * "recebi o salário de cinco mil" terminava sem descrição nenhuma.
 */
const INDICAM_SAIDA = new Set([
  // pagar e quitar
  'paguei', 'pagamos', 'pagou', 'pagar', 'quitei', 'quitamos', 'quitado',
  // gastar
  'gastei', 'gastamos', 'gastou', 'gastar', 'gasto', 'gastos', 'torrei',
  'desembolsei', 'desembolso', 'despesa', 'despesas',
  // comprar
  'comprei', 'compramos', 'comprou', 'comprar', 'compra', 'compras',
  'parcelei', 'financiei', 'aluguei', 'assinei',
  // o dinheiro saindo, visto da conta
  'saiu', 'sairam', 'saida', 'debitou', 'debitaram', 'debitado', 'debitei',
  'descontaram', 'descontou', 'descontado', 'cobraram', 'cobrou', 'cobrado',
  'cobranca', 'custou', 'custaram',
  // mandar dinheiro para fora. Também são de transferência: quando as duas
  // contas aparecem na frase, aquela regra ganha; sem isso, é saída mesmo —
  // "mandei 200 para o João" não é transferência entre contas minhas.
  'mandei', 'mandamos', 'enviei', 'enviamos', 'transferi', 'transferimos',
  'passei', 'emprestei', 'doei',
  // refeições, que no dia a dia aparecem como verbo
  'almocei', 'jantei', 'lanchei', 'abasteci',
]);

const INDICAM_ENTRADA = new Set([
  // receber
  'recebi', 'recebemos', 'recebeu', 'recebido', 'recebida', 'recebimento',
  // o dinheiro chegando, visto da conta
  'entrou', 'entraram', 'entrada', 'caiu', 'cairam', 'pingou', 'pingaram',
  'creditaram', 'creditou', 'depositou', 'depositaram', 'deposito',
  // ganhar
  'ganhei', 'ganhamos', 'ganhou', 'ganho', 'lucro', 'lucrei',
  // de onde o dinheiro costuma vir
  'salario', 'ordenado', 'adiantamento', 'bonus', 'comissao', 'comissoes',
  'honorarios', 'freela', 'freelance', 'premio', 'premiacao', 'vale',
  'rendeu', 'rendimento', 'rendimentos', 'juros', 'receita', 'receitas',
  // dinheiro que volta
  'reembolso', 'reembolsaram', 'reembolsou', 'estorno', 'estornaram',
  'estornou', 'devolveram', 'devolveu', 'devolucao', 'restituicao',
  // vender
  'vendi', 'vendemos', 'vendeu', 'venda', 'vendas',
]);

const INDICAM_TRANSFERENCIA = new Set([
  'transferi', 'transferimos', 'transferencia', 'transferir', 'mandei',
  'passei', 'movi', 'mandamos', 'enviei', 'enviamos',
]);

/**
 * Expressões de duas ou três palavras, conferidas antes das palavras soltas.
 *
 * Existem porque algumas das formas mais naturais de dizer "entrou dinheiro"
 * usam palavras que, sozinhas, significam o contrário. "Chegou" é o caso
 * exemplar: *chegou na conta* é entrada, e *chegou a conta de luz* é saída —
 * a mesma palavra, decidida pela preposição. Pôr "chegou" na lista de
 * entrada transformaria toda conta que chega num dinheiro que entrou.
 *
 * O mesmo vale para "pagaram": quem pagou a conta gastou, mas quem *me*
 * pagou me deu dinheiro.
 */
interface Expressao {
  palavras: string[];
  kind: EntryKind;
}

const EXPRESSOES: Expressao[] = [
  { palavras: ['chegou', 'na', 'conta'], kind: 'income' },
  { palavras: ['chegou', 'no', 'banco'], kind: 'income' },
  { palavras: ['chegou', 'pra', 'conta'], kind: 'income' },
  { palavras: ['chegou', 'para', 'minha', 'conta'], kind: 'income' },
  { palavras: ['chegou', 'para', 'a', 'conta'], kind: 'income' },
  { palavras: ['caiu', 'na', 'conta'], kind: 'income' },
  { palavras: ['entrou', 'na', 'conta'], kind: 'income' },
  { palavras: ['pingou', 'na', 'conta'], kind: 'income' },
  { palavras: ['me', 'pagaram'], kind: 'income' },
  { palavras: ['me', 'pagou'], kind: 'income' },
  { palavras: ['nos', 'pagaram'], kind: 'income' },
  { palavras: ['me', 'depositaram'], kind: 'income' },
  { palavras: ['me', 'devolveram'], kind: 'income' },
  { palavras: ['decimo', 'terceiro'], kind: 'income' },
  { palavras: ['saiu', 'da', 'conta'], kind: 'expense' },
  { palavras: ['foi', 'descontado'], kind: 'expense' },
  { palavras: ['passei', 'no', 'cartao'], kind: 'expense' },
  { palavras: ['passei', 'no', 'credito'], kind: 'expense' },
  { palavras: ['passei', 'no', 'debito'], kind: 'expense' },
  { palavras: ['fiz', 'um', 'pix'], kind: 'expense' },
  { palavras: ['mandei', 'um', 'pix'], kind: 'expense' },
  { palavras: ['dei', 'entrada'], kind: 'expense' },
];

/**
 * O que sai do texto por ser só maneira de narrar, e nunca nome de nada.
 *
 * Note que "conta" não está aqui nem nas listas acima: é a palavra mais
 * ambígua do assunto — "paguei a conta de luz" tem um nome dentro dela, e
 * "conta do Nubank" é outra coisa ainda.
 */
const VERBOS = new Set([
  'paguei', 'pagamos', 'pagou', 'pagar', 'pagaram', 'quitei', 'quitamos',
  'gastei', 'gastamos', 'gastou', 'gastar', 'torrei', 'desembolsei',
  'comprei', 'compramos', 'comprou', 'comprar', 'parcelei', 'financiei',
  'aluguei', 'assinei', 'almocei', 'jantei', 'lanchei', 'abasteci',
  'saiu', 'sairam', 'debitou', 'debitaram', 'debitei', 'descontaram',
  'descontou', 'cobraram', 'cobrou', 'custou', 'custaram',
  'recebi', 'recebemos', 'recebeu', 'entrou', 'entraram', 'caiu', 'cairam',
  'pingou', 'pingaram', 'creditaram', 'creditou', 'depositou', 'depositaram',
  'ganhei', 'ganhamos', 'ganhou', 'lucrei', 'rendeu', 'chegou',
  'reembolsaram', 'reembolsou', 'estornaram', 'estornou', 'devolveram',
  'devolveu', 'vendi', 'vendemos', 'vendeu',
  'transferi', 'transferimos', 'transferir', 'mandei', 'mandamos', 'enviei',
  'enviamos', 'passei', 'movi', 'emprestei', 'doei', 'fiz', 'dei',
]);

/**
 * Verbos que já são o nome do lançamento, quando nada mais sobra.
 *
 * "Almocei trinta reais" não tem substantivo nenhum, e a descrição sairia
 * vazia; mas o nome está ali, dito como verbo. Vale só para este punhado em
 * que a tradução é óbvia e única — "paguei" continua não virando nome, porque
 * pagar o quê é justamente o que a frase não disse.
 */
const NOME_DO_VERBO: Record<string, string> = {
  almocei: 'Almoço', almocamos: 'Almoço', jantei: 'Jantar', jantamos: 'Jantar',
  lanchei: 'Lanche', lanchamos: 'Lanche', abasteci: 'Combustível',
};

/** Palavras sem conteúdo, tiradas das pontas do que sobra para a descrição. */
const RECHEIO = new Set([
  'de', 'do', 'da', 'dos', 'das', 'no', 'na', 'nos', 'nas', 'o', 'a', 'os',
  'as', 'um', 'uma', 'em', 'com', 'por', 'pra', 'pro', 'para', 'pelo', 'pela',
  'foi', 'que', 'e', 'valor', 'total', 'ai', 'la', 'ali', 'aqui', 'meu',
  'minha', 'nosso', 'nossa', 'ja', 'me', 'se', 'lhe',
]);

/* ---------------------------------------------------------------- palavras */

interface Palavra {
  /** Como foi dita, para a descrição. */
  bruto: string;
  /** Sem acento, sem caixa, sem pontuação de borda — para comparar. */
  norm: string;
  usada: boolean;
}

const PONTUACAO = /^[.,;:!?¿¡"'“”()[\]-]+|[.,;:!?¿¡"'“”()[\]-]+$/g;

function separar(texto: string): Palavra[] {
  return texto
    .split(/\s+/)
    .map((cru) => cru.replace(PONTUACAO, ''))
    .filter((cru) => cru.length > 0)
    .map((bruto) => ({
      bruto,
      // O símbolo do dinheiro sai aqui, e não na lista de palavras de moeda:
      // o navegador às vezes escreve "R$45,00" junto, e aí nem o número nem o
      // símbolo seriam reconhecidos.
      norm: chaveDeNome(bruto).replace(/^r?\$/, '').replace(/[^a-z0-9,./]/g, ''),
      usada: false,
    }))
    .filter((p) => p.norm.length > 0);
}

/* ------------------------------------------------------------------ número */

interface Pedaco {
  inicio: number;
  /** Exclusivo. */
  fim: number;
  /** Parte inteira, em unidades. */
  inteiro: number;
  /** Centavos ditos como decimal ("45,90"); 0 quando não houve. */
  centavos: number;
}

function soDigitos(norm: string): boolean {
  return /^\d+([.,]\d+)*$/.test(norm);
}

function ehNumero(norm: string): boolean {
  return norm in NUMEROS || norm in MULTIPLICADORES || soDigitos(norm);
}

/**
 * Os trechos numéricos da frase, cada um já somado.
 *
 * "Dois mil e quinhentos" é um trecho só, e vale 2500. Mas "dia 5 quarenta
 * reais" são **dois** trechos, e é aí que mora a sutileza: dois números
 * grudados só formam um número quando o segundo é menor que o primeiro, que é
 * como o português escreve — "cento e trinta", "quarenta e cinco", "mil e
 * duzentos", sempre em ordem decrescente. Sem essa regra, "dia 5 quarenta
 * reais" somava 45 e o lançamento saía com o valor errado e sem data.
 */
function pedacosNumericos(palavras: readonly Palavra[]): Pedaco[] {
  const pedacos: Pedaco[] = [];
  let i = 0;
  while (i < palavras.length) {
    const pedaco = lerPedaco(palavras, i);
    if (!pedaco) {
      i += 1;
      continue;
    }
    pedacos.push(pedaco);
    i = pedaco.fim;
  }
  return pedacos;
}

/** O trecho numérico que começa em `i`, o mais longo que faça sentido. */
function lerPedaco(palavras: readonly Palavra[], i: number): Pedaco | null {
  if (palavras[i]!.usada || !ehNumero(palavras[i]!.norm)) return null;

  let total = 0;
  let atual = 0;
  let centavos = 0;
  /** O último valor somado: o próximo só entra se for menor que ele. */
  let ultimo = Number.POSITIVE_INFINITY;
  let algum = false;
  let fim = i;

  while (fim < palavras.length) {
    const palavra = palavras[fim]!;
    if (palavra.usada) break;

    // O "e" entre dois números faz parte do número; solto, encerra o trecho.
    let indice = fim;
    if (palavra.norm === 'e') {
      const proxima = palavras[fim + 1];
      if (!algum || !proxima || proxima.usada || !ehNumero(proxima.norm)) break;
      indice = fim + 1;
    }
    const atualPalavra = palavras[indice]!;

    const multiplicador = MULTIPLICADORES[atualPalavra.norm];
    if (multiplicador !== undefined) {
      // "mil" sozinho é mil, e não zero vezes mil.
      total += (atual === 0 ? 1 : atual) * multiplicador;
      atual = 0;
      ultimo = Number.POSITIVE_INFINITY;
      algum = true;
      fim = indice + 1;
      continue;
    }

    const nomeado = NUMEROS[atualPalavra.norm];
    const valor = nomeado !== undefined
      ? { inteiro: nomeado, centavos: 0 }
      : valorEmDigitos(atualPalavra.norm);
    if (valor === null) break;
    if (algum && (valor.inteiro >= ultimo || valor.centavos !== 0 || centavos !== 0)) break;

    atual += valor.inteiro;
    centavos = valor.centavos;
    ultimo = valor.inteiro;
    algum = true;
    fim = indice + 1;
  }

  if (!algum) return null;
  return { inicio: i, fim, inteiro: total + atual, centavos };
}

/** Só os dígitos trazem centavos: "45,90" é um número, "quarenta" não. */
function valorEmDigitos(norm: string): { inteiro: number; centavos: number } | null {
  if (!soDigitos(norm)) return null;
  const cents = parseMoney(norm) ?? 0;
  return { inteiro: Math.trunc(cents / 100), centavos: cents % 100 };
}

function marcar(palavras: Palavra[], inicio: number, fim: number): void {
  for (let i = inicio; i < fim; i += 1) palavras[i]!.usada = true;
}

/* -------------------------------------------------------------------- data */

function lerData(palavras: Palavra[], hoje: string): string | null {
  // "depois de amanhã" antes de "amanhã", senão o segundo come o primeiro.
  for (let i = 0; i + 2 < palavras.length; i += 1) {
    if (
      palavras[i]!.norm === 'depois' && palavras[i + 1]!.norm === 'de'
      && palavras[i + 2]!.norm === 'amanha'
    ) {
      marcar(palavras, i, i + 3);
      return addDays(hoje, 2);
    }
  }

  for (let i = 0; i < palavras.length; i += 1) {
    const dias = DIAS_RELATIVOS[palavras[i]!.norm];
    if (dias !== undefined) {
      marcar(palavras, i, i + 1);
      return addDays(hoje, dias);
    }
  }

  const { year, month } = parseISO(hoje);

  // 05/10, 5/10/2026
  for (let i = 0; i < palavras.length; i += 1) {
    const casa = /^(\d{1,2})[/.](\d{1,2})(?:[/.](\d{2,4}))?$/.exec(palavras[i]!.norm);
    if (!casa) continue;
    const dia = Number(casa[1]);
    const mes = Number(casa[2]);
    if (casa[3]) {
      const ano = completarAno(Number(casa[3]));
      if (!diaValido(dia, mes, ano)) continue;
      marcar(palavras, i, i + 1);
      return toISO({ year: ano, month: mes, day: dia });
    }
    const escolhido = anoMaisProximo(dia, mes, hoje);
    if (!escolhido) continue;
    marcar(palavras, i, i + 1);
    return escolhido;
  }

  // "dia 5", "dia cinco", "dia 5 de outubro", "primeiro de março", "5 de janeiro"
  for (let i = 0; i < palavras.length; i += 1) {
    if (palavras[i]!.usada) continue;
    const temDia = palavras[i]!.norm === 'dia';
    const inicio = i;
    const j = temDia ? i + 1 : i;

    const lido = lerDiaDoMes(palavras, j);
    if (!lido) continue;

    // Mês, se vier: "de outubro" ou "outubro".
    let k = lido.fim;
    if (palavras[k]?.norm === 'de') k += 1;
    const nomeDoMes = MESES[palavras[k]?.norm ?? ''];
    // "sete" é setembro e também é sete: só vale como mês depois de "de",
    // nunca solto.
    const ambiguo = (palavras[k]?.norm ?? '') in NUMEROS;
    const temMes = nomeDoMes !== undefined && palavras[k] !== undefined && !palavras[k]!.usada
      && (!ambiguo || palavras[lido.fim]?.norm === 'de');

    if (temMes) {
      let fim = k + 1;
      if (palavras[fim]?.norm === 'de' && /^\d{2,4}$/.test(palavras[fim + 1]?.norm ?? '')) {
        const ano = completarAno(Number(palavras[fim + 1]!.norm));
        if (!diaValido(lido.dia, nomeDoMes!, ano)) continue;
        marcar(palavras, inicio, fim + 2);
        return toISO({ year: ano, month: nomeDoMes!, day: lido.dia });
      }
      const escolhido = anoMaisProximo(lido.dia, nomeDoMes!, hoje);
      if (!escolhido) continue;
      marcar(palavras, inicio, fim);
      return escolhido;
    }

    // Um número solto não é data: "45 reais" seria dia 45 de nada.
    if (!temDia) continue;
    const escolhido = mesMaisProximo(lido.dia, hoje);
    if (!escolhido) {
      if (!diaValido(lido.dia, month, year)) continue;
      marcar(palavras, inicio, lido.fim);
      return toISO({ year, month, day: lido.dia });
    }
    marcar(palavras, inicio, lido.fim);
    return escolhido;
  }

  return null;
}

/**
 * O dia do mês dito a partir de `j` — e **só** o dia.
 *
 * Aqui a leitura é curta de propósito, ao contrário da do valor. "Dia 5 mil
 * reais" é dia 5 e mil reais: ler o número inteiro daria cinco mil, que não é
 * dia de nada, e a frase perderia a data e o valor de uma vez. Então o dia é
 * um número só, ou a forma composta "vinte e cinco".
 */
function lerDiaDoMes(palavras: readonly Palavra[], j: number): { dia: number; fim: number } | null {
  const primeira = palavras[j];
  if (!primeira || primeira.usada) return null;

  const ordinal = DIA_ORDINAL[primeira.norm];
  if (ordinal !== undefined) return { dia: ordinal, fim: j + 1 };

  const dezenas = NUMEROS[primeira.norm];
  const unidade = NUMEROS[palavras[j + 2]?.norm ?? ''];
  if (
    dezenas !== undefined && dezenas >= 20 && dezenas <= 30
    && palavras[j + 1]?.norm === 'e' && unidade !== undefined && unidade <= 9
    && !palavras[j + 1]!.usada && !palavras[j + 2]!.usada
    && MULTIPLICADORES[palavras[j + 3]?.norm ?? ''] === undefined
    && dezenas + unidade <= 31
  ) {
    return { dia: dezenas + unidade, fim: j + 3 };
  }

  const valor = dezenas !== undefined ? { inteiro: dezenas, centavos: 0 } : valorEmDigitos(primeira.norm);
  if (!valor || valor.centavos !== 0 || valor.inteiro < 1 || valor.inteiro > 31) return null;
  return { dia: valor.inteiro, fim: j + 1 };
}

/**
 * Entre o ano passado, este e o próximo, o que cai mais perto de hoje.
 *
 * Dizer "5 de janeiro" em novembro é falar do janeiro que vem, a 55 dias, e
 * não do que passou, a 310. Dizer "5 de outubro" no mesmo dia é falar do que
 * passou, a 37 dias. A conta é a mesma nos dois casos, e acerta os dois.
 */
function anoMaisProximo(dia: number, mes: number, hoje: string): string | null {
  const { year } = parseISO(hoje);
  return maisProxima(
    [year - 1, year, year + 1].map((ano) => ({ ano, mes, dia })),
    hoje,
  );
}

/** Idem, para "dia 5" sem mês: o dia 5 mais perto, deste mês ou do vizinho. */
function mesMaisProximo(dia: number, hoje: string): string | null {
  const { year, month } = parseISO(hoje);
  const meses = [-1, 0, 1].map((passo) => {
    const bruto = month + passo;
    if (bruto < 1) return { ano: year - 1, mes: 12, dia };
    if (bruto > 12) return { ano: year + 1, mes: 1, dia };
    return { ano: year, mes: bruto, dia };
  });
  return maisProxima(meses, hoje);
}

function maisProxima(
  candidatas: readonly { ano: number; mes: number; dia: number }[],
  hoje: string,
): string | null {
  const alvo = diasAbsolutos(hoje);
  let melhor: string | null = null;
  let menor = Number.POSITIVE_INFINITY;
  for (const { ano, mes, dia } of candidatas) {
    if (!diaValido(dia, mes, ano)) continue;
    const iso = toISO({ year: ano, month: mes, day: dia });
    const distancia = Math.abs(diasAbsolutos(iso) - alvo);
    if (distancia < menor) {
      menor = distancia;
      melhor = iso;
    }
  }
  return melhor;
}

/**
 * Distância aproximada em dias, só para comparar candidatas entre si.
 *
 * Não precisa ser calendário de verdade — precisa ordenar certo três datas
 * separadas por meses, e para isso o mês de 30,44 dias basta. Evita de
 * propósito criar um `Date`, que traria fuso para dentro do domínio.
 */
function diasAbsolutos(iso: string): number {
  const { year, month, day } = parseISO(iso);
  return year * 365.25 + month * 30.44 + day;
}

function completarAno(valor: number): number {
  return valor >= 100 ? valor : 2000 + valor;
}

function diaValido(dia: number, mes: number, ano: number): boolean {
  if (mes < 1 || mes > 12 || dia < 1) return false;
  return dia <= daysInMonth(ano, mes);
}

/* ------------------------------------------------------------------ valor */

function lerValor(palavras: Palavra[]): number | null {
  const pedacos = pedacosNumericos(palavras);
  if (pedacos.length === 0) return null;

  // Com a palavra "reais" na frase, o número é o que está antes dela — não o
  // primeiro da frase, que pode ser qualquer outra coisa.
  for (let i = 0; i < palavras.length; i += 1) {
    if (palavras[i]!.usada || !MOEDA.has(palavras[i]!.norm)) continue;
    const antes = pedacos.find((p) => p.fim === i);
    if (!antes) continue;

    let fim = i + 1;
    let centavos = antes.centavos;
    // "quarenta e cinco reais e cinquenta" / "... e cinquenta centavos"
    if (centavos === 0 && palavras[fim]?.norm === 'e') {
      const depois = pedacos.find((p) => p.inicio === fim + 1);
      if (depois && depois.inteiro >= 1 && depois.inteiro <= 99) {
        centavos = depois.inteiro;
        fim = depois.fim;
        if (CENTAVOS.has(palavras[fim]?.norm ?? '')) fim += 1;
      }
    }
    marcar(palavras, antes.inicio, fim);
    return antes.inteiro * 100 + centavos;
  }

  // "oitenta centavos", sem reais nenhum.
  for (let i = 0; i < palavras.length; i += 1) {
    if (palavras[i]!.usada || !CENTAVOS.has(palavras[i]!.norm)) continue;
    const antes = pedacos.find((p) => p.fim === i);
    if (!antes || antes.inteiro > 99) continue;
    marcar(palavras, antes.inicio, i + 1);
    return antes.inteiro;
  }

  // Sem nenhuma pista, o primeiro número que sobrou é o valor.
  const primeiro = pedacos[0]!;
  marcar(palavras, primeiro.inicio, primeiro.fim);
  return primeiro.inteiro * 100 + primeiro.centavos;
}

/* ------------------------------------------------------------------ contas */

const PREPOSICOES = new Set(['no', 'na', 'do', 'da', 'em', 'pelo', 'pela', 'para', 'pro', 'pra', 'o', 'a', 'de']);

interface ContaAchada {
  id: string;
  posicao: number;
}

function lerContas(palavras: Palavra[], contas: readonly ContaDaFala[]): ContaAchada[] {
  // Nome mais longo primeiro: "Cartão Nubank" tem de ganhar de "Nubank".
  const alvos = contas
    .map((conta) => ({ id: conta.id, palavras: separar(conta.name).map((p) => p.norm) }))
    .filter((alvo) => alvo.palavras.length > 0)
    .sort((a, b) => b.palavras.length - a.palavras.length);

  const achadas: ContaAchada[] = [];
  for (const alvo of alvos) {
    for (let i = 0; i + alvo.palavras.length <= palavras.length; i += 1) {
      const trecho = palavras.slice(i, i + alvo.palavras.length);
      if (trecho.some((p) => p.usada)) continue;
      if (!trecho.every((p, j) => p.norm === alvo.palavras[j])) continue;

      let inicio = i;
      // As preposições antes do nome vão embora com ele: sem isso a descrição
      // de "mercado no Nubank" ficaria "mercado no".
      while (inicio > 0 && !palavras[inicio - 1]!.usada && PREPOSICOES.has(palavras[inicio - 1]!.norm)) {
        inicio -= 1;
      }
      marcar(palavras, inicio, i + alvo.palavras.length);
      achadas.push({ id: alvo.id, posicao: i });
      break;
    }
  }
  return achadas.sort((a, b) => a.posicao - b.posicao);
}

/* --------------------------------------------------------------- categoria */

function lerCategoria(
  palavras: Palavra[],
  categorias: readonly CategoriaDaFala[],
  kind: EntryKind | null,
): string | null {
  const doTipo = categorias.filter(
    (c) => kind === null || kind === 'transfer' || c.kind === (kind === 'income' ? 'income' : 'expense'),
  );
  const alvos = doTipo
    .map((c) => ({ id: c.id, palavras: separar(c.name).map((p) => p.norm) }))
    .filter((alvo) => alvo.palavras.length > 0)
    .sort((a, b) => b.palavras.length - a.palavras.length);

  for (const alvo of alvos) {
    for (let i = 0; i + alvo.palavras.length <= palavras.length; i += 1) {
      const trecho = palavras.slice(i, i + alvo.palavras.length);
      if (trecho.some((p) => p.usada)) continue;
      if (!trecho.every((p, j) => p.norm === alvo.palavras[j])) continue;
      // O nome da categoria **fica** na descrição: quem diz "mercado" quer que
      // o lançamento se chame Mercado, não que o nome desapareça. Só sai do
      // texto quando a frase o anunciou como categoria — e aí a palavra
      // "categoria" sai com ele, que também não é nome de nada.
      const anunciador = [i - 1, i - 2].find(
        (k) => k >= 0 && !palavras[k]!.usada && palavras[k]!.norm === 'categoria',
      );
      if (anunciador !== undefined) marcar(palavras, anunciador, i + alvo.palavras.length);
      return alvo.id;
    }
  }
  return null;
}

/* ------------------------------------------------------------------- tipo */

function lerTipo(palavras: Palavra[], contasAchadas: number): EntryKind | null {
  // Quem fala diz o verbo primeiro, então vale a pista que aparece antes. Em
  // empate de posição ganha a expressão, que é mais específica que a palavra
  // solta que a compõe: "chegou na conta" sabe mais do que "chegou".
  let escolhido: EntryKind | null = null;
  let onde = Number.POSITIVE_INFINITY;
  let vencedora: Expressao | null = null;

  for (const expressao of EXPRESSOES) {
    const i = procurarSequencia(palavras, expressao.palavras);
    if (i !== -1 && i < onde) {
      onde = i;
      escolhido = expressao.kind;
      vencedora = expressao;
    }
  }
  // A expressão inteira sai do texto: "caiu na conta o salário" tem de virar
  // "Salário", e não "Conta o salário". Só a vencedora, porque as outras
  // podem ter casado em cima do que é nome.
  if (vencedora) marcar(palavras, onde, onde + vencedora.palavras.length);

  palavras.forEach((palavra, i) => {
    if (palavra.usada || i >= onde) return;
    // Transferência precisa das duas contas; sem isso a frase é só "mandei"
    // alguma coisa, e o palpite erraria o tipo e a conta de uma vez. Os
    // mesmos verbos estão em `INDICAM_SAIDA`, que é onde eles caem então.
    if (INDICAM_TRANSFERENCIA.has(palavra.norm) && contasAchadas >= 2) {
      onde = i;
      escolhido = 'transfer';
      return;
    }
    if (INDICAM_ENTRADA.has(palavra.norm)) {
      onde = i;
      escolhido = 'income';
      return;
    }
    if (INDICAM_SAIDA.has(palavra.norm)) {
      onde = i;
      escolhido = 'expense';
    }
  });

  // Os verbos saem do texto de qualquer modo: eles não são nome de nada, e
  // sobrariam na descrição ("Paguei o mercado"). Os substantivos que indicam o
  // tipo — salário, estorno, rendimento — ficam, porque são o nome.
  for (const palavra of palavras) {
    if (!palavra.usada && VERBOS.has(palavra.norm)) palavra.usada = true;
  }

  return escolhido;
}

/** Onde `agulha` começa dentro das palavras ainda não usadas; -1 se não está. */
function procurarSequencia(palavras: readonly Palavra[], agulha: readonly string[]): number {
  for (let i = 0; i + agulha.length <= palavras.length; i += 1) {
    const trecho = palavras.slice(i, i + agulha.length);
    if (trecho.some((p) => p.usada)) continue;
    if (trecho.every((p, j) => p.norm === agulha[j])) return i;
  }
  return -1;
}

/* ------------------------------------------------------------------- pago */

function lerPago(palavras: readonly Palavra[]): boolean | null {
  const norms = palavras.map((p) => p.norm);
  const tem = (...seq: string[]) => {
    for (let i = 0; i + seq.length <= norms.length; i += 1) {
      if (seq.every((palavra, j) => norms[i + j] === palavra)) return true;
    }
    return false;
  };

  if (tem('ainda', 'nao') || tem('nao', 'paguei') || tem('vou', 'pagar') || tem('a', 'pagar')) return false;
  if (tem('vence') || tem('vencimento') || tem('previsto') || tem('previsao')) return false;

  if (
    tem('ja', 'paguei') || tem('ja', 'pagamos') || tem('ja', 'foi', 'pago') || tem('ja', 'esta', 'pago')
    || tem('ja', 'recebi') || tem('ja', 'recebemos') || tem('ja', 'caiu') || tem('ja', 'entrou')
    || tem('ja', 'saiu') || tem('ja', 'debitou') || tem('quitado') || tem('quitei')
  ) {
    return true;
  }
  return null;
}

/* -------------------------------------------------------------- descrição */

function montarDescricao(palavras: readonly Palavra[]): string {
  let sobra = palavras.filter((p) => !p.usada).map((p) => p.bruto.replace(PONTUACAO, ''));
  // O recheio sai só das pontas: "conta de luz" tem de continuar "conta de
  // luz", e tirar o "de" do meio quebraria o nome.
  const ponta = () => sobra.length > 0 && RECHEIO.has(chaveDeNome(sobra[0]!));
  const fundo = () => sobra.length > 0 && RECHEIO.has(chaveDeNome(sobra[sobra.length - 1]!));
  while (ponta()) sobra = sobra.slice(1);
  while (fundo()) sobra = sobra.slice(0, -1);

  const texto = sobra.join(' ').trim();
  if (texto) return texto.charAt(0).toUpperCase() + texto.slice(1);

  // Sem nada à mostra, o verbo pode ser o nome — "almocei" é "Almoço".
  for (const palavra of palavras) {
    const nome = NOME_DO_VERBO[palavra.norm];
    if (nome) return nome;
  }
  return '';
}

/* ----------------------------------------------------------------- entrada */

/**
 * A ordem das leituras não é arbitrária.
 *
 * A **data** vai primeiro porque é ela que tira "ontem" e "dia 5" do caminho —
 * se o valor fosse lido antes, "dia 5" seria lido como cinco reais. Depois as
 * **contas**, porque o nome de um banco pode ter número dentro. Só então o
 * **valor**, que pega o número que restou.
 */
export function interpretarFala(texto: string, ctx: ContextoDaFala): FalaEntendida {
  const palavras = separar(texto);
  const achados: string[] = [];

  const date = lerData(palavras, ctx.hoje);
  const contasAchadas = lerContas(palavras, ctx.contas);
  const amount = lerValor(palavras);
  const kind = lerTipo(palavras, contasAchadas.length);
  const categoryId = lerCategoria(palavras, ctx.categorias, kind);
  const settled = lerPago(palavras);
  const description = montarDescricao(palavras);

  if (amount !== null) achados.push(formatMoney(amount));
  if (date !== null) achados.push(nomeDaData(date, ctx.hoje));
  if (kind !== null) achados.push({ income: 'entrada', expense: 'saída', transfer: 'transferência' }[kind]);
  for (const achada of contasAchadas) {
    const conta = ctx.contas.find((c) => c.id === achada.id);
    if (conta) achados.push(conta.name);
  }
  if (categoryId !== null) {
    const categoria = ctx.categorias.find((c) => c.id === categoryId);
    if (categoria) achados.push(categoria.name);
  }
  if (settled === true) achados.push('já paguei');

  return {
    texto: texto.trim(),
    amount,
    date,
    description,
    kind,
    accountId: contasAchadas[0]?.id ?? null,
    toAccountId: kind === 'transfer' ? contasAchadas[1]?.id ?? null : null,
    categoryId,
    settled,
    achados,
  };
}

function nomeDaData(date: string, hoje: string): string {
  if (date === hoje) return 'hoje';
  if (date === addDays(hoje, -1)) return 'ontem';
  if (date === addDays(hoje, 1)) return 'amanhã';
  const { day, month } = parseISO(date);
  return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}`;
}
