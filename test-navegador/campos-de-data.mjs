/**
 * Apagar a data com o teclado não pode derrubar a tela.
 *
 * Existe por um defeito relatado assim: "quando estou adicionando data e
 * coloco 0 ou aperto backspace, a tela some". A causa era `parseISO` lançar
 * exceção com string vazia — e uma exceção durante o desenho faz o React
 * desmontar a árvore inteira, deixando a página em branco.
 *
 * O caminho do mouse nunca chegava lá: o seletor de data só produz datas
 * completas. Só o teclado alcança o estado vazio, e é por isso que este teste
 * digita em vez de clicar.
 *
 * Uso: npm run build:single && npm run test:telas
 *
 * Precisa do Chromium do Playwright (`npx playwright install chromium` uma
 * vez). Para apontar para outro executável: `CHROMIUM=/caminho/do/chrome`.
 */
import { chromium } from 'playwright';

const APP = `file://${new URL('../financeiro.html', import.meta.url).pathname}`;

const CENARIOS = [
  ['Novo → Avulso', async (p) => abrirNovo(p)],
  ['Novo → Parcelado', async (p) => abrirNovo(p, 'Parcelado')],
  ['Novo → Recorrente', async (p) => abrirNovo(p, 'Recorrente')],
  ['Editar lançamento', async (p) => {
    await ir(p, 'lancamentos');
    await p.click('.entry');
  }],
  ['Editar recorrente', async (p) => {
    await ir(p, 'recorrentes');
    await p.click('tr.clicavel');
  }],
];

async function ir(p, pagina) {
  await p.goto(`${APP}#/${pagina}`);
  await p.waitForTimeout(700);
}

async function abrirNovo(p, aba) {
  await ir(p, 'painel');
  await p.click('text=+ Novo lançamento');
  await p.waitForTimeout(300);
  if (aba) {
    await p.click(`.segmented button:text-is("${aba}")`);
    await p.waitForTimeout(300);
  }
}

const APAGAR = {
  'Backspace': async (campo) => {
    await campo.press('Control+a');
    await campo.press('Backspace');
  },
  'digitar "0"': async (campo) => {
    await campo.press('Control+a');
    await campo.type('0');
  },
};

const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
let falhas = 0;

for (const [nome, abrir] of CENARIOS) {
  for (const [comoApagar, apagar] of Object.entries(APAGAR)) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();

    await page.goto(`${APP}#/ajustes`);
    await page.waitForTimeout(800);
    await page.click('text=Carregar dados de exemplo').catch(() => {});
    await page.waitForTimeout(400);
    await abrir(page);

    if ((await page.locator('.dialog input[type=date]').count()) === 0) {
      console.log(`⏭️  ${nome} (${comoApagar}): não tem campo de data`);
      await ctx.close();
      continue;
    }

    const campo = page.locator('.dialog input[type=date]').first();
    await campo.click();
    await apagar(campo);
    await page.waitForTimeout(500);

    const estado = await page.evaluate(() => ({
      raizVazia: (document.getElementById('root')?.childElementCount ?? 0) === 0,
      // Procura o elemento desenhado: no arquivo único o JavaScript mora
      // dentro do <body>, então `body.textContent` traria o código-fonte junto.
      salvaVidas: [...document.querySelectorAll('#root h3')].some((h) =>
        h.textContent?.includes('Alguma coisa quebrou'),
      ),
    }));

    if (estado.raizVazia) {
      console.log(`❌ ${nome} (${comoApagar}): a tela sumiu`);
      falhas += 1;
    } else if (estado.salvaVidas) {
      console.log(`❌ ${nome} (${comoApagar}): caiu no salva-vidas — algo lançou durante o desenho`);
      falhas += 1;
    } else {
      console.log(`✅ ${nome} (${comoApagar})`);
    }
    await ctx.close();
  }
}

await browser.close();
console.log('──────────────────────────────────────────────');
console.log(falhas === 0 ? 'TUDO PASSOU' : `${falhas} FALHA(S)`);
process.exit(falhas === 0 ? 0 : 1);
