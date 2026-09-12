import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HORAS_DE_ROTINA } from '../domain/backup.ts';
import type { Entry, FinanceData } from '../domain/types.ts';
import { LocalStorageRepository } from './repository.ts';
import { SCHEMA_VERSION } from './schema.ts';

const STAMP = '2026-09-08T12:00:00.000Z';

/** localStorage de mentira, com o mesmo contrato do de verdade. */
class Armazenamento {
  itens = new Map<string, string>();
  /** Quando ligado, gravar falha como falha o navegador com a cota cheia. */
  cheio = false;

  getItem(chave: string) { return this.itens.get(chave) ?? null; }
  setItem(chave: string, valor: string) {
    if (this.cheio) throw new DOMException('cota', 'QuotaExceededError');
    this.itens.set(chave, valor);
  }
  removeItem(chave: string) { this.itens.delete(chave); }
}

let armazenamento: Armazenamento;

beforeEach(() => {
  armazenamento = new Armazenamento();
  vi.stubGlobal('window', { localStorage: armazenamento });
  vi.useFakeTimers();
  vi.setSystemTime(new Date(STAMP));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function lancamento(id: string): Entry {
  return {
    id, date: '2026-09-10', description: 'x', amount: 100, kind: 'expense',
    accountId: 'a1', toAccountId: null, categoryId: null, status: 'settled',
    recurringId: null, occurrenceDate: null, purchaseId: null,
    installmentNumber: null, installmentTotal: null, createdAt: STAMP, updatedAt: STAMP,
  };
}

function carteira(quantos: number): FinanceData {
  return {
    version: SCHEMA_VERSION,
    accounts: [], categories: [],
    entries: Array.from({ length: quantos }, (_, i) => lancamento(`e${i}`)),
    recurring: [], purchases: [], tombstones: [],
  };
}

const avancar = (horas: number) => vi.setSystemTime(new Date(Date.parse(STAMP) + horas * 3_600_000));

describe('LocalStorageRepository', () => {
  it('grava e lê de volta', async () => {
    const repo = new LocalStorageRepository();
    expect(await repo.save(carteira(3))).toBe(true);
    expect((await repo.load()).entries).toHaveLength(3);
  });

  it('avisa por `false` quando o navegador recusa gravar, em vez de lançar', async () => {
    const repo = new LocalStorageRepository();
    armazenamento.cheio = true;
    expect(await repo.save(carteira(3))).toBe(false);
  });

  it('dado corrompido não derruba a leitura', async () => {
    armazenamento.setItem('financeiro-pessoal', '{isto não é json');
    expect((await new LocalStorageRepository().load()).entries).toEqual([]);
  });
});

describe('cópias automáticas', () => {
  it('a primeira gravação não copia nada — não havia nada a proteger', async () => {
    const repo = new LocalStorageRepository();
    await repo.save(carteira(10));
    expect(await repo.copias()).toEqual([]);
  });

  it('a segunda gravação guarda o estado anterior como rotina', async () => {
    const repo = new LocalStorageRepository();
    await repo.save(carteira(10));
    await repo.save(carteira(11));

    const copias = await repo.copias();
    expect(copias).toHaveLength(1);
    expect(copias[0]).toMatchObject({ motivo: 'rotina', registros: 10 });
  });

  it('não refaz a cópia de rotina a cada tecla', async () => {
    const repo = new LocalStorageRepository();
    await repo.save(carteira(10));
    await repo.save(carteira(11));
    await repo.save(carteira(12));
    await repo.save(carteira(13));

    const copias = await repo.copias();
    expect(copias).toHaveLength(1);
    expect(copias[0]!.registros).toBe(10); // continua a primeira, não a de agora
  });

  it('renova a rotina depois das horas combinadas', async () => {
    const repo = new LocalStorageRepository();
    await repo.save(carteira(10));
    await repo.save(carteira(11));

    avancar(HORAS_DE_ROTINA + 1);
    await repo.save(carteira(12));

    const copias = await repo.copias();
    expect(copias).toHaveLength(1);
    expect(copias[0]!.registros).toBe(11);
  });

  /*
   * O caso que justifica a coisa toda: "apagar tudo" no botão errado. A cópia
   * de queda sai na hora, sem esperar as seis horas da rotina, e fica ao lado
   * da de rotina em vez de por cima dela.
   */
  it('esvaziar a carteira guarda uma cópia de queda na hora', async () => {
    const repo = new LocalStorageRepository();
    await repo.save(carteira(10));
    await repo.save(carteira(11)); // cria a rotina
    await repo.save(carteira(0)); // o desastre

    const copias = await repo.copias();
    expect(copias.map((c) => c.motivo).sort()).toEqual(['queda', 'rotina']);
    expect(copias.find((c) => c.motivo === 'queda')!.registros).toBe(11);
  });

  it('a cópia de queda não é apagada pela rotina seguinte', async () => {
    const repo = new LocalStorageRepository();
    await repo.save(carteira(100));
    await repo.save(carteira(0)); // queda: guarda os 100

    avancar(HORAS_DE_ROTINA + 1);
    await repo.save(carteira(1));
    avancar(HORAS_DE_ROTINA + 1);
    await repo.save(carteira(2));

    const queda = (await repo.copias()).find((c) => c.motivo === 'queda');
    expect(queda?.registros).toBe(100);
  });

  /*
   * O apagar em lote pequeno: 5 de 300 não chega a ser queda, mas quem apagou
   * quer o caminho de volta. Antes não guardava nada.
   */
  it('apagar poucos em lote guarda a cópia do antes', async () => {
    const repo = new LocalStorageRepository();
    await repo.save(carteira(300));
    await repo.save(carteira(295));

    const lote = (await repo.copias()).find((c) => c.motivo === 'lote');
    expect(lote?.registros).toBe(300);
  });

  /*
   * E a razão de o lote ter gaveta própria em vez de escrever na da queda.
   * O desastre é o que se percebe tarde: se a exclusão miúda da semana
   * seguinte apagasse a cópia do "apagar tudo", a proteção teria sido
   * trocada por uma conveniência.
   */
  it('apagar pouco depois não come a cópia da perda grande', async () => {
    const repo = new LocalStorageRepository();
    await repo.save(carteira(300));
    await repo.save(carteira(2)); // o desastre: guarda os 300 na queda

    // Dias de uso normal por cima, com exclusões miúdas.
    await repo.save(carteira(40));
    await repo.save(carteira(39));
    avancar(HORAS_DE_ROTINA + 1);
    await repo.save(carteira(38));

    const copias = await repo.copias();
    expect(copias.find((c) => c.motivo === 'queda')!.registros).toBe(300);
    expect(copias.find((c) => c.motivo === 'lote')!.registros).toBe(39);
  });

  it('a cópia dá para restaurar tal e qual', async () => {
    const repo = new LocalStorageRepository();
    const original = carteira(10);
    await repo.save(original);
    await repo.save(carteira(0));

    const queda = (await repo.copias()).find((c) => c.motivo === 'queda')!;
    expect(queda.data.entries.map((e) => e.id)).toEqual(original.entries.map((e) => e.id));
  });

  it('cópia corrompida é ignorada, não quebra a tela que a lista', async () => {
    const repo = new LocalStorageRepository();
    armazenamento.setItem('financeiro-pessoal:copia-rotina', 'lixo');
    await expect(repo.copias()).resolves.toEqual([]);
  });

  it('sem espaço para a cópia, os dados de verdade continuam salvos', async () => {
    const repo = new LocalStorageRepository();
    await repo.save(carteira(10));

    // A gravação passa, a cópia é que não cabe.
    const original = armazenamento.setItem.bind(armazenamento);
    let primeira = true;
    armazenamento.setItem = (chave, valor) => {
      if (chave.includes('copia')) throw new DOMException('cota', 'QuotaExceededError');
      primeira = false;
      original(chave, valor);
    };

    expect(await repo.save(carteira(11))).toBe(true);
    expect(primeira).toBe(false);
    expect((await repo.load()).entries).toHaveLength(11);
  });
});
