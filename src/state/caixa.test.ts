/**
 * O mês do cartão é o mês em que a fatura vence.
 *
 * Duas datas convivem no app, e a confusão entre elas era o defeito: a data da
 * compra diz em que fatura ela caiu e quanto se deve no cartão; a data de
 * caixa diz quando o dinheiro sai da conta. Estas provas fixam qual manda em
 * quê — sem elas, uma "simplificação" futura junta as duas de novo.
 */

import { describe, expect, it } from 'vitest';

import { comDataDeCaixa, dataDeCaixa, quandoSai } from '../domain/faturas.ts';
import { monthEnd, monthStart } from '../domain/date.ts';
import { intervaloDoPeriodo } from '../domain/period.ts';
import { accountBalance, monthlySeries, periodTotals } from '../domain/summary.ts';
import type { Account, Entry, FinanceData } from '../domain/types.ts';
import { entriesInRange } from './selectors.ts';

const STAMP = '2026-01-01T00:00:00.000Z';

/** Cartão do caso relatado: fecha dia 1º, vence dia 10. */
const cartao: Account = {
  id: 'cartao', name: 'Cartão', kind: 'credit_card', openingBalance: 0, color: 'blue',
  closingDay: 1, dueDay: 10, updatedAt: STAMP,
};

const conta: Account = {
  id: 'conta', name: 'Conta corrente', kind: 'checking', openingBalance: 0, color: 'green',
  updatedAt: STAMP,
};

function gasto(id: string, date: string, amount: number, accountId = cartao.id): Entry {
  return {
    id, date, description: `gasto ${id}`, amount, kind: 'expense', accountId,
    toAccountId: null, categoryId: null, status: 'pending', recurringId: null,
    occurrenceDate: null, purchaseId: null, installmentNumber: null, installmentTotal: null,
    createdAt: STAMP, updatedAt: STAMP,
  };
}

function carteira(entries: Entry[]): FinanceData {
  return {
    version: 2, accounts: [cartao, conta], categories: [], entries,
    recurring: [], purchases: [], tombstones: [],
  };
}

const mes = (chave: string) => ({ de: monthStart(chave), ate: monthEnd(chave) });

describe('dataDeCaixa', () => {
  it('no cartão, é o vencimento da fatura em que a compra caiu', () => {
    // Fecha dia 1º: a compra de 01/09 abre a fatura que fecha em 01/10 e
    // vence em 10/10.
    expect(dataDeCaixa(cartao, { date: '2026-09-01', kind: 'expense' })).toBe('2026-10-10');
    // A véspera ainda é da fatura que fecha em 01/09 e vence em 10/09.
    expect(dataDeCaixa(cartao, { date: '2026-08-31', kind: 'expense' })).toBe('2026-09-10');
  });

  it('no débito e no Pix, é a própria data', () => {
    expect(dataDeCaixa(conta, { date: '2026-09-01', kind: 'expense' })).toBe('2026-09-01');
  });

  /*
   * A transferência para o cartão é o pagamento da fatura em si: ela já
   * acontece no dia em que acontece, e deslocá-la empurraria o pagamento para
   * a fatura seguinte, num laço sem fim.
   */
  it('o pagamento da fatura não se desloca', () => {
    expect(dataDeCaixa(cartao, { date: '2026-09-10', kind: 'transfer' })).toBe('2026-09-10');
  });

  it('cartão sem dia de fechamento não tem como deslocar nada', () => {
    const semCiclo = { ...cartao, closingDay: null };
    expect(dataDeCaixa(semCiclo, { date: '2026-09-01', kind: 'expense' })).toBe('2026-09-01');
  });

  it('conta desconhecida não quebra: fica na própria data', () => {
    expect(dataDeCaixa(undefined, { date: '2026-09-01', kind: 'expense' })).toBe('2026-09-01');
  });
});

