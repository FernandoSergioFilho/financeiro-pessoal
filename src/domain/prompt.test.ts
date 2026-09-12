import { describe, expect, it } from 'vitest';

import { formatMoney } from './money.ts';
import {
  MODELOS, mesLegivel, modeloPorChave, montarPrompt, reunirDados, tamanhoDoPrompt,
  type DadosDoPrompt,
} from './prompt.ts';
import type { Account, Category, DisplayEntry, Entry, FinanceData, RecurringRule } from './types.ts';

const STAMP = '2026-09-08T12:00:00.000Z';
const HOJE = '2026-09-12';

const reais = (centavos: number) => formatMoney(centavos);

function conta(id: string, name: string, openingBalance = 0, institution?: string): Account {
  return { id, name, kind: 'checking', openingBalance, color: 'blue', institution, updatedAt: STAMP };
}

function categoria(id: string, name: string): Category {
  return { id, name, kind: 'expense', color: 'blue', emoji: '🛒', updatedAt: STAMP };
}

function lancamento(over: Partial<Entry> & { id: string; date: string }): Entry {
  return {
    description: 'x', amount: 1000, kind: 'expense', accountId: 'c1', toAccountId: null,
    categoryId: null, status: 'settled', recurringId: null, occurrenceDate: null,
    purchaseId: null, installmentNumber: null, installmentTotal: null,
    createdAt: STAMP, updatedAt: STAMP, ...over,
  };
}

function regra(over: Partial<RecurringRule> & { id: string; description: string }): RecurringRule {
  return {
    amount: 50000, kind: 'expense', accountId: 'c1', toAccountId: null, categoryId: null,
    frequency: 'monthly', interval: 1, startDate: '2026-01-01', endDate: null,
    maxOccurrences: null, active: true, skippedDates: [], createdAt: STAMP, updatedAt: STAMP,
    ...over,
  };
}

function carteira(over: Partial<FinanceData> = {}): FinanceData {
  return {
    version: 2, accounts: [conta('c1', 'Conta corrente')], categories: [],
    entries: [], recurring: [], purchases: [], tombstones: [], ...over,
  };
}

const periodo = { grao: 'mes', ancora: '2026-09-12' } as const;

describe('mesLegivel', () => {
  it('escreve o mês como se lê', () => {
    expect(mesLegivel('2026-09')).toBe('set/2026');
    expect(mesLegivel('2026-01')).toBe('jan/2026');
    expect(mesLegivel('2026-12')).toBe('dez/2026');
  });

  it('devolve a chave crua quando não é mês — melhor do que "undefined/2026"', () => {
    expect(mesLegivel('lixo')).toBe('lixo');
    expect(mesLegivel('2026-13')).toBe('2026-13');
  });
});

