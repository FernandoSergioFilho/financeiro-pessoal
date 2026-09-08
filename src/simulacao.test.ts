/**
 * Simulação de uso: o app inteiro, exercitado como uma pessoa o usaria.
 *
 * Os outros testes provam pedaços; este prova o caminho. A carteira é a de
 * `carteiraExemplo` — duas pessoas, três contas correntes, quatro cartões,
 * investimento, doze meses de histórico, quatro parcelamentos e cinco contas
 * recorrentes — e daqui em diante toda alteração passa por ela antes de virar
 * deploy.
 *
 * Cada bug que já apareceu vira um caso nomeado na seção "não volta a
 * acontecer". Um teste de regressão que nunca falhou não prova nada, então
 * cada um deles foi visto falhando contra o código de antes da correção.
 */

import { describe, expect, it } from 'vitest';

import { carteiraExemplo } from './data/carteira-exemplo.ts';
import { migrate } from './data/schema.ts';
import { contaEmUso, moverConta, usoDaConta } from './domain/accounts.ts';
import { addMonths, monthKey, today } from './domain/date.ts';
import { contarDuplicados, juntarDuplicados } from './domain/duplicates.ts';
import { buildPurchase } from './domain/installments.ts';
import { intervaloDoPeriodo, intervaloVisivel, limiteDaPrevisao, moverPeriodo, type Periodo } from './domain/period.ts';
import { projectAll } from './domain/recurrence.ts';
import { accountBalance, netWorth, periodTotals, totalsByCategory } from './domain/summary.ts';
import { mergeData } from './domain/sync.ts';
import type { Entry, FinanceData } from './domain/types.ts';
import { entriesInRange } from './state/selectors.ts';
import { reducer, type Action } from './state/reducer.ts';

const HOJE = '2026-09-08';
const AGORA = '2026-09-08T12:00:00.000Z';

function carteira(): FinanceData {
  return carteiraExemplo({ hoje: HOJE });
}

/** Aplica uma sequência de ações como a tela aplicaria. */
function usar(inicial: FinanceData, ...acoes: Action[]): FinanceData {
  return acoes.reduce(reducer, inicial);
}

const conta = (data: FinanceData, nome: string) => data.accounts.find((a) => a.name === nome)!;
const categoria = (data: FinanceData, nome: string) => data.categories.find((c) => c.name === nome)!;

function lancamento(data: FinanceData, over: Partial<Entry> = {}): Entry {
  return {
    id: 'novo', date: HOJE, description: 'Padaria', amount: 2400,
    kind: 'expense', accountId: conta(data, 'Nubank').id, toAccountId: null,
    categoryId: categoria(data, 'Alimentação').id, status: 'settled',
    recurringId: null, occurrenceDate: null, purchaseId: null,
    installmentNumber: null, installmentTotal: null,
    createdAt: AGORA, updatedAt: AGORA, ...over,
  };
}

/* ------------------------------------------------ a carteira faz sentido */

