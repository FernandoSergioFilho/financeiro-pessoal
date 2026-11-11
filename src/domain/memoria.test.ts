import { describe, expect, it } from 'vitest';

import { lembrar, nomesConhecidos } from './memoria.ts';
import type { Entry } from './types.ts';

let contador = 0;

function entry(over: Partial<Entry> = {}): Entry {
  contador += 1;
  const stamp = `2026-01-01T00:00:0${contador % 10}.000Z`;
  return {
    id: `e${contador}`, date: '2026-10-10', description: 'Mercado', amount: 9200,
    kind: 'expense', accountId: 'nubank', toAccountId: null, categoryId: 'alim',
    status: 'settled', recurringId: null, occurrenceDate: null, purchaseId: null,
    installmentNumber: null, installmentTotal: null,
    createdAt: stamp, updatedAt: stamp, ...over,
  };
}

describe('nomesConhecidos', () => {
  it('junta as grafias diferentes do mesmo nome', () => {
    const nomes = nomesConhecidos([
      entry({ description: 'Mercado' }),
      entry({ description: 'mercado' }),
      entry({ description: '  MERCADO  ' }),
    ]);
    expect(nomes).toHaveLength(1);
    expect(nomes[0]!.quantas).toBe(3);
  });

  it('oferece a grafia mais recente', () => {
    const nomes = nomesConhecidos([
      entry({ description: 'mercado', date: '2026-01-10' }),
      entry({ description: 'Mercado do mês', date: '2026-10-10' }),
      entry({ description: 'mercado', date: '2026-02-10' }),
    ]);
    expect(nomes.find((n) => n.chave === 'mercado')!.nome).toBe('mercado');
    expect(nomes.map((n) => n.nome)).toContain('Mercado do mês');
  });

  it('põe o mais repetido primeiro, e desempata pelo mais recente', () => {
    const nomes = nomesConhecidos([
      entry({ description: 'Luz', date: '2026-01-10' }),
      entry({ description: 'Luz', date: '2026-02-10' }),
      entry({ description: 'Gasolina', date: '2026-10-10' }),
      entry({ description: 'Água', date: '2026-09-10' }),
    ]);
    expect(nomes.map((n) => n.nome)).toEqual(['Luz', 'Gasolina', 'Água']);
  });

  it('ignora descrição vazia', () => {
    expect(nomesConhecidos([entry({ description: '   ' })])).toHaveLength(0);
  });

  it('respeita o limite', () => {
    const muitos = Array.from({ length: 50 }, (_, i) => entry({ description: `Coisa ${i}` }));
    expect(nomesConhecidos(muitos, 10)).toHaveLength(10);
  });
});

describe('lembrar', () => {
  it('devolve nulo sem histórico', () => {
    expect(lembrar([], 'Mercado')).toBeNull();
    expect(lembrar([entry()], 'Farmácia')).toBeNull();
  });

  it('devolve nulo com nome curto, que casaria com qualquer coisa', () => {
    expect(lembrar([entry({ description: 'Luz' })], 'Lu')).toBeNull();
  });

  it('traz a conta, a categoria e o tipo do que já foi lançado', () => {
    const lembranca = lembrar([entry()], 'mercado');
    expect(lembranca).toMatchObject({
      kind: 'expense', accountId: 'nubank', categoryId: 'alim', quantas: 1,
    });
  });

  it('vence a categoria mais frequente, não a última', () => {
    const lembranca = lembrar([
      entry({ categoryId: 'alim', date: '2026-01-10' }),
      entry({ categoryId: 'alim', date: '2026-02-10' }),
      entry({ categoryId: 'casa', date: '2026-10-10' }),
    ], 'Mercado');
    expect(lembranca!.categoryId).toBe('alim');
  });

  it('no empate, vale o mais recente', () => {
    const lembranca = lembrar([
      entry({ categoryId: 'alim', date: '2026-01-10' }),
      entry({ categoryId: 'casa', date: '2026-10-10' }),
    ], 'Mercado');
    expect(lembranca!.categoryId).toBe('casa');
  });

  it('o valor é o da última vez, e diz se ele sempre foi o mesmo', () => {
    const variavel = lembrar([
      entry({ amount: 9200, date: '2026-01-10' }),
      entry({ amount: 8800, date: '2026-10-10' }),
    ], 'Mercado');
    expect(variavel!.amount).toBe(8800);
    expect(variavel!.valorEstavel).toBe(false);

    const fixo = lembrar([
      entry({ description: 'Aluguel', amount: 180000, date: '2026-01-05' }),
      entry({ description: 'Aluguel', amount: 180000, date: '2026-10-05' }),
    ], 'Aluguel');
    expect(fixo!.amount).toBe(180000);
    expect(fixo!.valorEstavel).toBe(true);
  });

  it('não deixa o estorno estragar o voto das compras', () => {
    const lembranca = lembrar([
      entry({ kind: 'expense', accountId: 'nubank', date: '2026-01-10' }),
      entry({ kind: 'expense', accountId: 'nubank', date: '2026-02-10' }),
      // Devolveram: entrou na carteira. É o mais recente, e não pode virar o
      // padrão de um nome que é de saída dez vezes.
      entry({ kind: 'income', accountId: 'carteira', date: '2026-10-10' }),
    ], 'Mercado');
    expect(lembranca).toMatchObject({ kind: 'expense', accountId: 'nubank', quantas: 2 });
  });

  it('prefere o nome exato ao parecido', () => {
    const lembranca = lembrar([
      entry({ description: 'Mercado do mês', categoryId: 'casa' }),
      entry({ description: 'Mercado', categoryId: 'alim' }),
    ], 'Mercado');
    expect(lembranca!.categoryId).toBe('alim');
    expect(lembranca!.quantas).toBe(1);
  });

  it('aceita o parecido quando não há exato', () => {
    const lembranca = lembrar([entry({ description: 'Mercado do mês', categoryId: 'casa' })], 'Mercado');
    expect(lembranca!.categoryId).toBe('casa');
    expect(lembranca!.nome).toBe('Mercado do mês');
  });

  it('pula a conta e a categoria que não existem mais', () => {
    const entries = [
      entry({ accountId: 'apagada', categoryId: 'arquivada', date: '2026-10-10' }),
      entry({ accountId: 'nubank', categoryId: 'alim', date: '2026-01-10' }),
    ];
    const lembranca = lembrar(entries, 'Mercado', {
      contas: new Set(['nubank']),
      categorias: new Set(['alim']),
    });
    expect(lembranca).toMatchObject({ accountId: 'nubank', categoryId: 'alim' });
  });

  it('sem categoria em nenhuma vez, devolve sem categoria', () => {
    expect(lembrar([entry({ categoryId: null })], 'Mercado')!.categoryId).toBeNull();
  });
});
