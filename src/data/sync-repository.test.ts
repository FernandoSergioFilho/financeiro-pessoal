/**
 * Dois aparelhos contra o mesmo servidor.
 *
 * É o teste que representa o uso real — celular e notebook na mesma
 * carteira — e o que pega os erros que perdem lançamento.
 */

import { describe, expect, it } from 'vitest';
import type { Entry, FinanceData } from '../domain/types.ts';
import { MemoryRemote } from './memory-remote.ts';
import { emptyData } from './schema.ts';
import { InMemoryRepository, SyncingRepository, hasChanges, localChanges } from './sync-repository.ts';

let relogio = 0;
const tick = () => new Date(Date.UTC(2026, 8, 1, 0, 0, ++relogio)).toISOString();

function entry(id: string, updatedAt: string, over: Partial<Entry> = {}): Entry {
  return {
    id, date: '2026-09-10', description: `Lançamento ${id}`, amount: 1000,
    kind: 'expense', accountId: 'a1', toAccountId: null, categoryId: null,
    status: 'settled', recurringId: null, occurrenceDate: null,
    purchaseId: null, installmentNumber: null, installmentTotal: null,
    createdAt: updatedAt, updatedAt, ...over,
  };
}

/** Um aparelho: armazenamento próprio, apontando para o servidor comum. */
function aparelho(remote: MemoryRemote) {
  const local = new InMemoryRepository(emptyData());
  const repo = new SyncingRepository(local, remote, tick, null);
  return {
    local,
    repo,
    dados: () => local.current(),
    async grava(mutate: (d: FinanceData) => FinanceData) {
      await local.save(mutate(local.current()));
    },
    async sincroniza() {
      const merged = await repo.sync(local.current());
      if (merged) await local.save(merged);
      return merged;
    },
  };
}

describe('dois aparelhos na mesma carteira', () => {
  it('lançamento criado no celular aparece no notebook', async () => {
    const remote = new MemoryRemote();
    const celular = aparelho(remote);
    const notebook = aparelho(remote);

    await celular.grava((d) => ({ ...d, entries: [entry('a', tick())] }));
    await celular.sincroniza();
    await notebook.sincroniza();

    expect(notebook.dados().entries.map((e) => e.id)).toEqual(['a']);
  });

  it('apagar no notebook faz sumir do celular, sem ressuscitar', async () => {
    const remote = new MemoryRemote();
    const celular = aparelho(remote);
    const notebook = aparelho(remote);

    await celular.grava((d) => ({ ...d, entries: [entry('a', tick())] }));
    await celular.sincroniza();
    await notebook.sincroniza();

    await notebook.grava((d) => ({
      ...d,
      entries: [],
      tombstones: [{ table: 'entries', id: 'a', deletedAt: tick() }],
    }));
    await notebook.sincroniza();
    await celular.sincroniza();

    expect(celular.dados().entries).toEqual([]);

    // e continua sumido depois de sincronizar de novo dos dois lados
    await celular.sincroniza();
    await notebook.sincroniza();
    expect(celular.dados().entries).toEqual([]);
    expect(notebook.dados().entries).toEqual([]);
  });

  it('cada um edita um lançamento diferente e ninguém perde nada', async () => {
    const remote = new MemoryRemote();
    const celular = aparelho(remote);
    const notebook = aparelho(remote);

    await celular.grava((d) => ({ ...d, entries: [entry('x', tick()), entry('y', tick())] }));
    await celular.sincroniza();
    await notebook.sincroniza();

    await celular.grava((d) => ({ ...d, entries: [entry('x', tick(), { amount: 111 }), d.entries[1]!] }));
    await notebook.grava((d) => ({ ...d, entries: [d.entries[0]!, entry('y', tick(), { amount: 222 })] }));

    await celular.sincroniza();
    await notebook.sincroniza();
    await celular.sincroniza();

    for (const ap of [celular, notebook]) {
      expect(ap.dados().entries.find((e) => e.id === 'x')!.amount).toBe(111);
      expect(ap.dados().entries.find((e) => e.id === 'y')!.amount).toBe(222);
    }
  });

  it('os dois editam o mesmo lançamento: vence quem mexeu por último', async () => {
    const remote = new MemoryRemote();
    const celular = aparelho(remote);
    const notebook = aparelho(remote);

    await celular.grava((d) => ({ ...d, entries: [entry('x', tick())] }));
    await celular.sincroniza();
    await notebook.sincroniza();

    await celular.grava((d) => ({ ...d, entries: [entry('x', tick(), { amount: 111 })] }));
    await notebook.grava((d) => ({ ...d, entries: [entry('x', tick(), { amount: 222 })] })); // depois

    await celular.sincroniza();
    await notebook.sincroniza();
    await celular.sincroniza();

    expect(celular.dados().entries[0]!.amount).toBe(222);
    expect(notebook.dados().entries[0]!.amount).toBe(222);
  });

  it('os dois convergem para o mesmo estado depois de sincronizar', async () => {
    const remote = new MemoryRemote();
    const celular = aparelho(remote);
    const notebook = aparelho(remote);

    await celular.grava((d) => ({ ...d, entries: [entry('a', tick()), entry('b', tick())] }));
    await notebook.grava((d) => ({ ...d, entries: [entry('c', tick())] }));

    // duas rodadas: a primeira leva, a segunda traz
    for (let i = 0; i < 2; i += 1) {
      await celular.sincroniza();
      await notebook.sincroniza();
    }
    await celular.sincroniza();

    const ids = (d: FinanceData) => d.entries.map((e) => e.id).sort();
    expect(ids(celular.dados())).toEqual(['a', 'b', 'c']);
    expect(ids(celular.dados())).toEqual(ids(notebook.dados()));
  });
});

