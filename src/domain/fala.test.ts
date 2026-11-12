import { describe, expect, it } from 'vitest';

import { interpretarFala, type ContextoDaFala } from './fala.ts';
import { formatMoney } from './money.ts';

const CTX: ContextoDaFala = {
  hoje: '2026-11-11',
  contas: [
    { id: 'cc', name: 'Nubank' },
    { id: 'cartao', name: 'Cartão Nubank' },
    { id: 'itau', name: 'Itaú' },
    { id: 'carteira', name: 'Carteira' },
  ],
  categorias: [
    { id: 'alim', name: 'Alimentação', kind: 'expense' },
    { id: 'transp', name: 'Transporte', kind: 'expense' },
    { id: 'sal', name: 'Salário', kind: 'income' },
  ],
};

const ler = (texto: string) => interpretarFala(texto, CTX);

describe('valor', () => {
  it('lê o número escrito em dígitos', () => {
    expect(ler('mercado 45 reais').amount).toBe(4500);
  });

  it('lê o número escrito por extenso', () => {
    expect(ler('mercado quarenta e cinco reais').amount).toBe(4500);
    expect(ler('aluguel mil e duzentos reais').amount).toBe(120000);
    expect(ler('carro dois mil e quinhentos reais').amount).toBe(250000);
    expect(ler('cento e trinta reais').amount).toBe(13000);
  });

  it('mil sozinho é mil, não zero', () => {
    expect(ler('aluguel mil reais').amount).toBe(100000);
  });

  it('lê os centavos ditos depois dos reais', () => {
    expect(ler('gasolina cem reais e cinquenta').amount).toBe(10050);
    expect(ler('gasolina cem reais e cinquenta centavos').amount).toBe(10050);
    expect(ler('pão oitenta centavos').amount).toBe(80);
  });

  it('lê os centavos escritos com vírgula', () => {
    expect(ler('mercado 45,90 reais').amount).toBe(4590);
    expect(ler('mercado 1.250,00 reais').amount).toBe(125000);
  });

  it('aceita o símbolo colado no número', () => {
    expect(ler('mercado R$45,90').amount).toBe(4590);
    expect(ler('mercado R$ 45,90').amount).toBe(4590);
  });

  it('aceita o número sem a palavra reais', () => {
    expect(ler('uber 23').amount).toBe(2300);
  });

  it('não confunde o dia com o valor', () => {
    const fala = ler('mercado dia 5 quarenta reais');
    expect(fala.amount).toBe(4000);
    expect(fala.date).toBe('2026-11-05');
  });

  it('pega o número que está junto de "reais", e não o primeiro da frase', () => {
    // "dia 20" é data; o valor é o 30 que vem com "reais".
    const fala = ler('luz dia 20 trinta reais');
    expect(fala.amount).toBe(3000);
    expect(fala.date).toBe('2026-11-20');
  });

  it('não soma dois números grudados que não formam um número', () => {
    // "luz 20 180 reais" é o que sai quando o reconhecedor engole a palavra
    // "dia". Somar daria R$ 200,00 — um valor que ninguém disse. Em português
    // os números se compõem em ordem decrescente ("cento e trinta"), então 180
    // depois de 20 começa outro número, e o que está junto de "reais" vence.
    expect(ler('luz 20 180 reais').amount).toBe(18000);
    // O 20 que sobrou fica no nome, à vista: é a pista de que o reconhecedor
    // ouviu um número ali, e some com uma tecla.
    expect(ler('luz 20 180 reais').description).toBe('Luz 20');
  });

  it('devolve nulo quando não há número', () => {
    expect(ler('mercado').amount).toBeNull();
  });
});

describe('data', () => {
  it('entende os dias relativos', () => {
    expect(ler('mercado 10 reais hoje').date).toBe('2026-11-11');
    expect(ler('mercado 10 reais ontem').date).toBe('2026-11-10');
    expect(ler('mercado 10 reais anteontem').date).toBe('2026-11-09');
    expect(ler('mercado 10 reais amanhã').date).toBe('2026-11-12');
    expect(ler('mercado 10 reais depois de amanhã').date).toBe('2026-11-13');
  });

  it('entende "dia N" no mês corrente', () => {
    expect(ler('aluguel dia 5 mil reais').date).toBe('2026-11-05');
    expect(ler('aluguel dia cinco mil reais').date).toBe('2026-11-05');
  });

  it('entende dia e mês', () => {
    expect(ler('ipva dia 5 de janeiro 300 reais').date).toBe('2027-01-05');
    expect(ler('ipva primeiro de março 300 reais').date).toBe('2027-03-01');
  });

  it('escolhe o ano que cai mais perto de hoje', () => {
    // Em 11/11/2026: "janeiro" é o que vem (55 dias), não o que passou (310).
    expect(ler('ipva 5 de janeiro 300 reais').date).toBe('2027-01-05');
    // E "outubro" é o que passou (37 dias), não o que vem (328).
    expect(ler('ipva 5 de outubro 300 reais').date).toBe('2026-10-05');
  });

  it('escolhe o mês que cai mais perto quando a frase só diz o dia', () => {
    // A mesma regra da distância, aplicada ao mês: em 11/11, "dia 5" é o
    // deste mês (6 dias atrás) e "dia 30" é o do mês passado (12 dias atrás),
    // mais perto que o deste mês (19 dias à frente). Nunca erra por mais de um
    // mês, e a data preenchida fica à vista para quem falou conferir.
    expect(ler('aluguel dia 5 mil reais').date).toBe('2026-11-05');
    expect(ler('luz dia 30 cem reais').date).toBe('2026-10-30');
  });

  it('entende a data escrita com barra', () => {
    expect(ler('mercado 45 reais 05/10').date).toBe('2026-10-05');
    expect(ler('mercado 45 reais 05/10/2025').date).toBe('2025-10-05');
  });

  it('recusa a data que não existe', () => {
    expect(ler('mercado 45 reais 32/10').date).toBeNull();
    expect(ler('mercado 45 reais 30/02').date).toBeNull();
  });

  it('não vê data onde só há valor', () => {
    expect(ler('mercado quarenta e cinco reais').date).toBeNull();
    expect(ler('mercado dez reais').date).toBeNull();
  });

  it('devolve nulo sem nenhuma pista de data', () => {
    expect(ler('mercado 45 reais').date).toBeNull();
  });
});