describe('a carteira de exemplo', () => {
  it('tem o tamanho do caso real: 2 pessoas, 3 contas, 4 cartões', () => {
    const data = carteira();
    expect(data.accounts.filter((a) => a.kind === 'checking')).toHaveLength(3);
    expect(data.accounts.filter((a) => a.kind === 'credit_card')).toHaveLength(4);
    expect(data.accounts.filter((a) => a.kind === 'investment')).toHaveLength(1);
    expect(data.recurring).toHaveLength(5);
    expect(data.purchases).toHaveLength(4);
    expect(data.entries.length).toBeGreaterThan(100);
  });

  it('passa pela validação do próprio app, sem migração pendente', () => {
    const data = carteira();
    expect(migrate(JSON.parse(JSON.stringify(data)))).toEqual(data);
  });

  it('não tem id repetido — ids repetidos quebram a sincronização', () => {
    const data = carteira();
    const ids = [
      ...data.accounts, ...data.categories, ...data.entries,
      ...data.recurring, ...data.purchases,
    ].map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('não tem lançamento apontando para conta ou categoria que não existe', () => {
    const data = carteira();
    const contas = new Set(data.accounts.map((a) => a.id));
    const cats = new Set(data.categories.map((c) => c.id));
    for (const entry of data.entries) {
      expect(contas.has(entry.accountId)).toBe(true);
      if (entry.toAccountId) expect(contas.has(entry.toAccountId)).toBe(true);
      if (entry.categoryId) expect(cats.has(entry.categoryId)).toBe(true);
    }
  });

  it('cada parcelamento soma exatamente o total da compra', () => {
    const data = carteira();
    for (const compra of data.purchases) {
      const parcelas = data.entries.filter((e) => e.purchaseId === compra.id);
      expect(parcelas).toHaveLength(compra.installments);
      expect(parcelas.reduce((soma, p) => soma + p.amount, 0)).toBe(compra.totalAmount);
    }
  });
});

/* ------------------------------------------- o que a pessoa faz no dia a dia */

describe('registrar, editar e apagar', () => {
  it('lançamento avulso entra, muda de valor e sai, sem levar nada junto', () => {
    const inicial = carteira();
    const antes = inicial.entries.length;

    let data = usar(inicial, { type: 'entry/create', entry: lancamento(inicial) });
    expect(data.entries).toHaveLength(antes + 1);

    data = usar(data, { type: 'entry/update', id: 'novo', patch: { amount: 9900 }, updatedAt: AGORA });
    expect(data.entries.find((e) => e.id === 'novo')!.amount).toBe(9900);

    data = usar(data, { type: 'entry/delete', id: 'novo', deletedAt: AGORA });
    expect(data.entries).toHaveLength(antes);
    expect(data.accounts).toHaveLength(inicial.accounts.length);
    expect(data.purchases).toHaveLength(inicial.purchases.length);
  });

  it('compra parcelada gera as N parcelas e some inteira quando apagada', () => {
    const inicial = carteira();
    const gerarId = (() => { let n = 0; return () => `sim${(n += 1)}`; })();
    const { purchase, entries } = buildPurchase(
      { description: 'Celular', totalAmount: 359900, installments: 10, firstDate: HOJE,
        accountId: conta(inicial, 'Nubank cartão').id, categoryId: null },
      gerarId, AGORA,
    );

    let data = usar(inicial, { type: 'purchase/create', purchase, entries });
    expect(data.entries.filter((e) => e.purchaseId === purchase.id)).toHaveLength(10);
    expect(entries.reduce((s, e) => s + e.amount, 0)).toBe(359900);

    data = usar(data, { type: 'purchase/delete', id: purchase.id, deletedAt: AGORA });
    expect(data.entries.filter((e) => e.purchaseId === purchase.id)).toHaveLength(0);
    expect(data.purchases.find((p) => p.id === purchase.id)).toBeUndefined();
  });

  it('recorrente aparece nos meses seguintes e some quando a regra é apagada', () => {
    const inicial = carteira();
    const internet = inicial.recurring.find((r) => r.description === 'Internet')!;
    const janela = [monthKey(HOJE), monthKey(addMonths(HOJE, 3))];

    const previstos = projectAll(inicial.recurring, inicial.entries, `${janela[0]}-01`, `${janela[1]}-28`)
      .filter((p) => p.recurringId === internet.id);
    expect(previstos.length).toBeGreaterThanOrEqual(3);

    const data = usar(inicial, { type: 'recurring/delete', id: internet.id, deletedAt: AGORA });
    expect(projectAll(data.recurring, data.entries, `${janela[0]}-01`, `${janela[1]}-28`)
      .filter((p) => p.recurringId === internet.id)).toHaveLength(0);
  });

  it('pular uma ocorrência não apaga as outras', () => {
    const inicial = carteira();
    const academia = inicial.recurring.find((r) => r.description === 'Academia')!;
    const mes = monthKey(HOJE);
    const previstos = projectAll(inicial.recurring, inicial.entries, `${mes}-01`, `${mes}-28`)
      .filter((p) => p.recurringId === academia.id);
    const alvo = previstos[0]!;

    const data = usar(inicial, { type: 'occurrence/skip', recurringId: academia.id, date: alvo.date, updatedAt: AGORA });
    const depois = projectAll(data.recurring, data.entries, `${mes}-01`, `${mes}-28`)
      .filter((p) => p.recurringId === academia.id);
    expect(depois.some((p) => p.date === alvo.date)).toBe(false);
    expect(data.recurring.find((r) => r.id === academia.id)!.active).toBe(true);
  });

  it('transferência move dinheiro entre contas sem virar receita nem despesa', () => {
    const inicial = carteira();
    const de = conta(inicial, 'Nubank');
    const para = conta(inicial, 'Tesouro Direto');
    const antesDe = accountBalance(de, inicial.entries);
    const antesPara = accountBalance(para, inicial.entries);

    const data = usar(inicial, {
      type: 'entry/create',
      entry: lancamento(inicial, { id: 'transf', kind: 'transfer', amount: 50000, accountId: de.id, toAccountId: para.id, categoryId: null }),
    });

    expect(accountBalance(de, data.entries)).toBe(antesDe - 50000);
    expect(accountBalance(para, data.entries)).toBe(antesPara + 50000);
    expect(netWorth(data.accounts, data.entries)).toBe(netWorth(inicial.accounts, inicial.entries));
    expect(periodTotals([data.entries.find((e) => e.id === 'transf')!])).toMatchObject({ income: 0, expense: 0 });
  });
});

/* ----------------------------------------------------- olhar por período */

describe('ver o gasto por período', () => {
  const graos: Periodo['grao'][] = ['dia', 'mes', 'trimestre', 'ano', 'tudo'];

  it('todo grão devolve um intervalo válido e um total somável', () => {
    const data = carteira();
    for (const grao of graos) {
      const { de, ate } = intervaloDoPeriodo({ grao, ancora: HOJE });
      expect(de <= ate).toBe(true);
      const totais = periodTotals(entriesInRange(data, de, ate));
      expect(totais.net).toBe(totais.income - totais.expense);
    }
  });

  it('quanto maior o período, mais gasto cabe dentro dele', () => {
    const data = carteira();
    const gasto = (grao: Periodo['grao']) => {
      const { de, ate } = intervaloDoPeriodo({ grao, ancora: HOJE });
      return periodTotals(entriesInRange(data, de, ate)).expense;
    };
    expect(gasto('dia')).toBeLessThanOrEqual(gasto('mes'));
    expect(gasto('mes')).toBeLessThanOrEqual(gasto('trimestre'));
    expect(gasto('trimestre')).toBeLessThanOrEqual(gasto('ano'));
    expect(gasto('ano')).toBeLessThanOrEqual(gasto('tudo'));
  });

  it('o trimestre é exatamente a soma dos seus três meses', () => {
    const data = carteira();
    const tri = intervaloDoPeriodo({ grao: 'trimestre', ancora: HOJE });
    const doTrimestre = periodTotals(entriesInRange(data, tri.de, tri.ate)).expense;

    const meses = [-2, -1, 0].map((n) => intervaloDoPeriodo({ grao: 'mes', ancora: addMonths(HOJE, n) }));
    const soma = meses.reduce((total, m) => total + periodTotals(entriesInRange(data, m.de, m.ate)).expense, 0);
    expect(doTrimestre).toBe(soma);
  });

  it('o período anterior não encosta no atual', () => {
    const atual: Periodo = { grao: 'mes', ancora: HOJE };
    const anterior = moverPeriodo(atual, -1);
    expect(intervaloDoPeriodo(anterior).ate < intervaloDoPeriodo(atual).de).toBe(true);
  });

  it('categorias somadas batem com o total de saídas do período', () => {
    const data = carteira();
    const { de, ate } = intervaloDoPeriodo({ grao: 'mes', ancora: HOJE });
    const doMes = entriesInRange(data, de, ate);
    const porCategoria = totalsByCategory(doMes, data.categories, 'expense');
    expect(porCategoria.reduce((s, linha) => s + linha.amount, 0)).toBe(periodTotals(doMes).expense);
  });
});

/* ------------------------------------------- não volta a acontecer */

describe('não volta a acontecer', () => {
  /*
   * "Tem conta que não tem nenhum lançamento vinculado, mas não dá pra apagar."
   * A tela só mostrava um mês por vez, então o lançamento de onze meses atrás
   * não aparecia em canto nenhum — e segurava a conta.
   */
  it('o lançamento antigo que segura a conta aparece no período "Tudo"', () => {
    const data = carteira();
    const bb = conta(data, 'Banco do Brasil');
    expect(contaEmUso(data, bb.id)).toBe(true);

    const doMes = intervaloDoPeriodo({ grao: 'mes', ancora: HOJE });
    const noMes = entriesInRange(data, doMes.de, doMes.ate).filter((e) => e.accountId === bb.id);
    expect(noMes).toHaveLength(0); // era aqui que o usuário concluía "não tem nada"

    const tudo = intervaloVisivel({ grao: 'tudo', ancora: HOJE }, data.entries.map((e) => e.date), HOJE);
    const emTudo = entriesInRange(data, tudo.de, tudo.ate).filter((e) => e.accountId === bb.id);
    expect(emTudo.length).toBeGreaterThan(0);
    expect(usoDaConta(data, bb.id).lancamentos).toBe(emTudo.length);
  });

  it('o previsto lá na frente também aparece, em vez de ficar escondido', () => {
    const data = carteira();
    const amex = conta(data, 'Amex');
    const tudo = intervaloVisivel({ grao: 'tudo', ancora: HOJE }, data.entries.map((e) => e.date), HOJE);
    const seguro = entriesInRange(data, tudo.de, tudo.ate).find((e) => e.description === 'Seguro do carro');
    expect(seguro).toBeDefined();
    expect(seguro!.accountId).toBe(amex.id);
  });

  /*
   * "Tudo" vai até 9999-12-31. Sem o horizonte de previsão, cada regra mensal
   * geraria quase cem mil ocorrências e a tela travava ao abrir.
   */
  it('o período "Tudo" não gera décadas de recorrentes inventadas', () => {
    const data = carteira();
    const tudo = intervaloDoPeriodo({ grao: 'tudo', ancora: HOJE });
    const previstos = projectAll(data.recurring, data.entries, tudo.de, limiteDaPrevisao(tudo.ate, HOJE));
    expect(previstos.length).toBeLessThan(200);
    expect(previstos.every((p) => p.date <= limiteDaPrevisao(tudo.ate, HOJE))).toBe(true);
  });

  /*
   * Apagar as parcelas uma a uma deixava a compra para trás, sem parcela
   * nenhuma, prendendo a conta para sempre.
   */
  it('apagar todas as parcelas à mão não deixa compra órfã segurando a conta', () => {
    const inicial = carteira();
    const compra = inicial.purchases.find((p) => p.description === 'Passagens')!;
    const parcelas = inicial.entries.filter((e) => e.purchaseId === compra.id);

    const data = usar(inicial, ...parcelas.map((p): Action => ({ type: 'entry/delete', id: p.id, deletedAt: AGORA })));
    expect(data.purchases.find((p) => p.id === compra.id)).toBeUndefined();
    expect(usoDaConta(data, compra.accountId).comprasOrfas).toBe(0);
  });

  /*
   * Cada aparelho que abria o app criava seu próprio jogo de contas e
   * categorias padrão dentro da carteira compartilhada.
   */
  it('a carteira não tem cadastro repetido, e juntar não muda nada', () => {
    const data = carteira();
    expect(contarDuplicados(data)).toEqual({ contas: 0, categorias: 0 });
    expect(juntarDuplicados(data, AGORA).data).toBe(data);
  });

  /*
   * A exclusão precisa vencer a sincronização: sem lápide, o outro aparelho
   * devolve o registro apagado na volta.
   */
  it('o que foi apagado num aparelho não volta na sincronização', () => {
    const inicial = carteira();
    const alvo = inicial.entries.find((e) => e.description === 'Tarifa antiga')!;
    const noAparelho = usar(inicial, { type: 'entry/delete', id: alvo.id, deletedAt: AGORA });

    const juntado = mergeData(noAparelho, inicial, AGORA);
    expect(juntado.entries.find((e) => e.id === alvo.id)).toBeUndefined();
  });

  it('mover tudo de uma conta e apagá-la não perde um centavo', () => {
    const inicial = carteira();
    const bb = conta(inicial, 'Banco do Brasil');
    const nubank = conta(inicial, 'Nubank');
    const patrimonioAntes = netWorth(inicial.accounts, inicial.entries);
    const saldoBB = accountBalance(bb, inicial.entries);

    const { data: movido } = moverConta(inicial, bb.id, nubank.id, AGORA);
    const data = usar(movido, { type: 'account/delete', id: bb.id, deletedAt: AGORA });

    expect(data.accounts.find((a) => a.id === bb.id)).toBeUndefined();
    expect(contaEmUso(data, bb.id)).toBe(false);
    // O saldo inicial da conta apagada vai embora com ela; o movimento, não.
    expect(netWorth(data.accounts, data.entries)).toBe(patrimonioAntes - bb.openingBalance);
    expect(saldoBB).not.toBe(0); // a conta realmente tinha vida, senão o teste não prova nada
  });

  it('a data de hoje do sistema continua sendo uma data válida do domínio', () => {
    expect(today()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
