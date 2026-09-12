import { execSync } from 'node:child_process';

import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * A versão que o app mostra em Ajustes.
 *
 * Existe para uma pergunta que apareceu no uso real — "o botão novo não está
 * aqui, será que atualizou?" — e que não tinha como ser respondida nem por
 * quem usa nem por quem programa. Com a versão na tela, a resposta é uma
 * olhada.
 */
function versaoDoBuild(): string {
  const data = new Date().toISOString().slice(0, 10);
  try {
    const commit = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
    return `${data} · ${commit}`;
  } catch {
    // Build fora de um repositório git: a data já identifica.
    return data;
  }
}

/**
 * Dois alvos de build:
 *
 * - o normal, em módulos ES, publicado num endereço na web;
 * - `--mode singlefile`, que sai como IIFE para virar um `financeiro.html`
 *   único, aberto direto do disco. Módulos ES são bloqueados por CORS em
 *   `file://` e a página abriria em branco; um script clássico não tem essa
 *   restrição.
 *
 * Os dois usam caminho relativo. O site publicado fica num subdiretório
 * (`/financeiro-pessoal/`), e fixar o nome do repositório aqui faria o app
 * quebrar ao ser renomeado ou publicado em outro lugar. Dá certo porque a
 * navegação vive no hash da URL: não há rota de caminho para se perder.
 */
export default defineConfig(({ mode }) => {
  const singlefile = mode === 'singlefile';

  return {
    base: './',
    define: { __VERSAO_DO_APP__: JSON.stringify(versaoDoBuild()) },
    resolve: {
      // O arquivo único não tem service worker, então o módulo virtual do
      // plugin não existe nesse build: aponta para um substituto que não faz
      // nada, em vez de quebrar a compilação.
      // O mesmo motivo vale para os leitores de PDF e imagem: inliná-los faria
      // o `financeiro.html` passar de 640 kB para dezenas de megabytes, num
      // arquivo cuja graça é caber num pendrive. O substituto explica isso na
      // tela em vez de simplesmente não funcionar.
      // O alias casa com o **especificador** do import, não com o caminho já
      // resolvido — por isso os leitores pesados são importados por um nome
      // próprio, `#pesados`, e não por caminho relativo. Com caminho relativo o
      // alias não pega, o pdf.js entra no arquivo único e o build quebra.
      alias: {
        '#pesados': singlefile ? '/src/data/banco-pesados-ausente.ts' : '/src/data/banco-pesados.ts',
        ...(singlefile ? { 'virtual:pwa-register': '/src/pwa-ausente.ts' } : {}),
      } as Record<string, string>,
    },
    plugins: [
      react(),
      // O arquivo único é offline por natureza: não faz sentido registrar um
      // service worker nele, e o plugin só atrapalharia.
      ...(singlefile
        ? []
        : [
            VitePWA({
              // Avisa em vez de trocar por baixo. Com `autoUpdate` o worker
              // novo assumia na hora, mas a página aberta continuava rodando
              // o JavaScript antigo — a mudança só aparecia no SEGUNDO
              // recarregamento, e quem estava usando não tinha como saber
              // disso. Agora o app pergunta, e a troca acontece quando a
              // pessoa manda, sem risco de recarregar por cima de um
              // formulário pela metade.
              registerType: 'prompt',
              // O registro é feito no código do app (src/atualizacao.ts), que
              // precisa saber a hora de avisar; deixar o plugin injetar o dele
              // registraria o worker duas vezes.
              injectRegister: null,
              includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
              manifest: {
                name: 'Financeiro pessoal',
                short_name: 'Financeiro',
                description: 'Lançamentos, contas recorrentes e compras parceladas.',
                lang: 'pt-BR',
                start_url: './',
                scope: './',
                display: 'standalone',
                background_color: '#f2f1ee',
                theme_color: '#2a78d6',
                icons: [
                  { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
                  { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
                  { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
                ],
              },
              workbox: {
                globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
                // O leitor de PDF (1,7 MB entre a biblioteca e o worker) não
                // entra no pré-cache: ele é carregado só quando alguém importa
                // um PDF, e pré-cachear triplicaria o tamanho da instalação de
                // quem nunca vai usar. Fica para a rede na hora do uso.
                globIgnores: ['**/pdf-*.js', '**/pdf.worker*'],
                // O maior arquivo que sobra é o app; sem o teto explícito, um
                // pedaço grande passaria despercebido para dentro da instalação.
                maximumFileSizeToCacheInBytes: 900 * 1024,
                // Sem rede, qualquer endereço do app cai no index: a
                // navegação é por hash, então isso basta para abrir offline.
                navigateFallback: 'index.html',
              },
            }),
          ]),
    ],
    server: { port: 5173, host: true },
    build: singlefile
      ? {
          outDir: 'dist-single',
          modulePreload: false,
          cssCodeSplit: false,
          rollupOptions: {
            output: {
              format: 'iife',
              inlineDynamicImports: true,
              // Nomes fixos e no mesmo lugar: o script de junção não precisa
              // adivinhar hash nem pasta.
              entryFileNames: 'assets/app.js',
              assetFileNames: 'assets/[name][extname]',
            },
          },
        }
      : {},
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts'],
    },
  };
});
