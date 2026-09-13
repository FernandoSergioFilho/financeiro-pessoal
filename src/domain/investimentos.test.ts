import { describe, expect, it } from 'vitest';

import {
  ehInvestimento, foraDoCaixa, resumoDoInvestimento, resumoGeralDeInvestimentos,
} from './investimentos.ts';
import { periodTotals } from './summary.ts';
import type { Account, DisplayEntry, Entry } from './types.ts';
import { entriesInRange } from '../state/selectors.ts';
import type { FinanceData } from './types.ts';

const STAMP = '2026-01-01T00:00:00.000Z';

const conta: Account = {
  id: 'cc', name: 'Conta corrente', kind: 'checking', openingBalance: 500000, color: 'green',
  updatedAt: STAMP,
};
const tesouro: Account = {
  id: 'td', name: 'Tesouro Direto', kind: 'investment', openingBalance: 1000000, color: 'violet',
  updatedAt: STAMP,
};
const poupanca: Account = {
  id: 'pp', name: 'Poupança', kind: 'savings', openingBalance: 0, color: 'blue',
  updatedAt: STAMP,
};

function lanc(over: Partial<Entry> & { id: string; date: string; kind: Entry['kind'] }): Entry {
  return {
    description: 'x', amount: 10000, accountId: 'cc', toAccountId: null, categoryId: null,
    status: 'settled', recurringId: null, occurrenceDate: null, purchaseId: null,
    installmentNumber: null, installmentTotal: null, createdAt: STAMP, updatedAt: STAMP, ...over,
  };
}

const aporte = lanc({ id: 'a1', date: '2026-09-05', kind: 'transfer', amount: 200000, accountId: 'cc', toAccountId: 'td' });
const resgate = lanc({ id: 'r1', date: '2026-09-20', kind: 'transfer', amount: 50000, accountId: 'td', toAccountId: 'cc' });
const rendeu = lanc({ id: 'y1', date: '2026-09-30', kind: 'income', amount: 25000, accountId: 'td', description: 'Rendimento' });
const taxa = lanc({ id: 't1', date: '2026-09-30', kind: 'expense', amount: 3000, accountId: 'td', description: 'Taxa de custódia' });

describe('ehInvestimento', () => {
  it('só a conta de investimento; poupança não é', () => {
    expect(ehInvestimento(tesouro)).toBe(true);
    expect(ehInvestimento(poupanca)).toBe(false);
    expect(ehInvestimento(undefined)).toBe(false);
  });
});

describe('foraDoCaixa', () => {
  /*
   * A decisão que define o módulo. Os R$ 250 que o Tesouro rendeu não
   * entraram: engordaram um patrimônio que continua lá dentro. Contá-los como
   * entrada inflaria a renda do mês e faria o app dizer que sobrou dinheiro
   * que ninguém pode gastar sem antes resgatar.
   */
  it('o rendimento preso no investimento fica fora do caixa', () => {
    expect(foraDoCaixa(tesouro, rendeu)).toBe(true);
    expect(foraDoCaixa(tesouro, taxa)).toBe(true);
  });

  /*
   * A transferência não: ela tem a outra ponta numa conta de caixa. É
   * justamente o aporte e o resgate — o momento em que o dinheiro atravessa a
   * fronteira, e o que o fluxo precisa enxergar.
   */
  it('o aporte e o resgate atravessam a fronteira, e contam', () => {
    expect(foraDoCaixa(tesouro, aporte)).toBe(false);
    expect(foraDoCaixa(tesouro, resgate)).toBe(false);
  });

  /*
   * Rendimento de poupança cai numa conta de onde se gasta no mesmo dia.
   * Quem decide é a natureza da conta, não a palavra "rendimento".
   */
  it('o rendimento da poupança é caixa, porque a poupança é caixa', () => {
    expect(foraDoCaixa(poupanca, rendeu)).toBe(false);
  });

  it('salário na conta corrente é caixa, obviamente', () => {
    expect(foraDoCaixa(conta, lanc({ id: 's', date: '2026-09-05', kind: 'income' }))).toBe(false);
  });
});

