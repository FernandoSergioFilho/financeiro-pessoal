import { describe, expect, it } from 'vitest';

import { FILTRO_VAZIO, casaComFiltro, filtroEstaVazio, type Filtravel } from './filtros.ts';

const item: Filtravel = {
  description: 'Assinatura Netflix',
  accountId: 'nubank',
  toAccountId: null,
  categoryId: 'lazer',
};

const com = (patch: Partial<typeof FILTRO_VAZIO>) => ({ ...FILTRO_VAZIO, ...patch });

describe('casaComFiltro', () => {
  it('filtro vazio deixa tudo passar', () => {
    expect(casaComFiltro(item, FILTRO_VAZIO)).toBe(true);
  });

  it('acha ignorando acento e caixa', () => {
    expect(casaComFiltro({ ...item, description: 'Água e luz' }, com({ busca: 'AGUA' }))).toBe(true);
  });

  // Quem escreve duas palavras está procurando as duas, em qualquer ordem.
  it('casa palavra por palavra, fora de ordem', () => {
    expect(casaComFiltro(item, com({ busca: 'netflix assinatura' }))).toBe(true);
    expect(casaComFiltro(item, com({ busca: 'netflix cinema' }))).toBe(false);
  });

  it('espaço sobrando não muda o resultado', () => {
    expect(casaComFiltro(item, com({ busca: '  netflix  ' }))).toBe(true);
  });

  it('filtra por conta', () => {
    expect(casaComFiltro(item, com({ accountId: 'nubank' }))).toBe(true);
    expect(casaComFiltro(item, com({ accountId: 'itau' }))).toBe(false);
  });

  it('a conta de destino de uma transferência também conta', () => {
    const transferencia = { ...item, accountId: 'nubank', toAccountId: 'poupanca' };
    expect(casaComFiltro(transferencia, com({ accountId: 'poupanca' }))).toBe(true);
  });

  it('filtra por categoria, inclusive quem não tem nenhuma', () => {
    expect(casaComFiltro(item, com({ categoryId: 'lazer' }))).toBe(true);
    expect(casaComFiltro(item, com({ categoryId: 'moradia' }))).toBe(false);
    expect(casaComFiltro({ ...item, categoryId: null }, com({ categoryId: 'lazer' }))).toBe(false);
  });

  it('os filtros se somam, não se substituem', () => {
    expect(casaComFiltro(item, com({ busca: 'netflix', accountId: 'itau' }))).toBe(false);
    expect(casaComFiltro(item, com({ busca: 'netflix', accountId: 'nubank', categoryId: 'lazer' }))).toBe(true);
  });
});

describe('filtroEstaVazio', () => {
  it('reconhece o filtro sem nada preenchido', () => {
    expect(filtroEstaVazio(FILTRO_VAZIO)).toBe(true);
    expect(filtroEstaVazio(com({ busca: '   ' }))).toBe(true);
    expect(filtroEstaVazio(com({ accountId: 'x' }))).toBe(false);
  });
});
