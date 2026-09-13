import { describe, expect, it } from 'vitest';

import { calcularOrcamento } from './orcamento.ts';
import type { DisplayEntry } from './types.ts';

const SETEMBRO = { de: '2026-09-01', ate: '2026-09-30' };

let n = 0;
function mov(over: Partial<DisplayEntry> = {}): DisplayEntry {
  n += 1;
  return {
    id: `e${n}`, date: '2026-09-05', description: 'x', amount: 10000, kind: 'expense',
    accountId: 'a1', toAccountId: null, categoryId: null, status: 'settled',
    recurringId: null, occurrenceDate: null, purchaseId: null,
    installmentNumber: null, installmentTotal: null, createdAt: '', updatedAt: '',
  } as DisplayEntry as DisplayEntry & typeof over as DisplayEntry;
}

const entrada = (amount: number, over: Partial<DisplayEntry> = {}) =>
  ({ ...mov(), kind: 'income', amount, ...over }) as DisplayEntry;
const saidaPaga = (amount: number, over: Partial<DisplayEntry> = {}) =>
  ({ ...mov(), kind: 'expense', status: 'settled', amount, ...over }) as DisplayEntry;
const saidaAPagar = (amount: number, over: Partial<DisplayEntry> = {}) =>
  ({ ...mov(), kind: 'expense', status: 'pending', amount, ...over }) as DisplayEntry;

describe('calcularOrcamento', () => {
  /*
   * O número que o painel não dava: entrou 5.000, já saíram 1.200 e ainda vão
   * sair 1.800 de contas marcadas. O que é escolha são os 2.000 restantes —
   * e não os 3.800 que a conta "entradas menos saídas pagas" mostraria.
   */
  it('desconta o que já saiu e também o que ainda vai sair', () => {
    const o = calcularOrcamento(
      [entrada(500000), saidaPaga(120000), saidaAPagar(180000)],
      SETEMBRO,
      '2026-09-10',
    );
    expect(o.entradas).toBe(500000);
    expect(o.gastoRealizado).toBe(120000);
    expect(o.comprometido).toBe(180000);
    expect(o.disponivel).toBe(200000);
  });

  it('divide o que sobra pelos dias que faltam, contando hoje', () => {
    const o = calcularOrcamento([entrada(310000), saidaPaga(10000)], SETEMBRO, '2026-09-10');
    expect(o.diasRestantes).toBe(21); // do dia 10 ao 30, inclusive
    expect(o.porDia).toBe(Math.round(300000 / 21));
  });

  it('no último dia do período ainda sobra um dia', () => {
    const o = calcularOrcamento([entrada(100000)], SETEMBRO, '2026-09-30');
    expect(o.diasRestantes).toBe(1);
    expect(o.porDia).toBe(100000);
  });

  it('período que já acabou não fala em "por dia"', () => {
    const o = calcularOrcamento([entrada(100000)], SETEMBRO, '2026-10-05');
    expect(o.emAndamento).toBe(false);
    expect(o.diasRestantes).toBe(0);
    expect(o.porDia).toBeNull();
  });

  it('período que ainda não começou também não', () => {
    const o = calcularOrcamento([entrada(100000)], SETEMBRO, '2026-08-20');
    expect(o.emAndamento).toBe(false);
    expect(o.porDia).toBeNull();
  });

  // Sai de uma conta e entra na outra: contá-la inflaria os dois lados.
  it('transferência entre contas próprias não entra na conta', () => {
    const transferencia = { ...mov(), kind: 'transfer', amount: 900000, toAccountId: 'a2' } as DisplayEntry;
    const o = calcularOrcamento([entrada(100000), transferencia], SETEMBRO, '2026-09-10');
    expect(o.entradas).toBe(100000);
    expect(o.gastoRealizado).toBe(0);
    expect(o.disponivel).toBe(100000);
  });

  it('gastar mais do que entrou deixa o disponível negativo, e não zerado', () => {
    const o = calcularOrcamento([entrada(100000), saidaPaga(150000)], SETEMBRO, '2026-09-10');
    expect(o.disponivel).toBe(-50000);
  });

  describe('ritmo', () => {
    /*
     * A comparação é contra o gasto **total** do período — o que já saiu mais
     * o que ainda vai sair. Medir só contra o realizado diria que todo mês
     * começa adiantado no dia em que a primeira conta é paga.
     */
    it('no meio do mês, com metade do gasto feito, o ritmo está em dia', () => {
      const o = calcularOrcamento(
        [entrada(1000000), saidaPaga(200000), saidaAPagar(200000)],
        SETEMBRO,
        '2026-09-15', // 15 de 30 dias
      );
      expect(o.fracaoDecorrida).toBeCloseTo(0.5, 1);
      expect(o.gastoEsperado).toBe(200000);
      expect(o.desvioDoRitmo).toBeCloseTo(0, 5);
    });

    it('gastar cedo demais aparece como ritmo acima', () => {
      const o = calcularOrcamento(
        [entrada(1000000), saidaPaga(360000), saidaAPagar(40000)],
        SETEMBRO,
        '2026-09-15',
      );
      expect(o.desvioDoRitmo!).toBeGreaterThan(0.5); // bem acima do esperado
    });

    it('segurar o gasto aparece como ritmo abaixo', () => {
      const o = calcularOrcamento(
        [entrada(1000000), saidaPaga(50000), saidaAPagar(350000)],
        SETEMBRO,
        '2026-09-15',
      );
      expect(o.desvioDoRitmo!).toBeLessThan(0);
    });

    it('sem gasto nenhum não inventa desvio', () => {
      const o = calcularOrcamento([entrada(100000)], SETEMBRO, '2026-09-15');
      expect(o.desvioDoRitmo).toBeNull();
    });

    it('no primeiro dia quase nada decorreu', () => {
      const o = calcularOrcamento([saidaPaga(10000)], SETEMBRO, '2026-09-01');
      expect(o.fracaoDecorrida).toBeCloseTo(1 / 30, 2);
    });

    it('depois do fim, o período decorreu inteiro', () => {
      const o = calcularOrcamento([saidaPaga(10000)], SETEMBRO, '2026-10-10');
      expect(o.fracaoDecorrida).toBe(1);
    });
  });

  it('período de um dia só não divide por zero', () => {
    const o = calcularOrcamento([entrada(50000)], { de: '2026-09-10', ate: '2026-09-10' }, '2026-09-10');
    expect(o.diasRestantes).toBe(1);
    expect(o.porDia).toBe(50000);
    expect(o.fracaoDecorrida).toBe(1);
  });

  it('sem lançamento nenhum devolve zeros, não NaN', () => {
    const o = calcularOrcamento([], SETEMBRO, '2026-09-10');
    expect(o).toMatchObject({ entradas: 0, gastoRealizado: 0, comprometido: 0, disponivel: 0 });
    expect(Number.isNaN(o.porDia)).toBe(false);
  });
});

