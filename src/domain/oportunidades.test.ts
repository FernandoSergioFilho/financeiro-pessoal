import { describe, expect, it } from 'vitest';

import { VALOR_MINIMO, procurarOportunidades, resumirOportunidades } from './oportunidades.ts';
import { addMonthsToKey, monthKey } from './date.ts';
// Comparado pelo próprio formatador: o `Intl` usa espaço não-separável depois
// do "R$", e um literal digitado à mão nunca casa com ele.
import { formatMoney } from './money.ts';
import type { Account, Entry, FinanceData, RecurringRule } from './types.ts';

const STAMP = '2026-01-01T00:00:00.000Z';
const HOJE = '2026-09-12';

const corrente: Account = {
  id: 'cc', name: 'Conta corrente', kind: 'checking', openingBalance: 0, color: 'green', updatedAt: STAMP,
};

function lanc(over: Partial<Entry> & { id: string; date: string }): Entry {
  return {
    description: 'x', amount: 10000, kind: 'expense', accountId: 'cc', toAccountId: null,
    categoryId: null, status: 'settled', recurringId: null, occurrenceDate: null, purchaseId: null,
    installmentNumber: null, installmentTotal: null, createdAt: STAMP, updatedAt: STAMP, ...over,
  };
}

function regra(over: Partial<RecurringRule> & { id: string; description: string; amount: number }): RecurringRule {
  return {
    kind: 'expense', accountId: 'cc', toAccountId: null, categoryId: null, frequency: 'monthly',
    interval: 1, startDate: '2025-01-01', endDate: null, maxOccurrences: null, active: true,
    skippedDates: [], createdAt: STAMP, updatedAt: STAMP, ...over,
  };
}

/** Um mês fechado, `n` meses atrás. */
const mes = (n: number) => `${addMonthsToKey(monthKey(HOJE), -n)}-10`;

function carteira(over: Partial<FinanceData> = {}): FinanceData {
  return {
    version: 2, accounts: [corrente], categories: [], entries: [], recurring: [],
    purchases: [], tombstones: [], ...over,
  };
}

const achar = (data: FinanceData, id: string, rendimentoAoAno?: number) =>
  procurarOportunidades({ data, contas: data.accounts, categorias: [], hoje: HOJE, rendimentoAoAno })
    .find((o) => o.id === id);

/** Gasto de rotina, para haver um "gasto de costume" com que comparar. */
const rotina = Array.from({ length: 8 }, (_, i) =>
  lanc({ id: `r${i}`, date: mes(i + 1), amount: 100000, description: 'Mercado' }));

describe('dinheiro parado', () => {
  it('aponta o que sobra além da reserva do mês, e quanto renderia', () => {
    const data = carteira({
      accounts: [{ ...corrente, openingBalance: 2000000 }],
      entries: rotina,
    });
    const o = achar(data, 'dinheiro-parado', 0.1)!;
    // 20.000 de saldo − 8.000 de gasto acumulado = 12.000; menos 1.000 de
    // folga = 11.000 sobrando, que a 10% rendem 1.100 por ano.
    expect(o.porAno).toBe(110000);
    expect(o.texto).toContain(formatMoney(100000)); // a folga do mês
  });

  /*
   * Ninguém deve investir o dinheiro do aluguel da semana que vem. Um conselho
   * que ignora isso é um conselho que quebra a pessoa.
   */
  it('não manda investir quem só tem a reserva do mês', () => {
    const data = carteira({ accounts: [{ ...corrente, openingBalance: 900000 }], entries: rotina });
    expect(achar(data, 'dinheiro-parado')).toBeUndefined();
  });

  it('conta arquivada não conta como dinheiro parado', () => {
    const data = carteira({
      accounts: [{ ...corrente, openingBalance: 5000000, archived: true }],
      entries: rotina,
    });
    expect(achar(data, 'dinheiro-parado')).toBeUndefined();
  });

  it('a taxa é editável e muda a conta', () => {
    const data = carteira({ accounts: [{ ...corrente, openingBalance: 2000000 }], entries: rotina });
    expect(achar(data, 'dinheiro-parado', 0.2)!.porAno)
      .toBe(achar(data, 'dinheiro-parado', 0.1)!.porAno * 2);
  });
});