describe('sem conexão', () => {
  it('o app continua funcionando e nada se perde', async () => {
    const remote = new MemoryRemote();
    const celular = aparelho(remote);

    remote.offline = true;
    await celular.grava((d) => ({ ...d, entries: [entry('offline', tick())] }));
    expect(await celular.sincroniza()).toBeNull();
    expect(celular.repo.getState().status).toBe('offline');
    // o lançamento continua na mão do usuário
    expect(celular.dados().entries).toHaveLength(1);

    remote.offline = false;
    await celular.sincroniza();
    expect(celular.repo.getState().status).toBe('idle');

    const notebook = aparelho(remote);
    await notebook.sincroniza();
    expect(notebook.dados().entries.map((e) => e.id)).toEqual(['offline']);
  });

  it('avisa quem estiver ouvindo quando o estado muda', async () => {
    const remote = new MemoryRemote();
    const celular = aparelho(remote);
    const vistos: string[] = [];
    celular.repo.onStateChange((s) => vistos.push(s.status));

    await celular.sincroniza();
    expect(vistos).toContain('syncing');
    expect(vistos.at(-1)).toBe('idle');
  });
});

describe('alterações no meio da sincronização', () => {
  it('lançamento digitado enquanto a rede responde não se perde', async () => {
    // Enviar leva tempo. Se a marca de "já enviei até aqui" for tirada no
    // fim, o que o usuário digitou durante a espera parece enviado e nunca
    // sobe — some do outro aparelho para sempre.
    const remote = new MemoryRemote();
    const celular = aparelho(remote);
    const notebook = aparelho(remote);

    await celular.grava((d) => ({ ...d, entries: [entry('antes', tick())] }));

    const pushOriginal = remote.push.bind(remote);
    remote.push = async (changes) => {
      await pushOriginal(changes);
      // o usuário digita enquanto o envio ainda está em curso
      await celular.local.save({
        ...celular.local.current(),
        entries: [...celular.local.current().entries, entry('durante', tick())],
      });
    };

    await celular.repo.sync(celular.local.current());
    remote.push = pushOriginal;

    // a próxima sincronização precisa levar o que foi digitado no meio
    await celular.sincroniza();
    await notebook.sincroniza();

    expect(notebook.dados().entries.map((e) => e.id).sort()).toEqual(['antes', 'durante']);
  });
});

