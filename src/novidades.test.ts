import { describe, expect, it } from 'vitest';

import {
  LIMITE_DE_NOVIDADES, NOVIDADES, novidadesNaoVistas, pedacosDoTexto, type Novidade,
} from './novidades.ts';

const lista: Novidade[] = [
  { id: 'c', data: '2026-11-11', titulo: 'C', itens: ['c1'] },
  { id: 'b', data: '2026-10-12', titulo: 'B', itens: ['b1'] },
  { id: 'a', data: '2026-10-04', titulo: 'A', itens: ['a1'] },
];

describe('novidadesNaoVistas', () => {
  it('sem nada guardado, mostra só a mais nova', () => {
    expect(novidadesNaoVistas(lista, null).map((n) => n.id)).toEqual(['c']);
  });

  it('com a mais nova já vista, não mostra nada', () => {
    expect(novidadesNaoVistas(lista, 'c')).toEqual([]);
  });

  it('mostra tudo o que entrou depois da última vista', () => {
    expect(novidadesNaoVistas(lista, 'a').map((n) => n.id)).toEqual(['c', 'b']);
  });

  it('com um id que não existe mais, não mostra nada', () => {
    // Quem ficou versões demais sem abrir: não dá para saber o que já leu, e
    // repetir aviso lido incomoda mais do que pular um.
    expect(novidadesNaoVistas(lista, 'apagada')).toEqual([]);
  });

  it('não despeja mais que o limite de uma vez', () => {
    const muitas = Array.from({ length: 12 }, (_, i) => ({
      id: `v${i}`, data: '2026-01-01', titulo: `V${i}`, itens: ['x'],
    }));
    expect(novidadesNaoVistas(muitas, 'v11')).toHaveLength(LIMITE_DE_NOVIDADES);
  });

  it('lista vazia não quebra', () => {
    expect(novidadesNaoVistas([], null)).toEqual([]);
    expect(novidadesNaoVistas([], 'c')).toEqual([]);
  });
});

describe('pedacosDoTexto', () => {
  it('separa o que está entre asteriscos', () => {
    expect(pedacosDoTexto('segure **enquanto fala** e solte')).toEqual([
      { texto: 'segure ', forte: false },
      { texto: 'enquanto fala', forte: true },
      { texto: ' e solte', forte: false },
    ]);
  });

  it('texto sem marcação sai inteiro', () => {
    expect(pedacosDoTexto('nada aqui')).toEqual([{ texto: 'nada aqui', forte: false }]);
  });

  it('não devolve pedaço vazio', () => {
    expect(pedacosDoTexto('**tudo forte**')).toEqual([{ texto: 'tudo forte', forte: true }]);
  });
});

describe('a lista publicada', () => {
  it('não tem id repetido — é por ele que o app sabe o que já foi lido', () => {
    const ids = NOVIDADES.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('está da mais recente para a mais antiga', () => {
    const datas = NOVIDADES.map((n) => n.data);
    expect([...datas].sort().reverse()).toEqual(datas);
  });

  it('toda entrada tem título e ao menos um item', () => {
    for (const novidade of NOVIDADES) {
      expect(novidade.titulo.trim()).not.toBe('');
      expect(novidade.itens.length).toBeGreaterThan(0);
      for (const item of novidade.itens) expect(item.trim()).not.toBe('');
    }
  });

  it('nenhum asterisco solto, que apareceria cru na tela', () => {
    for (const novidade of NOVIDADES) {
      for (const item of novidade.itens) {
        expect(item.split('**').length % 2, `"${item}"`).toBe(1);
      }
    }
  });

  it('as datas são válidas', () => {
    for (const novidade of NOVIDADES) {
      expect(novidade.data, novidade.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
