/**
 * Toda sonda de navegador tem de rodar também no workflow que publica.
 *
 * O `npm run verificar` roda tudo aqui, mas quem decide se a versão vai ao ar
 * é o `.github/workflows/deploy.yml`, e lá as sondas estão listadas **uma a
 * uma**. Acrescentar uma sonda e esquecer dessa lista deixa o verde local
 * mentindo: a sonda existe, passa aqui, e nunca roda antes de publicar.
 *
 * Foi o que aconteceu com `test:ditado` e `test:novidades` — duas sondas
 * escritas, registradas no `verificar`, e ausentes da publicação. Este teste
 * roda no `npm test`, que é o primeiro passo do próprio workflow, e transforma
 * o esquecimento numa falha imediata.
 *
 * Lê os arquivos pelo glob do Vite, e não por `node:fs`, pelo mesmo motivo
 * explicado em `caminhos.test.ts`.
 */

import { describe, expect, it } from 'vitest';

const PACOTE = import.meta.glob('../package.json', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>;

const WORKFLOWS = import.meta.glob('../.github/workflows/*.yml', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>;

/**
 * As sondas, reconhecidas pelo que executam e não pelo nome.
 *
 * `test:watch` também começa com `test:` e não é sonda nenhuma — é o vitest em
 * modo interativo. Olhar o comando em vez do nome dispensa manter aqui uma
 * lista de exceções que envelheceria.
 */
function sondasDeNavegador(scripts: Record<string, string>): string[] {
  return Object.entries(scripts)
    .filter(([, comando]) => comando.includes('test-navegador/'))
    .map(([nome]) => nome);
}

describe('a publicação roda tudo o que o verificar roda', () => {
  it('enxerga os arquivos que deve conferir', () => {
    // Um glob que não casa com nada faria todo o resto passar sem olhar nada.
    expect(Object.keys(PACOTE)).toHaveLength(1);
    expect(Object.keys(WORKFLOWS).length).toBeGreaterThan(0);
  });

  it('nenhuma sonda ficou de fora do workflow', () => {
    const scripts = JSON.parse(Object.values(PACOTE)[0]!).scripts as Record<string, string>;
    const sondas = sondasDeNavegador(scripts);
    expect(sondas.length).toBeGreaterThan(4);

    const workflow = Object.values(WORKFLOWS).join('\n');
    const faltando = sondas.filter((sonda) => !workflow.includes(`npm run ${sonda}`));
    expect(faltando).toEqual([]);
  });

  it('o verificar também não esqueceu nenhuma', () => {
    const scripts = JSON.parse(Object.values(PACOTE)[0]!).scripts as Record<string, string>;
    const verificar = scripts.verificar ?? '';
    expect(verificar).not.toBe('');
    const faltando = sondasDeNavegador(scripts)
      .filter((sonda) => !verificar.includes(`npm run ${sonda}`));
    expect(faltando).toEqual([]);
  });
});
