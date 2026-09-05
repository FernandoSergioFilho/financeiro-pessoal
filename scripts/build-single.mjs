/**
 * Junta o build `singlefile` num único `financeiro.html`.
 *
 * O resultado abre com dois cliques, sem servidor e sem internet: o CSS entra
 * como <style> e o JavaScript como <script> comum — nada é buscado do disco em
 * tempo de execução, que é o que quebraria numa origem `file://`.
 */

import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const buildDir = join(root, 'dist-single');
const output = join(root, 'financeiro.html');

const assetsDir = join(buildDir, 'assets');
const assets = await readdir(assetsDir);

const cssName = assets.find((name) => name.endsWith('.css'));
const jsName = assets.find((name) => name.endsWith('.js'));
if (!cssName || !jsName) {
  throw new Error(`Esperava um .css e um .js em ${assetsDir}, encontrei: ${assets.join(', ')}`);
}

const [html, css, js] = await Promise.all([
  readFile(join(buildDir, 'index.html'), 'utf8'),
  readFile(join(assetsDir, cssName), 'utf8'),
  readFile(join(assetsDir, jsName), 'utf8'),
]);

/** Um `</script>` dentro do código encerraria a tag mais cedo e quebraria a página. */
const safeJs = js.replaceAll('</script>', '<\\/script>');

/**
 * A substituição precisa ser por função, e não por string: numa string de
 * substituição o `$` é especial, e o bundle do React tem `$$typeof` e afins —
 * `$$` viraria `$` e `$&` colaria a tag original de volta, corrompendo o
 * arquivo em silêncio.
 */
/**
 * O CSS fica no lugar do <link>, mas o script vai para o fim do <body>.
 * `type="module"` é adiado automaticamente; um <script> clássico no <head>
 * roda antes do body existir e não acharia o #root onde o app monta.
 */
let result = html
  .replace(new RegExp(`\\s*<link[^>]+href="[^"]*${cssName}"[^>]*>`), () => `\n    <style>\n${css}\n    </style>`)
  .replace(new RegExp(`\\s*<script[^>]+src="[^"]*${jsName}"[^>]*></script>`), '')
  .replace('</body>', () => `  <script>\n${safeJs}\n    </script>\n  </body>`);

// Se algo não foi substituído, o arquivo sairia quebrado em silêncio.
for (const [label, name] of [['CSS', cssName], ['JavaScript', jsName]]) {
  if (result.includes(name)) throw new Error(`Não consegui embutir o ${label} (${name}) no HTML.`);
}
if (!result.includes('<style>') || !result.includes('<script>')) {
  throw new Error('O HTML final ficou sem <style> ou sem <script>.');
}
if (result.indexOf('<script>') < result.indexOf('<div id="root">')) {
  throw new Error('O script precisa vir depois do #root, senão o app não encontra onde montar.');
}

// O index.html aponta para ícones em arquivos separados, que fazem sentido no
// site publicado mas não existem ao lado de um HTML solto na pasta de
// downloads. O favicon entra embutido; o resto, que só serve para instalar o
// app pelo navegador, sai fora.
const favicon = await readFile(join(buildDir, 'favicon.svg'), 'utf8');
const faviconInline = `data:image/svg+xml,${encodeURIComponent(favicon)}`;

result = result
  .replace(/href="\.\/favicon\.svg"/, () => `href="${faviconInline}"`)
  .replace(/\s*<link[^>]+rel="apple-touch-icon"[^>]*>/, '')
  .replace(/\s*<link[^>]+href="[^"]*manifest\.webmanifest"[^>]*>/, '')
  .replace(/\s*<script[^>]+src="[^"]*registerSW\.js"[^>]*><\/script>/, '');

if (/(src|href)="\.\//.test(result)) {
  const sobrou = result.match(/(src|href)="\.\/[^"]*"/g);
  throw new Error(`O arquivo único ficou com referência externa: ${sobrou?.join(', ')}`);
}

result = result.replace(
  '</head>',
  '  <!-- Arquivo único: abra com dois cliques. Tudo fica salvo neste navegador. -->\n  </head>',
);

await writeFile(output, result, 'utf8');

const kb = (Buffer.byteLength(result, 'utf8') / 1024).toFixed(0);
console.log(`financeiro.html gerado (${kb} kB) — abra com dois cliques.`);
