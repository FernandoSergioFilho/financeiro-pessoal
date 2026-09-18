/**
 * Nenhum script pode carregar um caminho absoluto da máquina de quem escreveu.
 *
 * Isto existe por um estrago concreto. Uma sonda de navegador ficou com
 * `/home/user/financeiro-pessoal/...` escrito dentro dela. Aqui funcionava, e
 * o `npm run verificar` passava inteiro — mas o runner do GitHub clona o
 * repositório noutro lugar, e a publicação falhava com `MODULE_NOT_FOUND`.
 *
 * O resultado foi pior do que um erro barulhento: **três publicações seguidas
 * falharam sem ninguém perceber**, porque localmente estava tudo verde. O
 * aplicativo passou cinco dias sem receber correção nenhuma — incluindo a das
 * categorias que voltavam — enquanto era dito que estava publicado.
 *
 * A lição não é "prestar mais atenção": é que uma verificação que só roda numa
 * máquina não prova que o build funciona na máquina que publica. Este teste
 * roda no `npm test`, o primeiro passo do workflow, e transforma essa classe
 * de erro numa falha imediata e legível.
 *
 * Lê os arquivos pelo glob do Vite, e não por `node:fs`, para não precisar dos
 * tipos do Node dentro de `src` — que é código de navegador, e onde uma
 * chamada a `node:fs` seria um erro de verdade.
 */

import { describe, expect, it } from 'vitest';

const ARQUIVOS: Record<string, string> = {
  ...import.meta.glob('../test-navegador/**/*.mjs', { query: '?raw', import: 'default', eager: true }),
  ...import.meta.glob('../scripts/**/*.mjs', { query: '?raw', import: 'default', eager: true }),
  ...import.meta.glob('./**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }),
} as Record<string, string>;

/** Um caminho dentro de aspas que só existe numa máquina específica. */
const ABSOLUTO = /(["'`])(\/(?:home|Users|root)\/[^"'`\n]*)\1/g;

describe('nenhum caminho absoluto da máquina de quem escreveu', () => {
  it('enxerga os arquivos que deve conferir', () => {
    // Sem isto, um glob que não casa com nada faria o teste passar sem olhar
    // nada — exatamente o falso verde que ele existe para impedir.
    const nomes = Object.keys(ARQUIVOS);
    expect(nomes.length).toBeGreaterThan(30);
    expect(nomes.some((n) => n.includes('test-navegador/chave-de-ia.mjs'))).toBe(true);
    expect(nomes.some((n) => n.includes('scripts/'))).toBe(true);
  });

  it('nenhum arquivo tem caminho absoluto', () => {
    const achados: string[] = [];
    for (const [nome, conteudo] of Object.entries(ARQUIVOS)) {
      // Este arquivo cita esses caminhos para poder explicá-los.
      if (nome.includes('caminhos.test')) continue;
      for (const achado of conteudo.matchAll(ABSOLUTO)) achados.push(`${nome}: ${achado[2]}`);
    }
    expect(achados).toEqual([]);
  });
});
