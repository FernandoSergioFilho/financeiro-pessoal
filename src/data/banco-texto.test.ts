import { describe, expect, it } from 'vitest';

import { acharData, acharValores, anoDeReferencia, lerLinhasSoltas } from './banco-texto.ts';
// `agruparEmLinhas` é pura e não puxa o pdf.js: o import dele é dinâmico,
// dentro da função que lê o PDF.
import { agruparEmLinhas } from './banco-pesados.ts';

const HOJE = '2026-09-12';

describe('acharValores', () => {
  it('acha o valor brasileiro com e sem R$', () => {
    expect(acharValores('PIX R$ 1.250,00').map((v) => v.valor)).toEqual([125000]);
    expect(acharValores('MERCADO 70,00').map((v) => v.valor)).toEqual([7000]);
  });

  it('lê o sinal do menos, inclusive o traço longo que o PDF usa', () => {
    expect(acharValores('COMPRA -70,00')[0]!.valor).toBe(-7000);
    expect(acharValores('COMPRA −70,00')[0]!.valor).toBe(-7000);
  });

  it('lê o D de débito e o C de crédito, que é como o extrato escreve', () => {
    expect(acharValores('SAQUE 200,00 D')[0]!.valor).toBe(-20000);
    expect(acharValores('DEPOSITO 200,00 C')[0]!.valor).toBe(20000);
  });

  /*
   * Exigir a vírgula decimal não é capricho: sem isso o "12" de "PARCELA 3/12"
   * e o "2026" de uma data viram valores, e o extrato importa lixo.
   */
  it('número sem centavos não é dinheiro', () => {
    expect(acharValores('NETSHOES PARCELA 3/12')).toEqual([]);
    expect(acharValores('COMPRA EM 07/09/2026')).toEqual([]);
  });

  it('acha os dois números de uma linha de extrato, na ordem', () => {
    expect(acharValores('PIX 1.250,00 3.480,12').map((v) => v.valor)).toEqual([125000, 348012]);
  });
});

describe('acharData', () => {
  it('lê os formatos que os bancos usam', () => {
    expect(acharData('07/09/2026 PIX', 2026)?.iso).toBe('2026-09-07');
    expect(acharData('2026-09-07 PIX', 2026)?.iso).toBe('2026-09-07');
    expect(acharData('07-09-2026 PIX', 2026)?.iso).toBe('2026-09-07');
    expect(acharData('07 set 2026 PIX', 2026)?.iso).toBe('2026-09-07');
    expect(acharData('7 de setembro de 2026', 2026)?.iso).toBe('2026-09-07');
  });

  it('ano de dois dígitos é deste século', () => {
    expect(acharData('07/09/26 PIX', 2026)?.iso).toBe('2026-09-07');
  });

  /*
   * O print da tela de um banco quase nunca traz o ano — mostra "07/09" e
   * pronto. Sem o ano de referência, esses lançamentos cairiam no ano errado.
   */
  it('sem ano na linha, usa o de referência', () => {
    expect(acharData('07/09 PIX RECEBIDO', 2025)?.iso).toBe('2025-09-07');
    expect(acharData('07 set PIX', 2025)?.iso).toBe('2025-09-07');
  });

  it('data impossível não é data', () => {
    expect(acharData('CONTA 45/13/2026', 2026)).toBeNull();
  });

  it('linha sem data nenhuma devolve nulo', () => {
    expect(acharData('SALDO ANTERIOR', 2026)).toBeNull();
  });
});

describe('anoDeReferencia', () => {
  it('sai de uma data completa do próprio texto', () => {
    expect(anoDeReferencia(['Extrato de 01/08/2024 a 31/08/2024', '07/08 PIX 10,00'], HOJE)).toBe(2024);
  });

  it('sem nenhuma, assume o ano corrente', () => {
    expect(anoDeReferencia(['07/09 PIX 10,00'], HOJE)).toBe(2026);
  });
});

