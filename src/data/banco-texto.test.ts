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

  it('linha com data e sem valor vira problema, porque era para ser lançamento', () => {
    const lido = lerLinhasSoltas('07/09/2026 COMPRA SEM VALOR', HOJE);
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
