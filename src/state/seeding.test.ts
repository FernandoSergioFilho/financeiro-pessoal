import { describe, expect, it } from 'vitest';

import { initialData, semearSemApagar } from '../data/seed.ts';
import { emptyData } from '../data/schema.ts';
import type { Account, Category, FinanceData } from '../domain/types.ts';
import { mergeData } from '../domain/sync.ts';
import { reducer } from './reducer.ts';
import { decidirDepoisDaSync, semearNaCarga } from './seeding.ts';

const AGORA = '2026-09-17T12:00:00.000Z';
const vazio = { accounts: [], entries: [] };
const comConta = { accounts: [{}], entries: [] };
const comLancamento = { accounts: [], entries: [{}] };

describe('semearNaCarga', () => {
  it('semeia o app local quando não há nada guardado', () => {
    expect(semearNaCarga(vazio, false)).toBe(true);
  });

  it('não semeia o app local que já tem dados', () => {
    expect(semearNaCarga(comConta, false)).toBe(false);
    expect(semearNaCarga(comLancamento, false)).toBe(false);
  });

  it('nunca semeia na carga quando há nuvem: local vazio é aparelho novo', () => {
    // Esta é a regressão: era aqui que cada aparelho criava seu próprio jogo
    // de contas e categorias padrão dentro da carteira compartilhada.
    expect(semearNaCarga(vazio, true)).toBe(false);
  });
});

describe('decidirDepoisDaSync', () => {
  it('espera enquanto a sincronização não terminou', () => {
    expect(decidirDepoisDaSync({ status: 'connecting', ultimaSync: null }, vazio)).toBe('esperar');
    expect(decidirDepoisDaSync({ status: 'ready', ultimaSync: null }, vazio)).toBe('esperar');
    expect(decidirDepoisDaSync({ status: 'error', ultimaSync: null }, vazio)).toBe('esperar');
  });

  it('semeia quando a carteira voltou vazia da nuvem', () => {
    expect(decidirDepoisDaSync({ status: 'ready', ultimaSync: '2026-09-08T12:00:00.000Z' }, vazio)).toBe('semear');
  });

  it('não semeia quando a sincronização trouxe conteúdo', () => {
    const sincronizado = { status: 'ready', ultimaSync: '2026-09-08T12:00:00.000Z' };
    expect(decidirDepoisDaSync(sincronizado, comConta)).toBe('nao-precisa');
    expect(decidirDepoisDaSync(sincronizado, comLancamento)).toBe('nao-precisa');
  });
});

/*
 * O relato do usuário, duas vezes: abrir o app num navegador novo duplicava as
 * categorias e não trazia o que já estava lançado.
 *
 * A decisão de semear depende de três valores que chegam por caminhos
 * diferentes — o estado da nuvem, a data da última sincronização e os dados —
 * e não há como garantir que cheguem juntos à mesma renderização. Em vez de
 * perseguir o instante certo, a semeadura passou a ser incapaz de estragar:
 * disparada na hora errada, o pior que faz é nada.
 */