describe('o período do cartão', () => {
  const data = carteira([
    gasto('a', '2026-09-01', 10000), // fecha 01/10, vence 10/10 → outubro
    gasto('b', '2026-08-31', 20000), // fecha 01/09, vence 10/09 → setembro
    gasto('c', '2026-09-05', 40000, conta.id), // débito → setembro
  ]);

  it('a compra do dia do fechamento aparece no mês em que a fatura vence', () => {
    const outubro = entriesInRange(data, mes('2026-10').de, mes('2026-10').ate);
    expect(outubro.map((e) => e.id)).toEqual(['a']);
  });

  it('e não aparece no mês em que foi comprada', () => {
    const setembro = entriesInRange(data, mes('2026-09').de, mes('2026-09').ate);
    expect(setembro.map((e) => e.id).sort()).toEqual(['b', 'c']);
  });

  it('o total do mês é o do dinheiro que sai nele', () => {
    expect(periodTotals(entriesInRange(data, mes('2026-09').de, mes('2026-09').ate)).expense)
      .toBe(60000); // b + c
    expect(periodTotals(entriesInRange(data, mes('2026-10').de, mes('2026-10').ate)).expense)
      .toBe(10000); // só a
  });

  /*
   * A compra entra na janela vinda de fora dela: comprada em setembro,
   * aparece em outubro. Procurar só dentro da própria janela a deixaria de
   * fora — foi por isso que a busca precisou de folga nos dois lados.
   */
  it('a busca alcança a compra feita fora da janela que a recebe', () => {
    const soUmDia = entriesInRange(data, '2026-10-10', '2026-10-10');
    expect(soUmDia.map((e) => e.id)).toEqual(['a']);
  });

  it('o gráfico mensal concorda com a lista', () => {
    const tudo = intervaloDoPeriodo({ grao: 'tudo', ancora: '2026-09-12' });
    const serie = monthlySeries(entriesInRange(data, tudo.de, tudo.ate), ['2026-09', '2026-10']);
    expect(serie.map((p) => p.expense)).toEqual([60000, 10000]);
  });

  /*
   * O período "Tudo" vai de 0000 a 9999, e alargar esses limites estoura o
   * calendário: `0000-01-01 − 70` vira 1899 e `9999-12-31 + 70` vira
   * "10000-03-10", que comparado como texto é menor que qualquer data de
   * verdade. O mês e o ano ficavam certos, e "Tudo" voltava vazio.
   */
  it('o período "Tudo" continua trazendo tudo', () => {
    const tudo = intervaloDoPeriodo({ grao: 'tudo', ancora: '2026-09-12' });
    expect(entriesInRange(data, tudo.de, tudo.ate)).toHaveLength(3);
  });

  /*
   * O que se deve no cartão nasce quando se passa o cartão. Se o saldo
   * seguisse o caixa, o cartão pareceria zerado até a fatura vencer — e o
   * limite gasto some da tela justamente quando importa.
   */
  it('o saldo do cartão continua na data da compra, e não no vencimento', () => {
    const ate30deSetembro = accountBalance(cartao, data.entries, { upTo: '2026-09-30' });
    expect(ate30deSetembro).toBe(-30000); // as duas compras, a e b
  });
});

describe('comDataDeCaixa', () => {
  it('só carimba quem se desloca — o resto continua o mesmo objeto', () => {
    const doCartao = gasto('a', '2026-09-01', 10000);
    const doDebito = gasto('c', '2026-09-05', 40000, conta.id);
    const [cartaoCom, debitoCom] = comDataDeCaixa([cartao, conta], [doCartao, doDebito]);
    expect(cartaoCom!.caixa).toBe('2026-10-10');
    expect(debitoCom).toBe(doDebito);
  });

  it('quandoSai cai na data quando não há deslocamento', () => {
    expect(quandoSai({ date: '2026-09-05' })).toBe('2026-09-05');
    expect(quandoSai({ date: '2026-09-01', caixa: '2026-10-10' })).toBe('2026-10-10');
  });
});
