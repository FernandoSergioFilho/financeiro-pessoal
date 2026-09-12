import { describe, expect, it } from 'vitest';

import {
  diaDoMes, faturaAberta, faturaDaCompra, faturasAbertas, proximoDiaDoMes,
} from './faturas.ts';
import type { Account, DisplayEntry } from './types.ts';

const STAMP = '2026-01-01T00:00:00.000Z';

const cartao = (over: Partial<Account> = {}): Account => ({
  id: 'nu', name: 'Cartão', kind: 'credit_card', openingBalance: 0, color: 'violet',
  closingDay: 28, dueDay: 5, updatedAt: STAMP, ...over,
});

let n = 0;
const gasto = (date: string, amount: number, over: Partial<DisplayEntry> = {}): DisplayEntry => {
  n += 1;
  return {
    id: `e${n}`, date, description: 'x', amount, kind: 'expense', accountId: 'nu',
    toAccountId: null, categoryId: null, status: 'pending', recurringId: null,
    occurrenceDate: null, purchaseId: null, installmentNumber: null, installmentTotal: null,
    createdAt: STAMP, updatedAt: STAMP, ...over,
  } as DisplayEntry;
};

describe('diaDoMes', () => {
  it('devolve aquele dia no mês da referência', () => {
    expect(diaDoMes('2026-09-15', 28)).toBe('2026-09-28');
  });

  // Sem isto, um cartão que fecha dia 31 nunca fecharia em fevereiro.
  it('encolhe para o último dia quando o mês é curto', () => {
    expect(diaDoMes('2026-02-10', 31)).toBe('2026-02-28');
    expect(diaDoMes('2028-02-10', 31)).toBe('2028-02-29');
  });

  it('não aceita dia fora do calendário', () => {
    expect(diaDoMes('2026-09-15', 0)).toBe('2026-09-01');
    expect(diaDoMes('2026-09-15', 99)).toBe('2026-09-30');
  });
});

describe('proximoDiaDoMes', () => {
  it('é o deste mês quando ainda não passou', () => {
    expect(proximoDiaDoMes('2026-09-15', 28)).toBe('2026-09-28');
  });

  it('é hoje quando hoje é o dia', () => {
    expect(proximoDiaDoMes('2026-09-28', 28)).toBe('2026-09-28');
  });

  it('vira o mês quando já passou', () => {
    expect(proximoDiaDoMes('2026-09-29', 28)).toBe('2026-10-28');
  });

  it('vira o ano em dezembro', () => {
    expect(proximoDiaDoMes('2026-12-29', 28)).toBe('2027-01-28');
  });
});

describe('faturaAberta', () => {
  it('junta o que foi comprado desde o fechamento anterior', () => {
    const fatura = faturaAberta(
      cartao(),
      [
        gasto('2026-08-27', 10000), // fatura anterior: fechou dia 28/08
        gasto('2026-08-29', 20000),
        gasto('2026-09-10', 30000),
        gasto('2026-09-29', 40000), // já é da próxima
      ],
      '2026-09-15',
    )!;
    expect(fatura.fecha).toBe('2026-09-28');
    expect(fatura.comecaEm).toBe('2026-08-28');
    expect(fatura.total).toBe(50000);
    expect(fatura.lancamentos).toBe(2);
  });

  /*
   * NÃO VOLTA A ACONTECER — o intervalo estava invertido.
   *
   * O app incluía o dia do fechamento e excluía o do fechamento anterior. A
   * fatura faz o contrário, e diz isso com todas as letras: "compras
   * realizadas a partir da data de fechamento entrarão na próxima fatura".
   * Num cartão que fecha dia 1º, o erro jogava o mês inteiro na fatura errada.
   */
  it('a compra do próprio dia do fechamento já é da fatura seguinte', () => {
    const fatura = faturaAberta(cartao(), [gasto('2026-09-28', 10000)], '2026-09-15')!;
    expect(fatura.total).toBe(0);
  });

  it('a compra do dia do fechamento anterior entra, porque abriu esta fatura', () => {
    const fatura = faturaAberta(cartao(), [gasto('2026-08-28', 10000)], '2026-09-15')!;
    expect(fatura.total).toBe(10000);
  });

  it('cartão que fecha dia 1º: a compra do dia 1º é da fatura do mês que vem', () => {
    const cartaoDoDia1 = cartao({ closingDay: 1, dueDay: 10 });
    expect(faturaDaCompra(cartaoDoDia1, '2026-09-01')).toMatchObject({
      comecaEm: '2026-09-01',
      fecha: '2026-10-01',
      vence: '2026-10-10',
    });
    // E a véspera, dia 31/08, ainda é da fatura que fecha em 01/09.
    expect(faturaDaCompra(cartaoDoDia1, '2026-08-31')).toMatchObject({
      comecaEm: '2026-08-01',
      fecha: '2026-09-01',
      vence: '2026-09-10',
    });
  });

  it('fechando dia 28 e vencendo dia 5, o vencimento é do mês seguinte', () => {
    expect(faturaAberta(cartao(), [], '2026-09-15')!.vence).toBe('2026-10-05');
  });

  it('fechando dia 5 e vencendo dia 20, o vencimento é do mesmo mês', () => {
    const fatura = faturaAberta(cartao({ closingDay: 5, dueDay: 20 }), [], '2026-09-02')!;
    expect(fatura.fecha).toBe('2026-09-05');
    expect(fatura.vence).toBe('2026-09-20');
  });

  it('ignora lançamento de outro cartão', () => {
    const fatura = faturaAberta(cartao(), [gasto('2026-09-10', 30000, { accountId: 'outro' })], '2026-09-15')!;
    expect(fatura.total).toBe(0);
  });

  it('o pagamento da fatura não é compra: só despesa entra', () => {
    const entrada = gasto('2026-09-10', 30000, { kind: 'income' });
    expect(faturaAberta(cartao(), [entrada], '2026-09-15')!.total).toBe(0);
  });

  it('conta que não é cartão não tem fatura', () => {
    expect(faturaAberta(cartao({ kind: 'checking' }), [], '2026-09-15')).toBeNull();
  });

  it('cartão sem dia de fechamento não tem como ter fatura', () => {
    expect(faturaAberta(cartao({ closingDay: null }), [], '2026-09-15')).toBeNull();
  });

  it('conta o que já foi pago e o que não foi — a fatura é o que foi comprado', () => {
    const fatura = faturaAberta(
      cartao(),
      [gasto('2026-09-10', 10000, { status: 'settled' }), gasto('2026-09-11', 20000)],
      '2026-09-15',
    )!;
    expect(fatura.total).toBe(30000);
  });
});

