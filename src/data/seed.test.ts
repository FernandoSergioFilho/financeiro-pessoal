import { describe, expect, it } from 'vitest';

import { categoriasPadraoQueFaltam, defaultCategories } from './seed.ts';
import type { Category } from '../domain/types.ts';

describe('defaultCategories', () => {
  it('traz Caridade entre as saídas', () => {
    const caridade = defaultCategories().find((c) => c.name === 'Caridade');
    expect(caridade).toMatchObject({ kind: 'expense', emoji: '🤝' });
  });

  it('não repete nome dentro do mesmo tipo', () => {
    const chaves = defaultCategories().map((c) => `${c.kind}:${c.name}`);
    expect(new Set(chaves).size).toBe(chaves.length);
  });

  // A cor repete porque a paleta tem oito slots; o que não pode é duas
  // categorias vizinhas na lista saírem com a mesma cor.
  it('não põe duas cores iguais lado a lado', () => {
    const saidas = defaultCategories().filter((c) => c.kind === 'expense');
    for (let i = 1; i < saidas.length; i += 1) {
      expect(saidas[i]!.color, `${saidas[i]!.name} depois de ${saidas[i - 1]!.name}`)
        .not.toBe(saidas[i - 1]!.color);
    }
  });
});

describe('categoriasPadraoQueFaltam', () => {
  it('não oferece nada para quem já tem tudo', () => {
    expect(categoriasPadraoQueFaltam(defaultCategories())).toEqual([]);
  });

  /* O caso real: a carteira foi criada antes de a categoria existir. */
  it('oferece a categoria que a carteira nunca chegou a receber', () => {
    const antigas = defaultCategories().filter((c) => c.name !== 'Caridade');
    expect(categoriasPadraoQueFaltam(antigas).map((c) => c.name)).toEqual(['Caridade']);
  });

  it('ignora acento e caixa: "alimentacao" já é Alimentação', () => {
    const renomeada = defaultCategories().map((c) =>
      c.name === 'Alimentação' ? { ...c, name: 'alimentacao' } : c,
    );
    expect(categoriasPadraoQueFaltam(renomeada)).toEqual([]);
  });

  it('mesmo nome em outro tipo não conta — "Outros" existe dos dois lados', () => {
    const soEntradas: Category[] = defaultCategories().filter((c) => c.kind === 'income');
    const faltando = categoriasPadraoQueFaltam(soEntradas);
    expect(faltando.every((c) => c.kind === 'expense')).toBe(true);
    expect(faltando.map((c) => c.name)).toContain('Outros');
  });

  it('devolve categorias novas em folha, com id próprio', () => {
    const faltando = categoriasPadraoQueFaltam([]);
    expect(new Set(faltando.map((c) => c.id)).size).toBe(faltando.length);
  });
});