describe('lerLinhasSoltas', () => {
  /*
   * O caso que dá nome ao módulo: o último número de cada linha é o saldo
   * corrente, e importá-lo lançaria R$ 3.480,12 de PIX. A decisão não é linha
   * a linha, é pelo formato do arquivo inteiro.
   */
  const extrato = [
    'BANCO EXEMPLO S.A. — EXTRATO DE CONTA CORRENTE',
    'Agência 0001 Conta 12345-6',
    'Data Histórico Valor Saldo',
    '07/09/2026 PIX RECEBIDO MARIA SILVA 1.250,00 3.480,12',
    '08/09/2026 SUPERMERCADO BOM PRECO 70,00 3.410,12',
    '09/09/2026 ALUGUEL SETEMBRO 1.200,00 2.210,12',
    'SALDO EM 09/09/2026: 2.210,12',
  ].join('\n');

  it('o último número é saldo, e não vira lançamento', () => {
    const lido = lerLinhasSoltas(extrato, HOJE);
    expect(lido.linhas.map((l) => l.valor)).toEqual([125000, -7000, -120000]);
  });

  /*
   * O sinal vem do saldo subindo ou descendo. É a leitura mais confiável que
   * existe aqui: não depende de o banco escrever menos, "D", ou pintar de
   * vermelho — o que o texto não guarda.
   */
  it('o sinal sai do saldo, quando o número não traz', () => {
    const lido = lerLinhasSoltas(extrato, HOJE);
    expect(lido.linhas[0]!.valor).toBeGreaterThan(0); // o saldo subiu
    expect(lido.linhas[1]!.valor).toBeLessThan(0); // o saldo desceu
  });

  it('a descrição é o que sobra depois da data e dos números', () => {
    const lido = lerLinhasSoltas(extrato, HOJE);
    expect(lido.linhas.map((l) => l.descricao)).toEqual([
      'PIX RECEBIDO MARIA SILVA',
      'SUPERMERCADO BOM PRECO',
      'ALUGUEL SETEMBRO',
    ]);
  });

  /*
   * Num PDF de extrato a maior parte da página é cabeçalho, rodapé, endereço
   * da agência e texto legal. Relatar cada uma como problema encheria a tela
   * de ruído e esconderia o que importa.
   */
  it('o cabeçalho e o rodapé são ignorados em silêncio, não viram problema', () => {
    const lido = lerLinhasSoltas(extrato, HOJE);
    expect(lido.problemas).toEqual([]);
    expect(lido.ignoradas).toBeGreaterThan(0);
  });

  it('com um número por linha, ele é o valor', () => {
    const lido = lerLinhasSoltas(
      ['07/09/2026 UBER -32,90', '08/09/2026 SALARIO 4.000,00'].join('\n'),
      HOJE,
    );
    expect(lido.linhas.map((l) => l.valor)).toEqual([-3290, 400000]);
  });

  it('print de celular, sem ano e sem saldo', () => {
    const lido = lerLinhasSoltas(
      ['Hoje', '07/09 Mercado Pao de Acucar R$ 145,30', '06/09 Uber R$ 21,40'].join('\n'),
      HOJE,
    );
    expect(lido.linhas.map((l) => [l.data, l.descricao, l.valor])).toEqual([
      ['2026-09-07', 'Mercado Pao de Acucar', 14530],
      ['2026-09-06', 'Uber', 2140],
    ]);
  });

  /*
   * Entre dois lançamentos que deram certo, a linha que falhou era para ser
   * um lançamento — e dizer isso ajuda. Já uma linha sozinha que não deu em
   * nada não tem com o que ser comparada: aí quem fala é o chamador, com o
   * "não achei nenhum lançamento nesse texto".
   */
  it('no meio de lançamentos que deram certo, a linha sem valor vira problema', () => {
    const lido = lerLinhasSoltas(
      ['07/09/2026 MERCADO 70,00', '08/09/2026 COMPRA SEM VALOR', '09/09/2026 UBER 21,40'].join('\n'),
      HOJE,
    );
    expect(lido.problemas).toHaveLength(1);
    expect(lido.problemas[0]!.motivo).toContain('nenhum valor');
  });

  /*
   * "SALDO EM 09/09/2026: 2.210,12" tem data e valor, e entrava como uma
   * receita do tamanho da conta inteira. É resumo, não lançamento.
   */
  it('a linha de saldo do rodapé não vira lançamento', () => {
    const lido = lerLinhasSoltas(extrato, HOJE);
    expect(lido.linhas.map((l) => l.descricao)).not.toContain('SALDO EM');
  });

  it('reconhece os outros resumos de fatura', () => {
    const lido = lerLinhasSoltas(
      [
        '07/09/2026 MERCADO 70,00',
        '07/09/2026 Total da fatura 1.234,00',
        '07/09/2026 Limite disponivel 5.000,00',
        '07/09/2026 Pagamento minimo 123,40',
      ].join('\n'),
      HOJE,
    );
    expect(lido.linhas.map((l) => l.descricao)).toEqual(['MERCADO']);
  });

  /*
   * O outro lado da moeda: "TOTAL EXPRESS" é transportadora, e apagá-la
   * perderia uma compra de verdade. Resumo é descrição curta.
   */
  it('não confunde uma loja chamada "Total" com um resumo', () => {
    const lido = lerLinhasSoltas('07/09/2026 TOTAL EXPRESS ENTREGA DE ENCOMENDA 45,90', HOJE);
    expect(lido.linhas.map((l) => l.descricao)).toEqual(['TOTAL EXPRESS ENTREGA DE ENCOMENDA']);
  });

  it('texto vazio não inventa nada', () => {
    expect(lerLinhasSoltas('   \n  \n', HOJE).linhas).toEqual([]);
  });

  it('diz como leu, para dar para conferir', () => {
    expect(lerLinhasSoltas(extrato, HOJE).formato?.colunaValor).toContain('saldo');
    expect(lerLinhasSoltas('07/09/2026 UBER -32,90', HOJE).formato?.colunaValor).toBe('o valor da linha');
  });
});