describe('faturasAbertas', () => {
  it('lista só os cartões, da que vence antes para a última', () => {
    const contas = [
      cartao({ id: 'a', name: 'Amex', closingDay: 15, dueDay: 25 }),
      cartao({ id: 'b', name: 'Nu', closingDay: 28, dueDay: 5 }),
      cartao({ id: 'c', name: 'Conta', kind: 'checking' }),
    ];
    const faturas = faturasAbertas(contas, [], '2026-09-10');
    expect(faturas.map((f) => f.conta.name)).toEqual(['Amex', 'Nu']);
    expect(faturas[0]!.vence < faturas[1]!.vence).toBe(true);
  });

  it('cartão arquivado fica de fora', () => {
    expect(faturasAbertas([cartao({ archived: true })], [], '2026-09-10')).toEqual([]);
  });
});

describe('faturaDaCompra', () => {
  it('a compra do meio do ciclo cai na fatura que está aberta', () => {
    expect(faturaDaCompra(cartao(), '2026-09-10')).toMatchObject({
      comecaEm: '2026-08-28',
      fecha: '2026-09-28',
      vence: '2026-10-05',
    });
  });

  it('a compra do dia do fechamento abre a fatura seguinte', () => {
    expect(faturaDaCompra(cartao(), '2026-09-28')).toMatchObject({
      comecaEm: '2026-09-28',
      fecha: '2026-10-28',
    });
  });

  it('a véspera do fechamento ainda é da que fecha', () => {
    expect(faturaDaCompra(cartao(), '2026-09-27')!.fecha).toBe('2026-09-28');
  });

  /*
   * Mês curto: um cartão que fecha dia 31 fecha no último dia de fevereiro.
   * Sem isto ele não fecharia nunca nesse mês, e a compra ficaria sem fatura.
   */
  it('cartão que fecha dia 31 fecha no último dia de fevereiro', () => {
    const trintaEUm = cartao({ closingDay: 31, dueDay: 10 });
    expect(faturaDaCompra(trintaEUm, '2026-02-10')!.fecha).toBe('2026-02-28');
    expect(faturaDaCompra(trintaEUm, '2026-02-28')!.fecha).toBe('2026-03-31');
  });

  it('conta que não é cartão não tem fatura', () => {
    expect(faturaDaCompra(cartao({ kind: 'checking' }), '2026-09-10')).toBeNull();
  });

  it('cartão sem dia de fechamento não tem como ter fatura', () => {
    expect(faturaDaCompra(cartao({ closingDay: null }), '2026-09-10')).toBeNull();
  });

  /*
   * A fatura aberta é, por definição, aquela em que cairia uma compra de hoje.
   * Se as duas contas divergissem, o app diria uma coisa ao cadastrar e outra
   * no painel — foi por terem sido calculadas em lugares diferentes que o
   * intervalo ficou invertido sem ninguém ver.
   */
  it('a fatura aberta é a mesma em que cairia uma compra de hoje', () => {
    for (const hoje of ['2026-09-27', '2026-09-28', '2026-09-29', '2026-10-01']) {
      const aberta = faturaAberta(cartao(), [], hoje)!;
      const daCompra = faturaDaCompra(cartao(), hoje)!;
      expect({ f: aberta.fecha, v: aberta.vence, c: aberta.comecaEm }).toEqual({
        f: daCompra.fecha, v: daCompra.vence, c: daCompra.comecaEm,
      });
    }
  });
});