describe('MODELOS', () => {
  it('todo modelo tem chave única', () => {
    const chaves = MODELOS.map((m) => m.chave);
    expect(new Set(chaves).size).toBe(chaves.length);
  });

  it('só o da compra pede algo para completar, e diz o quê', () => {
    const comLacuna = MODELOS.filter((m) => m.aCompletar);
    expect(comLacuna.map((m) => m.chave)).toEqual(['compra']);
    expect(comLacuna[0]!.aCompletar).toContain('[DESCREVA');
  });

  /*
   * A lacuna no texto e o aviso na tela precisam andar juntos: um pedido com
   * "[DESCREVA...]" que não avise ninguém vira resposta inventada sobre uma
   * compra que a IA imaginou.
   */
  it('todo pedido com colchete tem aviso, e todo aviso tem colchete', () => {
    for (const modelo of MODELOS) {
      expect(/\[[A-Z]/.test(modelo.pedido)).toBe(Boolean(modelo.aCompletar));
    }
  });

  it('modeloPorChave acha o certo, e não quebra com chave inválida', () => {
    expect(modeloPorChave('corte').titulo).toBe('Onde dá para cortar');
    expect(modeloPorChave('nada' as never)).toBe(MODELOS[0]);
  });
});

describe('reunirDados', () => {
  const dados = () =>
    reunirDados(
      carteira({
        accounts: [conta('c1', 'Conta corrente', 100000)],
        categories: [categoria('g1', 'Mercado'), categoria('g2', 'Saúde')],
        entries: [
          lancamento({ id: 'e1', date: '2026-08-10', amount: 30000, categoryId: 'g1' }),
          lancamento({ id: 'e2', date: '2026-09-03', amount: 20000, categoryId: 'g1' }),
          lancamento({ id: 'e3', date: '2026-09-04', amount: 5000, categoryId: 'g2' }),
          lancamento({ id: 'e4', date: '2026-10-05', amount: 9000, purchaseId: 'p1' }),
        ],
        recurring: [
          regra({ id: 'r1', description: 'Aluguel', amount: 150000 }),
          regra({ id: 'r2', description: 'Streaming', amount: 3000, active: false }),
        ],
      }),
      [
        lancamento({ id: 'e2', date: '2026-09-03', amount: 20000, categoryId: 'g1' }),
        lancamento({ id: 'e3', date: '2026-09-04', amount: 5000, categoryId: 'g2' }),
      ] as DisplayEntry[],
      [categoria('g1', 'Mercado'), categoria('g2', 'Saúde')],
      [conta('c1', 'Conta corrente', 100000)],
      periodo,
      HOJE,
    );

  it('soma o período a partir do que recebeu, e não da carteira inteira', () => {
    expect(dados().totais.saidas).toBe(25000);
  });

  it('a série usa meses fechados — o mês corrente pela metade viraria queda falsa', () => {
    expect(dados().serie.map((m) => m.mes)).toEqual(['2026-08']);
  });

  it('pula meses sem nenhum lançamento em vez de listar zeros', () => {
    expect(dados().serie).toHaveLength(1);
  });

  it('o custo fixo ignora a regra pausada', () => {
    expect(dados().fixas.map((f) => f.nome)).toEqual(['Aluguel']);
  });

  it('as parcelas futuras entram, porque é o que aperta os meses que vêm', () => {
    expect(dados().parcelas).toEqual([{ mes: '2026-10', valor: 9000 }]);
  });

  it('as categorias vêm da maior para a menor, com a fatia', () => {
    const c = dados().categorias;
    expect(c[0]!.nome).toBe('Mercado');
    expect(c[0]!.fatia).toBeCloseTo(0.8, 2);
  });

  /*
   * Na tela a conta aparece embaixo do nome do banco e o nome curto basta.
   * Numa lista corrida não: com quatro cartões e três contas correntes, o
   * texto saía com "Conta corrente" e "Cartão" repetidos, com saldos
   * diferentes, e quem lê não tinha como saber qual era qual.
   */
  it('a conta leva o banco no nome, senão duas contas viram a mesma', () => {
    const dados = reunirDados(
      carteira({ accounts: [conta('c1', 'Conta corrente', 0, 'Nubank')] }),
      [],
      [],
      [conta('c1', 'Conta corrente', 0, 'Nubank'), conta('c2', 'Conta corrente', 0, 'Itaú')],
      periodo,
      HOJE,
    );
    expect(dados.contas.map((c) => c.nome)).toEqual(['Nubank — Conta corrente', 'Itaú — Conta corrente']);
  });

  it('não repete o nome quando o banco é a própria conta', () => {
    const dados = reunirDados(
      carteira(),
      [],
      [],
      [conta('c1', 'Tesouro Direto', 0, 'Tesouro Direto')],
      periodo,
      HOJE,
    );
    expect(dados.contas[0]!.nome).toBe('Tesouro Direto');
  });

  it('o saldo da conta parte da abertura e aplica o que está pago', () => {
    // 1.000,00 de abertura − 300 − 200 − 50 (a de outubro ainda não é passado,
    // mas está confirmada nos dados, então conta) = R$ 350,00
    expect(dados().contas[0]!.nome).toBe('Conta corrente');
    expect(dados().contas[0]!.saldo).toBe(36000);
  });
});

describe('montarPrompt', () => {
  const base: DadosDoPrompt = {
    hoje: HOJE,
    periodo: 'Setembro de 2026',
    totais: { entradas: 500000, saidas: 320000, resultado: 180000 },
    serie: [
      { mes: '2026-07', entradas: 500000, saidas: 300000 },
      { mes: '2026-08', entradas: 500000, saidas: 410000 },
    ],
    categorias: [{ nome: 'Mercado', valor: 200000, fatia: 0.625 }],
    fixas: [{ nome: 'Aluguel', porMes: 150000 }],
    parcelas: [{ mes: '2026-10', valor: 9000 }],
    contas: [{ nome: 'Conta corrente', saldo: 36000 }],
    achados: ['Mercado subiu: 40% acima da média'],
    mesesDeHistorico: 6,
  };

  it('põe o pedido do modelo escolhido', () => {
    expect(montarPrompt(modeloPorChave('corte'), base)).toContain('plano para eu gastar menos');
  });

  it('traz os números formatados em real, e não o inteiro de centavos', () => {
    const texto = montarPrompt(modeloPorChave('diagnostico'), base);
    expect(texto).toContain(reais(320000));
    expect(texto).not.toContain('320000');
  });

  it('a série mostra o que sobrou em cada mês, já calculado', () => {
    const texto = montarPrompt(modeloPorChave('diagnostico'), base);
    expect(texto).toContain(`jul/2026: ${reais(500000)} / ${reais(300000)} / ${reais(200000)}`);
    expect(texto).toContain(`ago/2026: ${reais(500000)} / ${reais(410000)} / ${reais(90000)}`);
  });

  it('soma o custo fixo — a IA não devia ter de somar para responder', () => {
    expect(montarPrompt(modeloPorChave('corte'), base)).toContain(`Total: ${reais(150000)}`);
  });

  /*
   * A promessa do cabeçalho do módulo, e a razão de o app poder oferecer isto
   * sem constrangimento: agregado sai, descrição não.
   */
  it('não leva a descrição de nenhum lançamento', () => {
    const dados = reunirDados(
      carteira({
        categories: [categoria('g1', 'Saúde')],
        entries: [lancamento({ id: 'e1', date: '2026-09-03', description: 'Dr. Fulano', categoryId: 'g1' })],
        recurring: [],
      }),
      [lancamento({ id: 'e1', date: '2026-09-03', description: 'Dr. Fulano', categoryId: 'g1' })] as DisplayEntry[],
      [categoria('g1', 'Saúde')],
      [conta('c1', 'Conta corrente')],
      periodo,
      HOJE,
    );
    const texto = montarPrompt(modeloPorChave('diagnostico'), dados);
    expect(texto).not.toContain('Dr. Fulano');
    expect(texto).toContain('Saúde');
  });

  it('avisa a IA quando o histórico é curto demais para afirmar', () => {
    const texto = montarPrompt(modeloPorChave('diagnostico'), { ...base, mesesDeHistorico: 1 });
    expect(texto).toContain('1 mês fechado');
    expect(texto).toContain('ainda não dá para afirmar');
  });

  it('com histórico suficiente, manda comparar em vez de avisar', () => {
    const texto = montarPrompt(modeloPorChave('diagnostico'), base);
    expect(texto).not.toContain('ainda não dá para afirmar');
    expect(texto).toContain('Compare com os meses anteriores');
  });

  it('some com a seção vazia em vez de escrever um título sozinho', () => {
    const texto = montarPrompt(modeloPorChave('diagnostico'), {
      ...base, parcelas: [], fixas: [], achados: [],
    });
    expect(texto).not.toContain('Parcelas já compradas');
    expect(texto).not.toContain('Custo fixo');
    expect(texto).toContain('Resumo do período');
  });

  it('não deixa linha em branco triplicada onde uma seção sumiu', () => {
    const texto = montarPrompt(modeloPorChave('diagnostico'), { ...base, parcelas: [], fixas: [] });
    expect(texto).not.toMatch(/\n{3}/);
  });

  it('manda a IA não inventar o que não está no texto', () => {
    expect(montarPrompt(modeloPorChave('fechamento'), base)).toContain('em vez de estimar');
  });

  it('o tamanho é o do texto, para a tela avisar antes de colar', () => {
    const texto = montarPrompt(modeloPorChave('diagnostico'), base);
    expect(tamanhoDoPrompt(texto)).toBe(texto.length);
  });
});