describe('agruparEmLinhas', () => {
  /*
   * O PDF não guarda linhas: guarda pedacinhos de texto com uma posição cada.
   * A data, a descrição e o valor de um mesmo lançamento são três itens
   * separados — sem reagrupar por altura, chegariam como três "linhas", nenhuma
   * delas com data e valor juntos, e o leitor não acharia nada.
   */
  const item = (str: string, x: number, y: number) => ({ str, transform: [1, 0, 0, 1, x, y] });

  it('junta pela altura e ordena pela horizontal', () => {
    expect(
      agruparEmLinhas([
        item('1.250,00', 400, 700),
        item('07/09/2026', 40, 700),
        item('PIX RECEBIDO', 120, 700),
      ]),
    ).toBe('07/09/2026 PIX RECEBIDO 1.250,00');
  });

  it('lê de cima para baixo, e não na ordem em que o PDF guardou', () => {
    expect(agruparEmLinhas([item('segunda', 40, 600), item('primeira', 40, 700)]))
      .toBe('primeira\nsegunda');
  });

  /*
   * O mesmo texto raramente está no mesmo pixel: fonte de tamanhos diferentes
   * na mesma linha desloca a base em alguns décimos. Sem tolerância, cada
   * pedaço viraria a sua própria linha.
   */
  it('tolera a diferença de altura dentro da mesma linha', () => {
    expect(agruparEmLinhas([item('R$', 40, 700), item('10,00', 60, 701.8)]))
      .toBe('R$ 10,00');
  });

  it('espaço em branco não vira linha', () => {
    expect(agruparEmLinhas([item('   ', 40, 700), item('a', 40, 600)])).toBe('a');
  });
});

/**
 * A fatura do Santander, que é o caso real que motivou tudo isto.
 *
 * As coordenadas são as medidas na fatura de verdade: duas colunas de
 * lançamentos lado a lado (x≈33 e x≈327), cada uma com suas próprias colunas
 * de marcador do cartão, data, descrição, parcela e valor. A página tem 595
 * pontos de largura e o vão entre as colunas fica em x≈277.
 */
