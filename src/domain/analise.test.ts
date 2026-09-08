import { describe, expect, it } from 'vitest';

import { COMPROMETIMENTO_ALTO, analisar, custoMensalDaRegra } from './analise.ts';
import { addMonthsToKey, monthKey } from './date.ts';
import { formatMoney } from './money.ts';
import type { Category, DisplayEntry, Entry, FinanceData, RecurringRule } from './types.ts';

const HOJE = '2026-09-08';
const STAMP = '2026-09-01T00:00:00.000Z';

const CATEGORIAS: Category[] = [
  { id: 'moradia', name: 'Moradia', kind: 'expense', emoji: '🏠', color: 'blue', updatedAt: STAMP },
  { id: 'comida', name: 'Alimentação', kind: 'expense', emoji: '🍽️', color: 'orange', updatedAt: STAMP },
  { id: 'lazer', name: 'Lazer', kind: 'expense', emoji: '🎬', color: 'violet', updatedAt: STAMP },
  { id: 'salario', name: 'Salário', kind: 'income', emoji: '💰', color: 'green', updatedAt: STAMP },
];

let contador = 0;
function lancamento(over: Partial<Entry> = {}): Entry {
  contador += 1;
  return {
    id: `e${contador}`, date: '2026-09-05', description: 'x', amount: 10000,
    kind: 'expense', accountId: 'a1', toAccountId: null, categoryId: 'comida',
    status: 'settled', recurringId: null, occurrenceDate: null, purchaseId: null,
    installmentNumber: null, installmentTotal: null, createdAt: STAMP, updatedAt: STAMP,
    ...over,
  };
}

function carteira(over: Partial<FinanceData> = {}): FinanceData {
  return {
    version: 2, accounts: [], categories: CATEGORIAS,
    entries: [], recurring: [], purchases: [], tombstones: [], ...over,
  };
}

/** N meses fechados iguais, para haver base de comparação. */
function historico(meses: number, receita: number, despesa: number): Entry[] {
  const saida: Entry[] = [];
  for (let n = 1; n <= meses; n += 1) {
    const chave = addMonthsToKey(monthKey(HOJE), -n);
    saida.push(lancamento({ date: `${chave}-05`, kind: 'income', amount: receita, categoryId: 'salario' }));
    saida.push(lancamento({ date: `${chave}-15`, kind: 'expense', amount: despesa, categoryId: 'comida' }));
  }
  return saida;
}

/** Um `Entry` gravado já é um `DisplayEntry`; o cast é só para o tipo. */
const doMes = (entries: Entry[]): Entry[] => entries;
const comoExibidos = (entries: readonly Entry[]) => entries as DisplayEntry[];
/**
 * `Intl` separa "R$" do número com espaço **não-quebrável**, então comparar com
 * um literal digitado à mão falha por um caractere invisível. O teste usa a
 * mesma função que a tela usa.
 */
const reais = (centavos: number) => formatMoney(centavos);
const achado = (a: ReturnType<typeof analisar>, id: string) => a.achados.find((x) => x.id === id);

describe('custoMensalDaRegra', () => {
  const base: RecurringRule = {
    id: 'r', description: 'x', amount: 12000, kind: 'expense', accountId: 'a1',
    toAccountId: null, categoryId: null, frequency: 'monthly', interval: 1,
    startDate: '2026-01-01', endDate: null, maxOccurrences: null,
    skippedDates: [], active: true, createdAt: STAMP, updatedAt: STAMP,
  };

  it('mensal é o próprio valor', () => {
    expect(custoMensalDaRegra(base)).toBe(12000);
  });

  it('a cada dois meses custa metade por mês', () => {
    expect(custoMensalDaRegra({ ...base, interval: 2 })).toBe(6000);
  });

  it('anual é diluído em doze meses', () => {
    expect(custoMensalDaRegra({ ...base, frequency: 'yearly' })).toBe(1000);
  });

  it('semanal vira 52 semanas divididas por 12 meses', () => {
    expect(custoMensalDaRegra({ ...base, amount: 1200, frequency: 'weekly' })).toBe(5200);
  });
});