/*
 * NÃO VOLTA A ACONTECER — o dinheiro que já estava na conta sumia da conta.
 *
 * O painel dizia "Ainda posso gastar R$ 4.000,00" para quem começou o mês com
 * R$ 4.500 na conta e recebeu R$ 4.000: contava só a entrada do período e
 * ignorava o saldo que abriu o mês. A resposta é R$ 8.500 — e é o mesmo número
 * que o cartão "Dinheiro disponível" mostra ao lado, que era a contradição na
 * cara de quem olhava.
 */
describe('o saldo que abriu o período', () => {
  const janela = { de: '2026-09-01', ate: '2026-09-30' };

  it('entra no que dá para gastar', () => {
    const com = calcularOrcamento([entrada(400000)], janela, '2026-09-12', 450000);
    expect(com.disponivel).toBe(850000);
    expect(com.saldoInicial).toBe(450000);
  });

  it('sem informar, a conta é a de antes — só o período', () => {
    expect(calcularOrcamento([entrada(400000)], janela, '2026-09-12').disponivel).toBe(400000);
  });

  it('o que já saiu e o que ainda vai sair continuam descontando', () => {
    const o = calcularOrcamento(
      [entrada(400000), saidaPaga(100000), saidaAPagar(50000)],
      janela,
      '2026-09-12',
      450000,
    );
    expect(o.disponivel).toBe(450000 + 400000 - 100000 - 50000);
  });

  it('o por dia acompanha, senão diria que se pode gastar menos do que se tem', () => {
    const sem = calcularOrcamento([entrada(400000)], janela, '2026-09-12');
    const com = calcularOrcamento([entrada(400000)], janela, '2026-09-12', 450000);
    expect(com.porDia!).toBeGreaterThan(sem.porDia!);
  });
});
