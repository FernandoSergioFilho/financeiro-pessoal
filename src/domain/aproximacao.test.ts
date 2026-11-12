import { describe, expect, it } from 'vitest';

import { aproximarNome, chaveFonetica, distancia, folga } from './aproximacao.ts';
import { nomesConhecidos } from './memoria.ts';
import type { Entry } from './types.ts';

const T = '2026-01-01T00:00:00.000Z';
let n = 0;
function entry(description: string, vezes = 1): Entry[] {
  return Array.from({ length: vezes }, () => ({
    id: `e${(n += 1)}`, date: '2026-10-10', description, amount: 1000, kind: 'expense' as const,
    accountId: 'a', toAccountId: null, categoryId: 'c', status: 'settled' as const,
    recurringId: null, occurrenceDate: null, purchaseId: null,
    installmentNumber: null, installmentTotal: null, createdAt: T, updatedAt: T,
  }));
}

describe('chaveFonetica', () => {
  it('iguala o que soa igual e se escreve diferente', () => {
    expect(chaveFonetica('Komprão')).toBe(chaveFonetica('comprão'));
    expect(chaveFonetica('açaí')).toBe(chaveFonetica('assaí'));
    expect(chaveFonetica('farmácia')).toBe(chaveFonetica('farmásia'));
    expect(chaveFonetica('Kasa')).toBe(chaveFonetica('casa'));
    expect(chaveFonetica('Bella')).toBe(chaveFonetica('Bela'));
    expect(chaveFonetica('Phelipe')).toBe(chaveFonetica('Felipe'));
    expect(chaveFonetica('Wilson')).toBe(chaveFonetica('Vilson'));
    expect(chaveFonetica('quiosque')).toBe(chaveFonetica('kiosque'));
  });

  it('não iguala o que soa diferente', () => {
    expect(chaveFonetica('mercado')).not.toBe(chaveFonetica('mercearia'));
    expect(chaveFonetica('luz')).not.toBe(chaveFonetica('sul'));
    expect(chaveFonetica('gasolina')).not.toBe(chaveFonetica('gelatina'));
  });

  it('o "c" muda de som conforme a letra seguinte', () => {
    // "cedo" soa com s; "casa" com k. A mesma letra, dois sons.
    expect(chaveFonetica('cedo')).toBe('sedo');
    expect(chaveFonetica('casa')).toBe('kasa');
  });
});

describe('distancia', () => {
  it('conta as letras que precisam mudar', () => {
    expect(distancia('mercado', 'mercado')).toBe(0);
    expect(distancia('mercado', 'mercados')).toBe(1);
    expect(distancia('mercado', 'marcado')).toBe(1);
    expect(distancia('', 'luz')).toBe(3);
  });
});

describe('folga', () => {
  it('nome curto não ganha folga nenhuma', () => {
    expect(folga(3)).toBe(0);
    expect(folga(5)).toBe(0);
  });

  it('cresce com o tamanho, até três', () => {
    expect(folga(6)).toBe(1);
    expect(folga(12)).toBe(2);
    expect(folga(40)).toBe(3);
  });
});

describe('aproximarNome', () => {
  const conhecidos = nomesConhecidos([
    ...entry('Komprão', 9),
    ...entry('Mercado', 3),
    ...entry('Farmácia São João', 2),
    ...entry('Luz'),
  ]);

  it('acha o nome que soa igual, escrito de outro jeito', () => {
    expect(aproximarNome('comprão', conhecidos)).toEqual({ nome: 'Komprão', motivo: 'som' });
  });

  it('reconhece o que já está igual', () => {
    expect(aproximarNome('komprao', conhecidos)).toEqual({ nome: 'Komprão', motivo: 'exato' });
  });

  it('aceita uma letra trocada em nome longo', () => {
    expect(aproximarNome('Marcado', conhecidos)?.nome).toBe('Mercado');
    expect(aproximarNome('Farmacia São Joao', conhecidos)?.nome).toBe('Farmácia São João');
  });

  it('não inventa nome a partir do que não existe', () => {
    expect(aproximarNome('Dentista', conhecidos)).toBeNull();
    expect(aproximarNome('Uber', conhecidos)).toBeNull();
  });

  it('não mexe em nome curto, onde tudo fica perto de tudo', () => {
    expect(aproximarNome('Sul', conhecidos)).toBeNull();
  });

  it('não casa dois nomes de verdade diferentes', () => {
    const lista = nomesConhecidos([...entry('Mercado'), ...entry('Mercearia')]);
    expect(aproximarNome('Mercearia', lista)?.nome).toBe('Mercearia');
    expect(aproximarNome('Mercado', lista)?.nome).toBe('Mercado');
  });

  it('texto vazio não casa com nada', () => {
    expect(aproximarNome('', conhecidos)).toBeNull();
    expect(aproximarNome('   ', conhecidos)).toBeNull();
  });

  it('sem nomes conhecidos, devolve nulo', () => {
    expect(aproximarNome('Komprão', [])).toBeNull();
  });
});