describe('descrição', () => {
  it('sobra só o nome, com a primeira letra maiúscula', () => {
    expect(ler('paguei o mercado quarenta e cinco reais ontem').description).toBe('Mercado');
    expect(ler('gastei 30 reais de gasolina').description).toBe('Gasolina');
    expect(ler('recebi o salário de 5 mil reais').description).toBe('Salário');
  });

  it('mantém as palavras do meio', () => {
    expect(ler('paguei a conta de luz 180 reais').description).toBe('Conta de luz');
  });

  it('não some com a descrição quando ela é a única palavra', () => {
    // "conta" é verbo da lista de saída e também o nome do lançamento.
    expect(ler('conta 50 reais').description).toBe('Conta');
  });

  it('tira o nome da conta de dentro da descrição', () => {
    expect(ler('mercado 45 reais no Nubank').description).toBe('Mercado');
  });

  it('fica vazia quando a frase não tem nome', () => {
    expect(ler('45 reais').description).toBe('');
  });
});

describe('tipo', () => {
  it('reconhece a entrada', () => {
    expect(ler('recebi 5 mil reais de salário').kind).toBe('income');
    expect(ler('caiu o salário de 5 mil reais').kind).toBe('income');
    expect(ler('entrou 200 reais de estorno').kind).toBe('income');
  });

  it('reconhece a saída', () => {
    expect(ler('paguei 45 reais de mercado').kind).toBe('expense');
    expect(ler('comprei um fone de 200 reais').kind).toBe('expense');
  });

  it('devolve nulo quando a frase não diz', () => {
    expect(ler('mercado 45 reais').kind).toBeNull();
  });

  it('aceita as muitas formas de dizer que saiu dinheiro', () => {
    for (const frase of [
      'gastei 45 reais no mercado',
      'torrei 45 reais no mercado',
      'comprei 45 reais de pão',
      'quitei 45 reais da fatura',
      'desembolsei 45 reais',
      'custou 45 reais',
      'me cobraram 45 reais',
      'descontaram 45 reais',
      'debitou 45 reais',
      'saiu da conta 45 reais',
      'foi descontado 45 reais',
      'passei no cartão 45 reais',
      'fiz um pix de 45 reais',
      'almocei 45 reais',
      'abasteci 45 reais',
      'emprestei 45 reais para o João',
      'dei entrada de 45 reais',
    ]) {
      expect(ler(frase).kind, frase).toBe('expense');
    }
  });

  it('aceita as muitas formas de dizer que entrou dinheiro', () => {
    for (const frase of [
      'recebi 45 reais',
      'caiu na conta 45 reais',
      'chegou na conta 45 reais',
      'chegou para minha conta 45 reais',
      'entrou na conta 45 reais',
      'pingou na conta 45 reais',
      'me pagaram 45 reais',
      'me depositaram 45 reais',
      'creditaram 45 reais',
      'ganhei 45 reais',
      'vendi a bicicleta por 45 reais',
      'estornaram 45 reais',
      'me devolveram 45 reais',
      'reembolsaram 45 reais',
      'rendeu 45 reais',
      'décimo terceiro 45 reais',
      'comissão de 45 reais',
    ]) {
      expect(ler(frase).kind, frase).toBe('income');
    }
  });

  it('a mesma palavra decide pelo que vem depois dela', () => {
    // "Chegou na conta" é dinheiro entrando; "chegou a conta de luz" é a
    // fatura chegando. Pôr "chegou" solto na lista de entrada transformaria
    // toda conta que chega num dinheiro que entrou.
    expect(ler('chegou na conta 2 mil reais').kind).toBe('income');
    expect(ler('chegou a conta de luz 180 reais').kind).not.toBe('income');
    // "Pagaram a conta" é gasto; "me pagaram" é recebimento.
    expect(ler('me pagaram 500 reais').kind).toBe('income');
    expect(ler('pagamos 500 reais do aluguel').kind).toBe('expense');
  });

  it('mandar dinheiro sem duas contas é saída, não transferência', () => {
    const fala = ler('mandei 200 reais para o João');
    expect(fala.kind).toBe('expense');
    expect(fala.toAccountId).toBeNull();
    // Com as duas contas, continua sendo transferência.
    expect(ler('mandei 200 reais do Nubank para o Itaú').kind).toBe('transfer');
  });

  it('o verbo novo sai da descrição, e o substantivo fica', () => {
    expect(ler('gastei 30 reais de gasolina').description).toBe('Gasolina');
    // Sem substantivo nenhum na frase, o verbo vira o nome — mas só este
    // punhado em que a tradução é óbvia.
    expect(ler('almocei 30 reais').description).toBe('Almoço');
    expect(ler('abasteci 200 reais').description).toBe('Combustível');
    // "Paguei" não vira nome: pagar o quê é o que a frase não disse.
    expect(ler('paguei 50 reais').description).toBe('');
    expect(ler('caiu na conta o salário de 5 mil reais').description).toBe('Salário');
    expect(ler('estornaram 45 reais da compra').description).toBe('Compra');
  });

  it('só é transferência com as duas contas', () => {
    const duas = ler('transferi 500 reais do Nubank para o Itaú');
    expect(duas.kind).toBe('transfer');
    expect(duas.accountId).toBe('cc');
    expect(duas.toAccountId).toBe('itau');

    const uma = ler('transferi 500 reais do Nubank');
    expect(uma.kind).not.toBe('transfer');
    expect(uma.toAccountId).toBeNull();
  });
});

