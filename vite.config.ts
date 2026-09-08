import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

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
    resolve: {
      // O arquivo único não tem service worker, então o módulo virtual do
      // plugin não existe nesse build: aponta para um substituto que não faz
      // nada, em vez de quebrar a compilação.
      alias: singlefile ? ({ 'virtual:pwa-register': '/src/pwa-ausente.ts' } as Record<string, string>) : ({} as Record<string, string>),
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