describe('juros pagos', () => {
  /*
   * O achado mais valioso que existe aqui: juro de cartão passa de 400% ao ano
   * no Brasil, e quase tudo é mais barato do que ele.
   */
  it('soma juros, encargos, IOF e multa, escritos como o banco escreve', () => {
    const data = carteira({
      entries: [
        ...rotina,
        lanc({ id: 'j1', date: mes(1), amount: 8000, description: 'JUROS ROTATIVO' }),
        lanc({ id: 'j2', date: mes(2), amount: 2000, description: 'IOF' }),
        lanc({ id: 'j3', date: mes(3), amount: 1500, description: 'Encargos por atraso' }),
      ],
    });
    const o = achar(data, 'juros')!;
    expect(o.texto).toContain(formatMoney(11500));
  });

  it('sem juros nenhum, não inventa o achado', () => {
    expect(achar(carteira({ entries: rotina }), 'juros')).toBeUndefined();
  });

  it('acha mesmo com acento e caixa alta', () => {
    const data = carteira({
      entries: [...rotina, lanc({ id: 'j', date: mes(1), amount: 50000, description: 'JUROS E MORA' })],
    });
    expect(achar(data, 'juros')).toBeDefined();
  });
});

describe('tarifas e anuidades', () => {
  it('soma o que se paga só por ter a conta', () => {
    const data = carteira({
      entries: [
        ...rotina,
        lanc({ id: 't1', date: mes(1), amount: 3500, description: 'TARIFA PACOTE SERVICOS' }),
        lanc({ id: 't2', date: mes(2), amount: 3500, description: 'Cesta de serviços' }),
        lanc({ id: 't3', date: mes(3), amount: 45000, description: 'ANUIDADE DIFERENCIADA' }),
      ],
    });
    expect(achar(data, 'tarifas')!.acao).toContain('sem tarifa');
  });
});

describe('assinaturas', () => {
  it('junta as pequenas e mostra o ano', () => {
    const data = carteira({
      recurring: [
        regra({ id: 'a1', description: 'Streaming', amount: 5590 }),
        regra({ id: 'a2', description: 'Música', amount: 2190 }),
        regra({ id: 'a3', description: 'Nuvem', amount: 990 }),
      ],
    });
    const o = achar(data, 'assinaturas')!;
    expect(o.titulo).toContain('3 assinaturas');
    expect(o.porAno).toBe((5590 + 2190 + 990) * 12);
  });

  /*
   * Duas assinaturas não são um problema de assinaturas — são duas contas. O
   * achado só existe quando o padrão existe.
   */
  it('duas não viram achado', () => {
    const data = carteira({
      recurring: [regra({ id: 'a1', description: 'Streaming', amount: 5590 }),
        regra({ id: 'a2', description: 'Música', amount: 2190 })],
    });
    expect(achar(data, 'assinaturas')).toBeUndefined();
  });

  it('o aluguel não é assinatura', () => {
    const data = carteira({
      recurring: [
        regra({ id: 'a1', description: 'Aluguel', amount: 200000 }),
        regra({ id: 'a2', description: 'Plano de saúde', amount: 89000 }),
        regra({ id: 'a3', description: 'Escola', amount: 118000 }),
      ],
    });
    expect(achar(data, 'assinaturas')).toBeUndefined();
  });

  it('assinatura pausada não conta', () => {
    const data = carteira({
      recurring: [
        regra({ id: 'a1', description: 'Streaming', amount: 5590 }),
        regra({ id: 'a2', description: 'Música', amount: 2190, active: false }),
        regra({ id: 'a3', description: 'Nuvem', amount: 990 }),
      ],
    });
    expect(achar(data, 'assinaturas')).toBeUndefined();
  });
});