describe('analisar', () => {
  it('acusa o período fechado no vermelho, com o tamanho do rombo', () => {
    const entradas = doMes([
      lancamento({ kind: 'income', amount: 300000, categoryId: 'salario' }),
      lancamento({ kind: 'expense', amount: 500000 }),
    ]);
    const a = analisar(carteira({ entries: [...entradas] }), comoExibidos(entradas), CATEGORIAS, HOJE);
    const negativo = achado(a, 'resultado-negativo');
    expect(negativo?.tom).toBe('ruim');
    expect(negativo?.texto).toContain(reais(200000)); // o quanto faltou
  });

  it('reconhece margem saudável em vez de só reclamar', () => {
    const entradas = doMes([
      lancamento({ kind: 'income', amount: 1000000, categoryId: 'salario' }),
      lancamento({ kind: 'expense', amount: 600000 }),
    ]);
    const a = analisar(carteira({ entries: [...entradas] }), comoExibidos(entradas), CATEGORIAS, HOJE);
    expect(achado(a, 'margem-boa')?.tom).toBe('bom');
    expect(achado(a, 'resultado-negativo')).toBeUndefined();
  });

  it('avisa quando sobra pouco, mesmo sem ficar negativo', () => {
    const entradas = doMes([
      lancamento({ kind: 'income', amount: 1000000, categoryId: 'salario' }),
      lancamento({ kind: 'expense', amount: 950000 }),
    ]);
    const a = analisar(carteira({ entries: [...entradas] }), comoExibidos(entradas), CATEGORIAS, HOJE);
    expect(achado(a, 'margem-apertada')?.tom).toBe('atencao');
  });

  /*
   * A comparação é com meses **fechados**. Comparar o mês corrente pela metade
   * com meses inteiros diria que tudo caiu, todo dia primeiro.
   */
  it('compara o período com a média dos meses fechados', () => {
    const passado = historico(6, 800000, 400000);
    const entradas = doMes([
      lancamento({ kind: 'income', amount: 800000, categoryId: 'salario' }),
      lancamento({ kind: 'expense', amount: 700000 }),
    ]);
    const a = analisar(carteira({ entries: [...passado, ...entradas] }), comoExibidos(entradas), CATEGORIAS, HOJE);

    const variacao = achado(a, 'variacao-do-gasto');
    expect(variacao?.titulo).toContain('acima');
    expect(variacao?.texto).toContain(reais(400000)); // a média
    expect(a.indicadores.find((i) => i.rotulo === 'Gasto vs. média')?.valor).toBe('+75%');
  });

  it('gastar menos que a média é notícia boa, não silêncio', () => {
    const passado = historico(6, 800000, 400000);
    const entradas = doMes([
      lancamento({ kind: 'income', amount: 800000, categoryId: 'salario' }),
      lancamento({ kind: 'expense', amount: 200000 }),
    ]);
    const a = analisar(carteira({ entries: [...passado, ...entradas] }), comoExibidos(entradas), CATEGORIAS, HOJE);
    expect(achado(a, 'variacao-do-gasto')?.tom).toBe('bom');
  });

  it('não afirma nada sobre padrão com menos de três meses fechados', () => {
    const passado = historico(1, 800000, 400000);
    const entradas = doMes([lancamento({ kind: 'expense', amount: 900000 })]);
    const a = analisar(carteira({ entries: [...passado, ...entradas] }), comoExibidos(entradas), CATEGORIAS, HOJE);

    expect(a.mesesDeHistorico).toBe(1);
    expect(achado(a, 'variacao-do-gasto')).toBeUndefined();
    expect(achado(a, 'pouco-historico')?.tom).toBe('neutro');
  });

  it('mede o custo fixo contra a renda, e alerta quando passa do limite', () => {
    const regra = (amount: number, id: string): RecurringRule => ({
      id, description: 'x', amount, kind: 'expense', accountId: 'a1', toAccountId: null,
      categoryId: 'moradia', frequency: 'monthly', interval: 1, startDate: '2026-01-01',
      endDate: null, maxOccurrences: null, skippedDates: [], active: true,
      createdAt: STAMP, updatedAt: STAMP,
    });
    const passado = historico(6, 1000000, 300000);
    const entradas = doMes([lancamento({ kind: 'income', amount: 1000000, categoryId: 'salario' })]);
    const data = carteira({ entries: [...passado, ...entradas], recurring: [regra(700000, 'r1')] });

    const a = analisar(data, entradas, CATEGORIAS, HOJE);
    expect(0.7).toBeGreaterThan(COMPROMETIMENTO_ALTO);
    expect(achado(a, 'fixo-alto')?.tom).toBe('ruim');
    expect(a.indicadores.find((i) => i.rotulo === 'Custo fixo por mês')?.detalhe).toBe('70% da renda');
  });

  it('regra pausada não conta como custo fixo', () => {
    const pausada: RecurringRule = {
      id: 'r1', description: 'x', amount: 900000, kind: 'expense', accountId: 'a1',
      toAccountId: null, categoryId: null, frequency: 'monthly', interval: 1,
      startDate: '2026-01-01', endDate: null, maxOccurrences: null, skippedDates: [],
      active: false, createdAt: STAMP, updatedAt: STAMP,
    };
    const entradas = doMes([lancamento({ kind: 'income', amount: 1000000, categoryId: 'salario' })]);
    const a = analisar(carteira({ entries: [...entradas], recurring: [pausada] }), comoExibidos(entradas), CATEGORIAS, HOJE);
    expect(achado(a, 'fixo-alto')).toBeUndefined();
  });

  it('soma as parcelas que ainda vão vencer, e não as já pagas', () => {
    const passado = historico(6, 800000, 100000);
    const parcelas = [
      lancamento({ date: '2026-08-05', amount: 50000, purchaseId: 'p1' }), // já passou
      lancamento({ date: '2026-10-05', amount: 50000, purchaseId: 'p1' }),
      lancamento({ date: '2026-11-05', amount: 50000, purchaseId: 'p1' }),
    ];
    const entradas = doMes([lancamento({ kind: 'expense', amount: 100000 })]);
    const a = analisar(
      carteira({ entries: [...passado, ...parcelas, ...entradas] }),
      entradas, CATEGORIAS, HOJE,
    );
    expect(a.indicadores.find((i) => i.rotulo === 'Parcelas a vencer')?.valor).toBe(reais(100000));
  });

  it('diz onde o dinheiro realmente vai quando há categorias suficientes', () => {
    const entradas = doMes([
      lancamento({ amount: 500000, categoryId: 'moradia' }),
      lancamento({ amount: 300000, categoryId: 'comida' }),
      lancamento({ amount: 100000, categoryId: 'lazer' }),
      lancamento({ amount: 10000, categoryId: null }),
    ]);
    const a = analisar(carteira({ entries: [...entradas] }), comoExibidos(entradas), CATEGORIAS, HOJE);
    const concentracao = achado(a, 'concentracao');
    expect(concentracao?.texto).toContain('Moradia');
    expect(concentracao?.texto).toContain('99%');
  });

  it('aponta a categoria que fugiu do próprio padrão, com os dois números', () => {
    const passado: Entry[] = [];
    for (let n = 1; n <= 4; n += 1) {
      const chave = addMonthsToKey(monthKey(HOJE), -n);
      passado.push(lancamento({ date: `${chave}-10`, amount: 100000, categoryId: 'lazer' }));
      passado.push(lancamento({ date: `${chave}-11`, amount: 200000, categoryId: 'comida' }));
    }
    const entradas = doMes([
      lancamento({ amount: 400000, categoryId: 'lazer' }),
      lancamento({ amount: 200000, categoryId: 'comida' }),
    ]);
    const a = analisar(carteira({ entries: [...passado, ...entradas] }), comoExibidos(entradas), CATEGORIAS, HOJE);

    const desvio = a.achados.find((x) => x.id.startsWith('desvio-Lazer'));
    expect(desvio?.titulo).toContain('para cima');
    expect(desvio?.texto).toContain(reais(400000));
    expect(desvio?.texto).toContain(reais(100000));
    // Alimentação ficou igual: não vira achado.
    expect(a.achados.some((x) => x.id.startsWith('desvio-Alimentação'))).toBe(false);
  });

  it('diz quando fechar no vermelho virou padrão', () => {
    const passado: Entry[] = [];
    for (let n = 1; n <= 6; n += 1) {
      const chave = addMonthsToKey(monthKey(HOJE), -n);
      passado.push(lancamento({ date: `${chave}-05`, kind: 'income', amount: 300000, categoryId: 'salario' }));
      passado.push(lancamento({ date: `${chave}-15`, kind: 'expense', amount: 400000 }));
    }
    const entradas = doMes([lancamento({ kind: 'expense', amount: 100000 })]);
    const a = analisar(carteira({ entries: [...passado, ...entradas] }), comoExibidos(entradas), CATEGORIAS, HOJE);

    expect(achado(a, 'padrao-negativo')?.tom).toBe('ruim');
    expect(a.indicadores.find((i) => i.rotulo === 'Meses no vermelho')?.valor).toBe('6 de 6');
  });

  it('o mais grave vem primeiro — é a ordem em que se deve ler', () => {
    const passado: Entry[] = [];
    for (let n = 1; n <= 6; n += 1) {
      const chave = addMonthsToKey(monthKey(HOJE), -n);
      passado.push(lancamento({ date: `${chave}-05`, kind: 'income', amount: 300000, categoryId: 'salario' }));
      passado.push(lancamento({ date: `${chave}-15`, kind: 'expense', amount: 400000 }));
    }
    const entradas = doMes([
      lancamento({ kind: 'income', amount: 100000, categoryId: 'salario' }),
      lancamento({ kind: 'expense', amount: 900000 }),
    ]);
    const a = analisar(carteira({ entries: [...passado, ...entradas] }), comoExibidos(entradas), CATEGORIAS, HOJE);
    expect(a.achados[0]!.id).toBe('resultado-negativo');
  });

  it('carteira vazia não inventa conclusão nenhuma', () => {
    const a = analisar(carteira(), [], CATEGORIAS, HOJE);
    expect(a.mesesDeHistorico).toBe(0);
    expect(a.achados.map((x) => x.id)).toEqual(['pouco-historico']);
  });

  it('todo achado carrega um número — sem número é opinião', () => {
    const passado = historico(6, 800000, 400000);
    const entradas = doMes([
      lancamento({ kind: 'income', amount: 800000, categoryId: 'salario' }),
      lancamento({ amount: 500000, categoryId: 'moradia' }),
      lancamento({ amount: 200000, categoryId: 'comida' }),
      lancamento({ amount: 100000, categoryId: 'lazer' }),
    ]);
    const a = analisar(carteira({ entries: [...passado, ...entradas] }), comoExibidos(entradas), CATEGORIAS, HOJE);
    expect(a.achados.length).toBeGreaterThan(1);
    for (const item of a.achados) {
      expect(item.texto, `"${item.titulo}" não traz número`).toMatch(/R\$|\d+%|\d+ d/);
    }
  });
});
