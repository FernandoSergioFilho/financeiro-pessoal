import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/**
 * Dois alvos de build:
 *
 * - o normal, em módulos ES, para hospedar num servidor mais adiante;
 * - `--mode singlefile`, que sai como IIFE para virar um `financeiro.html`
 *   único, aberto direto do disco. Módulos ES são bloqueados por CORS em
 *   `file://` e a página abriria em branco; um script clássico não tem essa
 *   restrição.
 */
export default defineConfig(({ mode }) => {
  const singlefile = mode === 'singlefile';

  return {
    plugins: [react()],
    base: singlefile ? './' : '/',
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