describe('conta', () => {
  it('acha a conta pelo nome', () => {
    expect(ler('mercado 45 reais no Nubank').accountId).toBe('cc');
    expect(ler('mercado 45 reais no Itaú').accountId).toBe('itau');
  });

  it('prefere o nome mais longo', () => {
    expect(ler('mercado 45 reais no Cartão Nubank').accountId).toBe('cartao');
  });

  it('não inventa conta', () => {
    expect(ler('mercado 45 reais').accountId).toBeNull();
  });
});

describe('categoria', () => {
  it('acha a categoria pelo nome e mantém a palavra na descrição', () => {
    const fala = ler('paguei 45 reais de transporte');
    expect(fala.categoryId).toBe('transp');
    expect(fala.description).toBe('Transporte');
  });

  it('tira a palavra quando a frase anuncia a categoria', () => {
    const fala = ler('uber 23 reais categoria transporte');
    expect(fala.categoryId).toBe('transp');
    expect(fala.description).toBe('Uber');
  });

  it('respeita o tipo: categoria de entrada não entra em saída', () => {
    expect(ler('paguei 45 reais de salário').categoryId).toBeNull();
    expect(ler('recebi 45 reais de salário').categoryId).toBe('sal');
  });
});

describe('já pago', () => {
  it('só marca com a frase que não deixa dúvida', () => {
    expect(ler('já paguei o mercado 45 reais').settled).toBe(true);
    expect(ler('mercado 45 reais já foi pago').settled).toBe(true);
    expect(ler('já recebi o salário 5 mil reais').settled).toBe(true);
  });

  it('não marca no passado simples, que é como se narra qualquer gasto', () => {
    expect(ler('paguei o mercado 45 reais').settled).toBeNull();
    expect(ler('comprei um fone 200 reais').settled).toBeNull();
  });

  it('desmarca quando a frase diz que ainda não', () => {
    expect(ler('luz 180 reais vence dia 20').settled).toBe(false);
    expect(ler('luz 180 reais ainda não paguei').settled).toBe(false);
    expect(ler('luz 180 reais a pagar').settled).toBe(false);
  });
});

describe('achados', () => {
  it('lista em português o que foi entendido', () => {
    const fala = ler('paguei o mercado quarenta e cinco reais ontem no Nubank');
    expect(fala.achados).toContain(formatMoney(4500));
    expect(fala.achados).toContain('ontem');
    expect(fala.achados).toContain('saída');
    expect(fala.achados).toContain('Nubank');
  });

  it('não lista o que não foi entendido', () => {
    expect(ler('mercado').achados).toHaveLength(0);
  });
});

describe('frases inteiras', () => {
  it('a frase mais comum sai pronta', () => {
    const fala = ler('paguei o mercado quarenta e cinco reais e noventa centavos ontem no Cartão Nubank');
    expect(fala).toMatchObject({
      amount: 4590,
      date: '2026-11-10',
      description: 'Mercado',
      kind: 'expense',
      accountId: 'cartao',
    });
  });

  it('o salário também', () => {
    const fala = ler('recebi o salário de cinco mil reais dia 5 no Itaú');
    expect(fala).toMatchObject({
      amount: 500000,
      date: '2026-11-05',
      description: 'Salário',
      kind: 'income',
      accountId: 'itau',
      categoryId: 'sal',
    });
  });

  it('texto vazio não quebra nada', () => {
    const fala = interpretarFala('   ', CTX);
    expect(fala).toMatchObject({ amount: null, date: null, description: '', kind: null, accountId: null });
  });
});