describe('resumoDoInvestimento', () => {
  const movimentos = [aporte, resgate, rendeu, taxa] as DisplayEntry[];

  it('separa aporte, resgate e rendimento', () => {
    const r = resumoDoInvestimento(tesouro, movimentos);
    expect(r.aportado).toBe(200000);
    expect(r.retirado).toBe(50000);
    expect(r.rendimento).toBe(22000); // 250,00 rendeu menos 30,00 de taxa
  });

  /*
   * A identidade que prova que nada se perdeu no caminho:
   *
   *     saldo = abertura + aportado − retirado + rendimento
   *
   * Se algum dia um lançamento passar a ser contado duas vezes, ou a escapar
   * da soma, é aqui que aparece.
   */
  it('o saldo fecha com a abertura mais o que entrou menos o que saiu', () => {
    const r = resumoDoInvestimento(tesouro, movimentos);
    expect(r.saldo).toBe(tesouro.openingBalance + r.aportado - r.retirado + r.rendimento);
    expect(r.saldo).toBe(1172000);
  });

  it('a taxa desconta do rendimento, em vez de virar despesa do mês', () => {
    const semTaxa = resumoDoInvestimento(tesouro, [aporte, rendeu] as DisplayEntry[]);
    const comTaxa = resumoDoInvestimento(tesouro, movimentos.filter((m) => m.id !== 'r1'));
    expect(semTaxa.rendimento - comTaxa.rendimento).toBe(3000);
  });

  it('sem aporte nenhum, o retorno é nulo em vez de infinito', () => {
    expect(resumoDoInvestimento(tesouro, [rendeu] as DisplayEntry[]).retorno).toBeNull();
  });

  it('o retorno é o que rendeu sobre o que foi posto lá', () => {
    const r = resumoDoInvestimento(tesouro, [aporte, rendeu] as DisplayEntry[]);
    expect(r.retorno).toBeCloseTo(0.125, 4); // 250 sobre 2.000
  });

  it('ignora o que é de outra conta', () => {
    const outra = lanc({ id: 'o', date: '2026-09-09', kind: 'income', amount: 999900, accountId: 'cc' });
    expect(resumoDoInvestimento(tesouro, [outra] as DisplayEntry[]).rendimento).toBe(0);
  });
});

describe('resumoGeralDeInvestimentos', () => {
  it('soma só as contas de investimento, e pula as arquivadas', () => {
    const velha: Account = { ...tesouro, id: 'td2', name: 'Antigo', archived: true, openingBalance: 777700 };
    const geral = resumoGeralDeInvestimentos([conta, tesouro, velha, poupanca], [aporte, rendeu] as DisplayEntry[]);
    expect(geral.contas.map((c) => c.conta.id)).toEqual(['td']);
    expect(geral.saldo).toBe(1000000 + 200000 + 25000);
  });
});

/*
 * A prova de que o carimbo chega onde precisa: não basta a regra existir em
 * `foraDoCaixa`, ela tem de atravessar o funil e chegar nos somatórios.
 */
describe('o rendimento no fluxo do mês', () => {
  const data: FinanceData = {
    version: 2,
    accounts: [conta, tesouro],
    categories: [],
    entries: [
      lanc({ id: 'sal', date: '2026-09-05', kind: 'income', amount: 400000, accountId: 'cc' }),
      aporte,
      rendeu,
    ],
    recurring: [], purchases: [], tombstones: [],
  };

  const doMes = () => entriesInRange(data, '2026-09-01', '2026-09-30');

  it('o rendimento não infla as entradas do mês', () => {
    expect(periodTotals(doMes()).income).toBe(400000); // o salário, e só
  });

  it('mas continua aparecendo na lista, para a pessoa ver que rendeu', () => {
    expect(doMes().map((e) => e.id)).toContain('y1');
  });

  it('o aporte não vira despesa: transferência nunca foi', () => {
    expect(periodTotals(doMes()).expense).toBe(0);
  });
});
