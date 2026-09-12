import { afterEach, describe, expect, it, vi } from 'vitest';

import { procurarAtualizacao } from './atualizacao.ts';

function ambiente({
  protocolo = 'https:',
  registro,
  temServiceWorker = true,
}: {
  protocolo?: string;
  registro?: unknown;
  temServiceWorker?: boolean;
}) {
  vi.stubGlobal('window', { location: { protocol: protocolo } });
  vi.stubGlobal(
    'navigator',
    temServiceWorker ? { serviceWorker: { getRegistration: () => Promise.resolve(registro) } } : {},
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('procurarAtualizacao', () => {
  /*
   * O arquivo único aberto do disco não tem service worker, e perguntar por um
   * lá devolve erro de segurança — que a mensagem de falha traduzia como
   * "falta internet". Dizer isso seria mentir para quem pergunta.
   */
  it('no arquivo único, explica que a atualização é manual', async () => {
    ambiente({ protocolo: 'file:' });
    await expect(procurarAtualizacao()).resolves.toMatch(/arquivo único/);
  });

  it('navegador sem service worker já abre sempre a versão nova', async () => {
    ambiente({ temServiceWorker: false });
    await expect(procurarAtualizacao()).resolves.toMatch(/mais nova/);
  });

  it('sem nada guardado, também já está na versão nova', async () => {
    ambiente({ registro: undefined });
    await expect(procurarAtualizacao()).resolves.toMatch(/mais nova/);
  });

  it('nada novo depois de procurar: diz que está em dia', async () => {
    ambiente({ registro: { update: () => Promise.resolve(), installing: null, waiting: null } });
    await expect(procurarAtualizacao()).resolves.toBe('Você já está na versão mais nova.');
  });

  it('versão nova esperando: avisa que o aviso vai aparecer', async () => {
    ambiente({ registro: { update: () => Promise.resolve(), installing: null, waiting: {} } });
    await expect(procurarAtualizacao()).resolves.toMatch(/Versão nova encontrada/);
  });

  it('versão nova ainda baixando também conta como encontrada', async () => {
    ambiente({ registro: { update: () => Promise.resolve(), installing: {}, waiting: null } });
    await expect(procurarAtualizacao()).resolves.toMatch(/Versão nova encontrada/);
  });

  it('sem rede, admite que não deu para verificar em vez de dizer que está em dia', async () => {
    ambiente({ registro: { update: () => Promise.reject(new Error('offline')) } });
    const frase = await procurarAtualizacao();
    expect(frase).toMatch(/Não deu para verificar/);
    expect(frase).not.toMatch(/mais nova/);
  });
});
