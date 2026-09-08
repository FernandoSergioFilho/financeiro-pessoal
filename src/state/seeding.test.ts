import { describe, expect, it } from 'vitest';

import { decidirDepoisDaSync, semearNaCarga } from './seeding.ts';

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