describe('exclusão contra edição, entre aparelhos', () => {
  it('editar offline algo que o outro já tinha apagado antes não ressuscita', async () => {
    const remote = new MemoryRemote();
    const celular = aparelho(remote);
    const notebook = aparelho(remote);

    await celular.grava((d) => ({ ...d, entries: [entry('x', tick())] }));
    await celular.sincroniza();
    await notebook.sincroniza();

    // o notebook edita primeiro, ainda offline
    const edicao = tick();
    await notebook.grava((d) => ({ ...d, entries: [entry('x', edicao, { amount: 999 })] }));

    // e o celular apaga depois
    await celular.grava((d) => ({
      ...d, entries: [], tombstones: [{ table: 'entries', id: 'x', deletedAt: tick() }],
    }));
    await celular.sincroniza();
    await notebook.sincroniza();

    expect(notebook.dados().entries).toEqual([]);
  });

  it('editar depois da exclusão traz o lançamento de volta', async () => {
    // Quem mexeu por último decidiu depois: é mais fácil apagar de novo do
    // que redigitar algo que sumiu sozinho.
    const remote = new MemoryRemote();
    const celular = aparelho(remote);
    const notebook = aparelho(remote);

    await celular.grava((d) => ({ ...d, entries: [entry('x', tick())] }));
    await celular.sincroniza();
    await notebook.sincroniza();

    await celular.grava((d) => ({
      ...d, entries: [], tombstones: [{ table: 'entries', id: 'x', deletedAt: tick() }],
    }));
    await celular.sincroniza();

    await notebook.grava((d) => ({ ...d, entries: [entry('x', tick(), { amount: 999 })] }));
    await notebook.sincroniza();
    await celular.sincroniza();

    expect(celular.dados().entries[0]).toMatchObject({ id: 'x', amount: 999 });
  });
});

describe('localChanges', () => {
  it('na primeira vez manda tudo', () => {
    const d: FinanceData = { ...emptyData(), entries: [entry('a', '2026-01-01T00:00:00.000Z')] };
    expect(localChanges(d, null).entries).toHaveLength(1);
  });

  it('depois manda só o que mudou desde a última vez', () => {
    const d: FinanceData = {
      ...emptyData(),
      entries: [entry('velho', '2026-01-01T00:00:00.000Z'), entry('novo', '2026-06-01T00:00:00.000Z')],
      tombstones: [{ table: 'entries', id: 'apagado', deletedAt: '2026-06-02T00:00:00.000Z' }],
    };
    const changes = localChanges(d, '2026-03-01T00:00:00.000Z');
    expect(changes.entries.map((e) => e.id)).toEqual(['novo']);
    expect(changes.tombstones).toHaveLength(1);
  });

  it('reconhece quando não há nada para enviar', () => {
    const d: FinanceData = { ...emptyData(), entries: [entry('a', '2026-01-01T00:00:00.000Z')] };
    expect(hasChanges(localChanges(d, '2026-06-01T00:00:00.000Z'))).toBe(false);
    expect(hasChanges(localChanges(d, null))).toBe(true);
  });
});

describe('economia de rede', () => {
  it('não envia nada quando não houve mudança local', async () => {
    const remote = new MemoryRemote();
    const celular = aparelho(remote);

    await celular.grava((d) => ({ ...d, entries: [entry('a', tick())] }));
    await celular.sincroniza();
    const pushesDepoisDoPrimeiro = remote.pushes;

    await celular.sincroniza();
    await celular.sincroniza();
    expect(remote.pushes).toBe(pushesDepoisDoPrimeiro);
  });
});