describe('semear sem poder apagar nem repetir', () => {
  const conta = (id: string, name: string, kind: Account['kind']): Account =>
    ({ id, name, kind, openingBalance: 0, updatedAt: '2026-09-10T10:00:00.000Z' }) as Account;
  const categoria = (id: string, name: string, kind: Category['kind']): Category =>
    ({ id, name, kind, updatedAt: '2026-09-10T10:00:00.000Z' }) as Category;

  /** Uma carteira como a que veio do servidor: cheia, e com os padrões dentro. */
  const daNuvem = (): FinanceData => {
    const base = initialData();
    return {
      ...base,
      accounts: base.accounts.map((a, i) => conta(`servidor-a${i}`, a.name, a.kind)),
      categories: base.categories.map((c, i) => categoria(`servidor-c${i}`, c.name, c.kind)),
      entries: [{ id: 'e1', description: 'Mercado' }] as unknown as FinanceData['entries'],
    };
  };

  it('semear por engano não apaga o que veio da nuvem', () => {
    const vindo = daNuvem();
    expect(semearSemApagar(vindo).entries).toHaveLength(1);
    expect(semearSemApagar(vindo)).toBe(vindo); // nem sequer um objeto novo
  });

  it('semear por engano não cria um segundo jogo de contas e categorias', () => {
    const vindo = daNuvem();
    const depois = semearSemApagar(vindo);
    const repetidos = (nomes: readonly { name: string; kind: string }[]) =>
      nomes.filter((x, i) => nomes.findIndex((y) => y.name === x.name && y.kind === x.kind) !== i);
    expect(repetidos(depois.accounts)).toEqual([]);
    expect(repetidos(depois.categories)).toEqual([]);
    expect(depois.accounts).toHaveLength(vindo.accounts.length);
  });

  it('numa carteira de verdade vazia, semear ainda cria tudo', () => {
    const novo = semearSemApagar(emptyData());
    expect(novo.accounts.length).toBe(initialData().accounts.length);
    expect(novo.categories.length).toBe(initialData().categories.length);
  });

  it('completa só o que falta quando a carteira tem parte dos padrões', () => {
    const meio: FinanceData = {
      ...emptyData(),
      accounts: [conta('a1', 'Conta corrente', 'checking')],
      categories: [categoria('c1', 'Alimentação', 'expense')],
    };
    const novo = semearSemApagar(meio);
    expect(novo.accounts.filter((a) => a.name === 'Conta corrente')).toHaveLength(1);
    expect(novo.categories.filter((c) => c.name === 'Alimentação')).toHaveLength(1);
    expect(novo.accounts.find((a) => a.id === 'a1')).toBeDefined(); // a original ficou
  });

  /*
   * A corrida em si, pelas duas ordens que ela pode produzir. A decisão de
   * semear e a chegada dos dados da nuvem são dois `dispatch` diferentes, e
   * nada garante qual roda primeiro.
   *
   * O que este teste cobra não é uma ordem certa — é que NENHUMA das duas
   * estrague a carteira. Foi a tentativa de acertar o instante que falhou
   * duas vezes; o que fecha o buraco é a semeadura não ter mais como ferir.
   */
  it.each([
    ['a nuvem chega primeiro, e aí semeia', ['nuvem', 'semear']],
    ['semeia primeiro, e a nuvem chega depois', ['semear', 'nuvem']],
  ])('%s: nem apaga nem repete', (_nome, ordem) => {
    const servidor = daNuvem();
    let estado = emptyData();
    for (const passo of ordem) {
      // `aplicar` troca o estado pelo resultado da fusão feita DENTRO do
      // `sync`, que é um retrato de antes da semeadura — é `data/replace`, e
      // não uma fusão com o estado da tela. O teste imita isso, e não uma
      // versão idealizada.
      estado = passo === 'nuvem'
        ? reducer(estado, { type: 'data/replace', data: mergeData(emptyData(), servidor, AGORA) })
        : reducer(estado, { type: 'data/seed-missing' });
    }
    // E a sincronização seguinte, que é quando um repetido apareceria.
    const depoisDeSincronizar = mergeData(estado, servidor, AGORA);

    const repetidas = new Map<string, number>();
    for (const c of depoisDeSincronizar.categories) {
      const chave = `${c.kind}:${c.name}`;
      repetidas.set(chave, (repetidas.get(chave) ?? 0) + 1);
    }
    expect([...repetidas].filter(([, n]) => n > 1)).toEqual([]);
    expect(depoisDeSincronizar.entries).toHaveLength(1); // o lançamento do servidor continua lá
  });

  /*
   * O ganho dos ids determinísticos, isolado: dois aparelhos novos na MESMA
   * carteira nova, cada um semeando por conta própria — que é a situação em
   * que a duplicação nasceu das duas vezes.
   *
   * Com id sorteado, cada um criava a sua "Alimentação" e a fusão guardava as
   * duas, porque juntar por id é o certo e os ids eram diferentes. Com o id
   * vindo do nome, os dois chegam ao mesmo id e a fusão junta numa só.
   */
  it('dois aparelhos semeando a mesma carteira nova chegam a um jogo só', () => {
    const aparelhoA = semearSemApagar(emptyData());
    const aparelhoB = semearSemApagar(emptyData());
    const juntado = mergeData(aparelhoA, aparelhoB, AGORA);

    expect(juntado.categories).toHaveLength(aparelhoA.categories.length);
    expect(juntado.accounts).toHaveLength(aparelhoA.accounts.length);
  });

  it('o mesmo nome escrito diferente não vira repetido', () => {
    const meio: FinanceData = {
      ...emptyData(),
      categories: [categoria('c1', 'ALIMENTACAO', 'expense')],
    };
    expect(semearSemApagar(meio).categories.filter((c) => /aliment/i.test(c.name))).toHaveLength(1);
  });
});