describe('a fatura do Santander', () => {
  const item = (str: string, x: number, y: number) => ({ str, transform: [1, 0, 0, 1, x, y], width: str.length * 4 });

  /** Uma linha de lançamento, nas posições reais de uma das duas colunas. */
  function lancamento(coluna: 'esq' | 'dir', y: number, cartao: string, data: string, desc: string, parcela: string, valor: string) {
    const base = coluna === 'esq' ? 0 : 294;
    const itens = [item(data, base + 33, y), item(desc, base + 52, y), item(valor, base + 206, y)];
    if (cartao) itens.push(item(cartao, base + 17, y));
    if (parcela) itens.push(item(parcela, base + 168, y));
    return itens;
  }

  const pagina = [
    ...lancamento('esq', 472, '', '16/07', 'JIM COM* PAULA CRISTI', '', '-0,02'),
    ...lancamento('dir', 472, '', '18/07', 'IFD*RAIA DROGASIL S/A', '02/04', '15,77'),
    ...lancamento('esq', 460, '', '17/08', 'DEB AUTOM DE FATURA EM C/', '', '-1.977,95'),
    ...lancamento('dir', 460, '', '11/08', 'MERCADO*MERCADOLIVRE', '01/06', '51,20'),
    ...lancamento('esq', 413, '3', '26/12', 'A R G BIGUACU COMERCIO', '09/10', '96,42'),
    ...lancamento('dir', 413, '', '12/08', 'PANVEL*DIGITAL', '03/05', '58,66'),
    ...lancamento('esq', 401, '3', '15/04', 'LOCCITANE CONTINENTE S', '05/10', '27,99'),
    ...lancamento('dir', 401, '', '12/08', 'PANVEL*DIGITAL', '04/05', '58,66'),
  ];

  const lido = () => lerLinhasSoltas(agruparEmLinhas(pagina), '2026-09-12');

  /*
   * O defeito que a fatura de verdade revelou. Agrupar só pela altura fundia
   * as duas colunas numa linha só —
   *
   *     16/07 JIM COM* PAULA CRISTI -0,02  18/07 IFD*RAIA DROGASIL 02/04 15,77
   *
   * — e saía um lançamento com a data de um e o valor do outro. Pior do que
   * não importar, porque parece certo.
   */
  it('as duas colunas viram lançamentos separados, e não um só', () => {
    expect(lido().linhas).toHaveLength(8);
  });

  it('cada lançamento fica com o próprio valor', () => {
    const porDescricao = new Map(lido().linhas.map((l) => [l.descricao.split(' ')[0], l.valor]));
    expect(porDescricao.get('JIM')).toBe(-2);
    expect(porDescricao.get('IFD*RAIA')).toBe(1577);
    expect(porDescricao.get('DEB')).toBe(-197795);
    expect(porDescricao.get('MERCADO*MERCADOLIVRE')).toBe(5120);
  });

  /*
   * A fatura traz a data **original** da compra parcelada: "26/12" numa fatura
   * de setembro de 2026 é o Natal que passou. Sem o recuo, a parcela 9/10
   * entrava em dezembro de 2026 e sumia do mês que a pessoa está olhando.
   */
  it('a compra de 26/12 é do ano passado, e não do que vem', () => {
    const natal = lido().linhas.find((l) => l.descricao.startsWith('A R G'));
    expect(natal?.data).toBe('2025-12-26');
  });

  /*
   * Fatura com mais de um portador numera o cartão antes da data. O número é
   * do cartão, não do estabelecimento.
   */
  it('o número do cartão não vira parte do nome da loja', () => {
    const descricoes = lido().linhas.map((l) => l.descricao);
    expect(descricoes).toContain('A R G BIGUACU COMERCIO 09/10');
    expect(descricoes.some((d) => d.startsWith('3 '))).toBe(false);
  });

  it('a marca de parcela continua no texto, para virar a coluna Vezes', () => {
    const mercado = lido().linhas.find((l) => l.descricao.startsWith('MERCADO'));
    expect(mercado?.descricao).toContain('01/06');
  });

  /*
   * A capa da fatura tem linhas com data e valor que não são lançamento:
   *
   *     R$ 2.577,79   15/09/2026   R$30.040,00
   *     JUL. R$ 3.305,62 R$3.305,64 09/06/26 a 08/07/26
   *
   * Cinco delas entravam como compras. O que as denuncia é a ordem: num
   * lançamento a data vem antes do valor, sempre.
   */
  it('a capa da fatura não vira lançamento', () => {
    const capa = lerLinhasSoltas(
      [
        'Total a Pagar Vencimento Seu limite é',
        'R$ 2.577,79 15/09/2026 R$30.040,00',
        'JUL. R$ 3.305,62 R$3.305,64 09/06/26 a 08/07/26',
        'OUT. R$ 1.451,32 Fatura Aberta 09/09/26 a 07/10/26',
      ].join('\n'),
      '2026-09-12',
    );
    expect(capa.linhas).toEqual([]);
  });

  /*
   * Num PDF a maior parte da página é prosa, número de página e rodapé.
   * Relatar cada linha sem valor como problema enchia a tela com sete avisos
   * que não eram problema nenhum — e escondia os que seriam.
   */
  it('a prosa do PDF é ignorada em silêncio, mas o texto colado ainda reclama', () => {
    const pdf = lerLinhasSoltas(
      [
        '1/4',
        'Olá, Thayna! Esta é a fatura do seu cartão realizados até 08/09.',
        'No caso de pagamentos após a data de vencimento você tem custos',
        '16/07 JIM COM* PAULA CRISTI -0,02',
      ].join('\n'),
      '2026-09-12',
    );
    expect(pdf.problemas).toEqual([]);
    expect(pdf.linhas).toHaveLength(1);

    // Colado, a maioria das linhas é lançamento: aí a que falhou era para dar certo.
    const colado = lerLinhasSoltas(
      ['07/09/2026 MERCADO 70,00', '08/09/2026 UBER 21,40', '09/09/2026 SEM VALOR NENHUM'].join('\n'),
      '2026-09-12',
    );
    expect(colado.problemas).toHaveLength(1);
  });
});