describe('a régua de todo achado', () => {
  /*
   * Um painel cheio de "considere revisar seus gastos" não ajuda ninguém, e
   * ensina a pessoa a ignorar a tela. Todo achado tem de ter valor em reais e
   * uma ação concreta.
   */
  it('nada aparece abaixo do valor mínimo', () => {
    const data = carteira({
      entries: [...rotina, lanc({ id: 'j', date: mes(1), amount: 100, description: 'IOF' })],
    });
    for (const o of procurarOportunidades({ data, contas: data.accounts, categorias: [], hoje: HOJE })) {
      expect(o.porAno).toBeGreaterThanOrEqual(VALOR_MINIMO);
    }
  });

  it('todo achado diz um valor em reais e o que fazer', () => {
    const data = carteira({
      accounts: [{ ...corrente, openingBalance: 3000000 }],
      entries: [...rotina, lanc({ id: 'j', date: mes(1), amount: 90000, description: 'JUROS ROTATIVO' })],
      recurring: [
        regra({ id: 'a1', description: 'Streaming', amount: 5590 }),
        regra({ id: 'a2', description: 'Música', amount: 2190 }),
        regra({ id: 'a3', description: 'Nuvem', amount: 990 }),
      ],
    });
    const achados = procurarOportunidades({ data, contas: data.accounts, categorias: [], hoje: HOJE });
    expect(achados.length).toBeGreaterThan(2);
    for (const o of achados) {
      expect(o.texto).toMatch(/R\$/);
      expect(o.acao).toMatch(/R\$/);
      expect(o.acao.length).toBeGreaterThan(40);
    }
  });

  /*
   * Dentro do mesmo tipo, o maior primeiro. Entre tipos manda a natureza — a
   * prova disso está no bloco "os dois totais que não se somam".
   */
  it('dentro do mesmo tipo, vem do maior para o menor', () => {
    const data = carteira({
      accounts: [{ ...corrente, openingBalance: 3000000 }],
      entries: [
        ...rotina,
        lanc({ id: 'j', date: mes(1), amount: 90000, description: 'JUROS ROTATIVO' }),
        lanc({ id: 't', date: mes(2), amount: 6000, description: 'TARIFA PACOTE' }),
      ],
    });
    const vazamentos = procurarOportunidades({ data, contas: data.accounts, categorias: [], hoje: HOJE })
      .filter((o) => o.tipo === 'vazamento')
      .map((o) => o.porAno);
    expect([...vazamentos].sort((a, b) => b - a)).toEqual(vazamentos);
  });

  it('carteira vazia não produz conselho nenhum', () => {
    expect(procurarOportunidades({ data: carteira(), contas: [corrente], categorias: [], hoje: HOJE }))
      .toEqual([]);
  });
});

describe('os dois totais que não se somam', () => {
  /*
   * O total único somava R$ 16.656 de parcelas já compradas com R$ 13.352 que
   * se ganharia investindo — compromisso com ganho potencial. Dava um número
   * grande que não queria dizer nada, e nenhum dos dois se recupera do mesmo
   * jeito.
   */
  it('separa o que vaza do que se deixa de ganhar, e deixa o compromisso fora dos dois', () => {
    const data = carteira({
      accounts: [{ ...corrente, openingBalance: 3000000 }],
      entries: [...rotina, lanc({ id: 'j', date: mes(1), amount: 90000, description: 'JUROS ROTATIVO' })],
    });
    const lista = procurarOportunidades({ data, contas: data.accounts, categorias: [], hoje: HOJE });
    const { vazando, ganhando } = resumirOportunidades(lista);

    expect(vazando).toBe(lista.filter((o) => o.tipo === 'vazamento').reduce((s, o) => s + o.porAno, 0));
    expect(ganhando).toBe(lista.filter((o) => o.tipo === 'ganho').reduce((s, o) => s + o.porAno, 0));
    for (const o of lista.filter((c) => c.tipo === 'contexto')) {
      expect(vazando + ganhando).toBeLessThan(vazando + ganhando + o.porAno);
    }
  });

  /*
   * O que está queimando vem antes do que está dormindo, por maior que seja o
   * segundo: juros de R$ 200 pedem ação hoje; R$ 13 mil parados podem esperar
   * a semana que vem.
   */
  it('o que vaza vem antes do que dorme, e o aviso por último', () => {
    const data = carteira({
      accounts: [{ ...corrente, openingBalance: 3000000 }],
      entries: [...rotina, lanc({ id: 'j', date: mes(1), amount: 9000, description: 'JUROS ROTATIVO' })],
    });
    const tipos = procurarOportunidades({ data, contas: data.accounts, categorias: [], hoje: HOJE })
      .map((o) => o.tipo);
    const ordem = { vazamento: 0, ganho: 1, contexto: 2 };
    expect(tipos.map((t) => ordem[t])).toEqual([...tipos.map((t) => ordem[t])].sort((a, b) => a - b));
  });
});
