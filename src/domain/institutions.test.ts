import { describe, expect, it } from 'vitest';

import { agruparPorInstituicao, instituicoesConhecidas, sugerirInstituicao } from './institutions.ts';
import type { Account } from './types.ts';

const STAMP = '2026-09-08T12:00:00.000Z';

function conta(nome: string, over: Partial<Account> = {}): Account {
  return {
    id: nome, name: nome, kind: 'checking', openingBalance: 0, color: 'blue', updatedAt: STAMP, ...over,
  };
}

describe('agruparPorInstituicao', () => {
  it('junta a conta e o cartão do mesmo banco', () => {
    const grupos = agruparPorInstituicao([
      conta('Nubank', { institution: 'Nubank' }),
      conta('Nubank cartão', { kind: 'credit_card', institution: 'Nubank' }),
    ]);
    expect(grupos).toHaveLength(1);
    expect(grupos[0]!.nome).toBe('Nubank');
    expect(grupos[0]!.contas.map((c) => c.name)).toEqual(['Nubank', 'Nubank cartão']);
    expect(grupos[0]!.avulsa).toBe(false);
  });

  it('conta sem instituição fica sozinha, e não vira cabeçalho de grupo', () => {
    const grupos = agruparPorInstituicao([conta('Carteira', { kind: 'cash' })]);
    expect(grupos).toHaveLength(1);
    expect(grupos[0]!.avulsa).toBe(true);
  });

  it('não junta bancos diferentes', () => {
    const grupos = agruparPorInstituicao([
      conta('Nubank', { institution: 'Nubank' }),
      conta('Itaú', { institution: 'Itaú' }),
    ]);
    expect(grupos.map((g) => g.nome)).toEqual(['Nubank', 'Itaú']);
  });

  it('ignora acento e caixa ao decidir se é o mesmo banco', () => {
    const grupos = agruparPorInstituicao([
      conta('Corrente', { institution: 'Itaú' }),
      conta('Cartão', { kind: 'credit_card', institution: 'itau' }),
    ]);
    expect(grupos).toHaveLength(1);
  });

  // A lista da tela não pode se reorganizar sozinha a cada edição.
  it('mantém a ordem em que as contas foram cadastradas', () => {
    const grupos = agruparPorInstituicao([
      conta('Carteira', { kind: 'cash' }),
      conta('Nubank', { institution: 'Nubank' }),
      conta('Nubank cartão', { kind: 'credit_card', institution: 'Nubank' }),
      conta('Itaú', { institution: 'Itaú' }),
    ]);
    expect(grupos.map((g) => g.nome)).toEqual(['Carteira', 'Nubank', 'Itaú']);
  });

  it('não perde nenhuma conta pelo caminho', () => {
    const contas = [conta('a'), conta('b', { institution: 'X' }), conta('c', { institution: 'X' })];
    const total = agruparPorInstituicao(contas).flatMap((g) => g.contas);
    expect(total).toHaveLength(3);
  });
});

describe('instituicoesConhecidas', () => {
  it('lista sem repetir, para o formulário sugerir', () => {
    expect(
      instituicoesConhecidas([
        conta('a', { institution: 'Nubank' }),
        conta('b', { institution: 'nubank' }),
        conta('c', { institution: 'Itaú' }),
        conta('d'),
      ]),
    ).toEqual(['Itaú', 'Nubank']);
  });
});

describe('sugerirInstituicao', () => {
  it('reconhece que "Nubank cartão" é do mesmo banco que "Nubank"', () => {
    expect(sugerirInstituicao([conta('Nubank')], 'Nubank cartão')).toBe('Nubank');
  });

  it('prefere o prefixo mais longo', () => {
    const contas = [conta('Banco'), conta('Banco do Brasil')];
    expect(sugerirInstituicao(contas, 'Banco do Brasil cartão')).toBe('Banco do Brasil');
  });

  it('nome de uma palavra só não tem prefixo — não chuta', () => {
    expect(sugerirInstituicao([conta('Nubank')], 'Nubank')).toBeNull();
  });

  it('não sugere nada quando nenhuma conta bate', () => {
    expect(sugerirInstituicao([conta('Nubank')], 'Inter cartão')).toBeNull();
  });

  it('não sugere a si mesma ao editar', () => {
    const existente = conta('Nubank cartão', { id: 'x' });
    expect(sugerirInstituicao([existente, conta('Nubank')], 'Nubank cartão', { ignorar: 'x' })).toBe('Nubank');
  });

  it('acha também pela instituição já declarada em outra conta', () => {
    const contas = [conta('Conta principal', { institution: 'Inter' })];
    expect(sugerirInstituicao(contas, 'Inter cartão')).toBe('Inter');
  });
});
