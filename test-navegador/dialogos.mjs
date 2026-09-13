/**
 * Varredura de CSS dos diálogos: celular, tablet e notebook.
 *
 * A `simulacao.mjs` percorre as cinco páginas em nove larguras, mas um diálogo
 * só existe depois de um clique — e foi por essa fresta que passou o defeito
 * que originou este arquivo: na conferência do extrato importado as larguras
 * fixas das colunas somavam 474px numa tela de 390, e a descrição, única coluna
 * elástica, encolhia para **6 pixels**. Verde na simulação, ilegível no celular.
 *
 * Aqui cada diálogo é aberto nas três larguras que importam, nos dois temas, e
 * quatro coisas são cobradas:
 *
 *   - a página não passa a rolar de lado;
 *   - o diálogo cabe na tela e não rola de lado por dentro;
 *   - nenhum texto fica cortado (o `scrollWidth` maior que o `clientWidth`);
 *   - nenhuma célula de tabela com conteúdo fica estreita demais para ler.
 *
 * Uso: npm run build:single && npm run test:dialogos
 * Chromium alternativo: CHROMIUM=/caminho/do/chrome
 */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const APP = `file://${new URL('../financeiro.html', import.meta.url).pathname}`;
const HOJE = new Date().toISOString().slice(0, 10);

/* A mesma carteira da simulação, compilada na hora a partir do TypeScript do
   app: se ela e o app divergirem, o teste deixa de valer. */
const tmp = mkdtempSync(join(tmpdir(), 'dialogos-'));
const gerador = join(tmp, 'gerar.ts');
writeFileSync(
  gerador,
  `import { carteiraExemplo } from '${new URL('../src/data/carteira-exemplo.ts', import.meta.url).pathname}';\n` +
    `process.stdout.write(JSON.stringify(carteiraExemplo({ hoje: '${HOJE}' })));\n`,
);
const CARTEIRA = execFileSync('npx', ['tsx', gerador], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });

const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
let falhas = 0;

const erro = (mensagem) => {
  console.log(`❌ ${mensagem}`);
  falhas += 1;
};
const ok = (mensagem) => console.log(`✅ ${mensagem}`);

async function abrir({ width, tema }) {
  const ctx = await browser.newContext({
    viewport: { width, height: 900 },
    colorScheme: tema,
    hasTouch: width < 600,
    isMobile: width < 600,
  });
  const page = await ctx.newPage();
  const quebras = [];
  page.on('pageerror', (e) => quebras.push(String(e)));
  await page.addInitScript(
    ([dados, escolhido]) => {
      localStorage.setItem('financeiro-pessoal', dados);
      localStorage.setItem('financeiro-pessoal:tema', escolhido);
    },
    [CARTEIRA, tema],
  );
  await page.goto(APP);
  await page.waitForTimeout(600);
  return { ctx, page, quebras };
}

const LARGURAS_DE_APARELHO = [
  [390, 'celular'],
  [834, 'tablet'],
  [1280, 'notebook'],
];

const extratoDeExemplo = join(tmp, 'sweep.csv');
writeFileSync(
  extratoDeExemplo,
  [
    'Data,Valor,Identificador,Descrição',
    `08/${HOJE.slice(5, 7)}/${HOJE.slice(0, 4)},21.50,s1,PIX RECEBIDO DE MARIA APARECIDA SILVA`,
    `07/${HOJE.slice(5, 7)}/${HOJE.slice(0, 4)},-17.97,s2,NETSHOES CALCADOS E ESPORTES - Parcela 1/3`,
    `07/${HOJE.slice(5, 7)}/${HOJE.slice(0, 4)},-70.00,s3,SUPERMERCADO BOM PRECO LTDA FILIAL CENTRO`,
  ].join('\n'),
);

/* Quem abre o cadastro muda com a largura: até 720px é o botão redondo do
   canto, acima disso é o da barra de cima. Clicar no que está visível é parte
   do teste — foi assim que se descobriu que, acima de 720px, não havia
   nenhum dos dois. */
async function abrirCadastro(page) {
  const redondo = await page.locator('.fab').isVisible();
  const daBarra = await page.locator('.novo-lancamento').isVisible();
  if (redondo && daBarra) throw new Error('os dois botões de novo lançamento aparecem juntos');
  if (!redondo && !daBarra) throw new Error('nenhum botão de novo lançamento está visível nesta largura');
  await page.click(redondo ? '.fab' : '.novo-lancamento');
}

const DIALOGOS = [
  { nome: 'Novo lançamento — Avulso', rota: 'painel', abrir: abrirCadastro },
  {
    nome: 'Novo lançamento — Parcelado',
    rota: 'painel',
    abrir: async (p) => {
      await abrirCadastro(p);
      await p.click('.dialog button:text-is("Parcelado")');
    },
  },
  {
    nome: 'Novo lançamento — Recorrente',
    rota: 'painel',
    abrir: async (p) => {
      await abrirCadastro(p);
      await p.click('.dialog button:text-is("Recorrente")');
    },
  },
  { nome: 'Analisar', rota: 'painel', abrir: async (p) => p.click('button:has-text("Analisar")') },
  {
    nome: 'Analisar — o que fazer',
    rota: 'painel',
    abrir: async (p) => {
      await p.click('button:has-text("Analisar")');
      await p.click('.segmented button:text-is("O que fazer")');
      await p.waitForTimeout(400);
    },
  },
  {
    nome: 'Analisar — números',
    rota: 'painel',
    abrir: async (p) => {
      await p.click('button:has-text("Analisar")');
      await p.click('.segmented button:text-is("Números")');
      await p.waitForTimeout(400);
    },
  },
  {
    /*
     * Com chave configurada o rodapé ganha um quinto botão, e foi esse estado
     * que empurrou o "Fechar" para fora da tela. A varredura não o via porque
     * nenhum caso configurava chave.
     */
    nome: 'Analisar — IA com chave configurada',
    rota: 'painel',
    abrir: async (p) => {
      await p.evaluate(() => {
        localStorage.setItem('financeiro-pessoal:chave-gemini', 'AIza-de-mentira-para-o-teste');
      });
      await p.reload();
      await p.waitForTimeout(600);
      await p.click('button:has-text("Analisar")');
      await p.click('.segmented button:text-is("Levar a uma IA")');
      await p.waitForTimeout(400);
    },
    depois: async (p) => {
      await p.evaluate(() => localStorage.removeItem('financeiro-pessoal:chave-gemini'));
    },
  },
  {
    nome: 'Analisar — texto para IA',
    rota: 'painel',
    abrir: async (p) => {
      await p.click('button:has-text("Analisar")');
      await p.click('.segmented button:text-is("Levar a uma IA")');
      await p.waitForTimeout(300);
    },
  },
  { nome: 'Editar lançamento', rota: 'lancamentos', abrir: async (p) => p.locator('.entry').first().click() },
  { nome: 'Conta recorrente', rota: 'recorrentes', abrir: async (p) => p.locator('tbody tr').first().click() },
  { nome: 'Compra parcelada', rota: 'parceladas', abrir: async (p) => p.locator('tbody tr').first().click() },
  {
    nome: 'Aportar',
    rota: 'investimentos',
    abrir: async (p) => p.click('.investimento button:text-is("Aportar")'),
  },
  {
    nome: 'Retirar',
    rota: 'investimentos',
    abrir: async (p) => p.click('.investimento button:text-is("Retirar")'),
  },
  {
    nome: 'Rendimento',
    rota: 'investimentos',
    abrir: async (p) => p.click('.investimento button:text-is("Rendimento")'),
  },
  {
    nome: 'Tutorial',
    rota: 'ajustes',
    abrir: async (p) => p.click('button:has-text("Como usar o aplicativo")'),
  },
  {
    // Aberto no capítulo mais longo: é onde o texto tem mais chance de estourar.
    nome: 'Tutorial — capítulo aberto',
    rota: 'ajustes',
    abrir: async (p) => {
      await p.click('button:has-text("Como usar o aplicativo")');
      await p.click('.capitulo .cabeca:has-text("Instalar no celular")');
      await p.waitForTimeout(300);
    },
  },
  { nome: 'Nova conta', rota: 'ajustes', abrir: async (p) => p.click('button:text-is("Nova conta")') },
  { nome: 'Nova categoria', rota: 'ajustes', abrir: async (p) => p.click('button:text-is("Nova categoria")') },
  { nome: 'Importar planilha', rota: 'ajustes', abrir: async (p) => p.click('button:has-text("Importar planilha")') },
  { nome: 'Importar do banco', rota: 'ajustes', abrir: async (p) => p.click('button:has-text("Importar do banco")') },
  {
    // O caminho que não depende de arquivo nenhum: colar o que se copiou do
    // aplicativo do banco. É o único dos formatos novos que funciona também no
    // arquivo único, então é o que dá para varrer aqui.
    nome: 'Importar do banco — texto colado',
    rota: 'ajustes',
    abrir: async (p) => {
      await p.click('button:has-text("Importar do banco")');
      await p.click('.dialog button:has-text("Colar texto")');
      await p.fill('.dialog textarea', '08/09/2026 PIX RECEBIDO MARIA SILVA 1.250,00\n07/09/2026 SUPERMERCADO BOM PRECO -70,00');
      await p.click('.dialog button:has-text("Ler o texto")');
      await p.waitForTimeout(600);
      const quantas = await p.locator('.tabela-extrato tbody tr').count();
      if (quantas !== 2) throw new Error(`colar texto achou ${quantas} lançamentos, e não 2`);
    },
  },
  {
    // O caso que deu o defeito: o diálogo só mostra a tabela depois do arquivo.
    nome: 'Importar do banco — com o extrato lido',
    rota: 'ajustes',
    abrir: async (p) => {
      await p.click('button:has-text("Importar do banco")');
      await p.setInputFiles('.dialog input[type=file]', extratoDeExemplo);
      await p.waitForTimeout(700);
    },
  },
  {
    nome: 'Desmarcar todos como pagos',
    rota: 'ajustes',
    abrir: async (p) => p.click('button:has-text("Desmarcar todos como pagos")'),
  },
  { nome: 'Apagar tudo', rota: 'ajustes', abrir: async (p) => p.click('button:text-is("Apagar tudo")') },
];

async function estadoDoDialogo(page) {
  return page.evaluate(() => {
    const dialogo = document.querySelector('.dialog');
    if (!dialogo) return { abriu: false };
    const visivel = (el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    const texto = (el) => (el.textContent ?? '').trim();
    return {
      abriu: true,
      rolaPagina: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      // O diálogo não pode passar da tela nem rolar de lado por dentro.
      transborda: Math.round(dialogo.getBoundingClientRect().width) > document.documentElement.clientWidth + 1,
      rolaDentro: dialogo.scrollWidth > dialogo.clientWidth + 1,
      // O `.table-wrap` tem `overflow-x: auto`, então uma tabela larga demais
      // não estoura nada: ela rola de lado por dentro, quietinha, e a checagem
      // acima passa. Foi assim que a tabela do extrato ficou 480px numa caixa
      // de 352 sem ninguém ver. Toda caixa tem de caber no aparelho.
      naoCabem: [...dialogo.querySelectorAll('*')]
        .filter((el) => {
          if (!visivel(el) || el.scrollWidth <= el.clientWidth + 1) return false;
          const rolagem = getComputedStyle(el).overflowX;
          return rolagem === 'auto' || rolagem === 'scroll';
        })
        .slice(0, 3)
        .map((el) => `${el.className || el.tagName} (${el.scrollWidth} numa caixa de ${el.clientWidth})`),
      cortados: [...dialogo.querySelectorAll('.stat-value, .bar-value, .num, h2, .btn, label, .setting-text .title')]
        .filter((el) => visivel(el) && el.scrollWidth > el.clientWidth + 1)
        .slice(0, 3)
        .map(texto),
      /*
       * Conteúdo que escapou do diálogo pela direita.
       *
       * O `rolaDentro` acima só enxerga caixa com rolagem; um rodapé com
       * `overflow: visible` deixa o conteúdo transbordar em silêncio. Foi assim
       * que o botão "Fechar" foi parar em x=506 num diálogo de 390 — fora da
       * tela e sem rolagem que o trouxesse de volta.
       */
      escapam: [...dialogo.querySelectorAll('.btn, .stat-value, td, th, input, select')]
        .filter((el) => {
          if (!visivel(el)) return false;
          const meu = el.getBoundingClientRect();
          const dele = dialogo.getBoundingClientRect();
          return meu.right > dele.right + 2 || meu.left < dele.left - 2;
        })
        .slice(0, 3)
        .map((el) => `${texto(el).slice(0, 20)} (termina em ${Math.round(el.getBoundingClientRect().right)}px)`),
      /*
       * Botão que quebrou em tantas linhas que virou um bloco. Não estoura
       * nada, não corta nada, e mesmo assim está errado: "Copiar e abrir o
       * Claude ↗" saía em quatro linhas no rodapé a 390px. Três linhas de
       * texto num botão é o limite do que ainda se lê como botão.
       */
      espremidos: [...dialogo.querySelectorAll('.btn')]
        .filter((el) => {
          if (!visivel(el)) return false;
          const altura = el.getBoundingClientRect().height;
          const linha = parseFloat(getComputedStyle(el).fontSize) * 1.4;
          return altura > linha * 3.2;
        })
        .slice(0, 3)
        .map((el) => `${texto(el).slice(0, 24)} (${Math.round(el.getBoundingClientRect().height)}px de altura)`),
      // Foi assim que a descrição do extrato sumiu: célula de 6px com texto
      // dentro. Nenhuma coluna com conteúdo pode ficar estreita demais para ler.
      espremidas: [...dialogo.querySelectorAll('td, th')]
        .filter((el) => visivel(el) && texto(el).length >= 4 && el.getBoundingClientRect().width < 40)
        .slice(0, 3)
        .map((el) => `${texto(el).slice(0, 24)} (${Math.round(el.getBoundingClientRect().width)}px)`),
    };
  });
}

for (const tema of ['light', 'dark']) {
  for (const [width, aparelho] of LARGURAS_DE_APARELHO) {
    const { ctx, page, quebras } = await abrir({ width, tema });
    let bons = 0;
    for (const dialogo of DIALOGOS) {
      const onde = `${dialogo.nome} — ${aparelho} ${width}px ${tema}`;
      await page.goto(`${APP}#/${dialogo.rota}`);
      await page.waitForTimeout(450);
      try {
        await dialogo.abrir(page);
      } catch (e) {
        erro(`${onde}: não consegui abrir — ${String(e).split('\n')[0]}`);
        continue;
      }
      await page.waitForTimeout(400);

      const estado = await estadoDoDialogo(page);
      // Todos os problemas, não o primeiro: um diálogo que rola de lado quase
      // sempre também esprememe alguma coluna, e ver só um dos dois manda
      // consertar pela metade.
      const problemas = [];
      if (!estado.abriu) problemas.push('o diálogo não apareceu');
      else {
        if (estado.rolaPagina) problemas.push('a página passou a rolar de lado');
        if (estado.transborda) problemas.push('o diálogo é mais largo que a tela');
        if (estado.rolaDentro) problemas.push('o conteúdo não cabe no diálogo');
        if (estado.naoCabem.length > 0) problemas.push(`rola de lado por dentro — ${JSON.stringify(estado.naoCabem)}`);
        if (estado.cortados.length > 0) problemas.push(`texto cortado — ${JSON.stringify(estado.cortados)}`);
        if (estado.espremidas.length > 0) problemas.push(`coluna espremida — ${JSON.stringify(estado.espremidas)}`);
        if (estado.espremidos.length > 0) problemas.push(`botão quebrado em linhas demais — ${JSON.stringify(estado.espremidos)}`);
        if (estado.escapam.length > 0) problemas.push(`conteúdo fora do diálogo — ${JSON.stringify(estado.escapam)}`);
      }
      for (const problema of problemas) erro(`${onde}: ${problema}`);
      if (problemas.length === 0) bons += 1;

      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
      // Alguns casos sujam o armazenamento de propósito; limpam atrás de si.
      if (dialogo.depois) await dialogo.depois(page);
    }
    if (quebras.length > 0) erro(`diálogos em ${width}px ${tema}: erro no console — ${quebras[0]}`);
    if (bons === DIALOGOS.length) ok(`os ${bons} diálogos em ${aparelho} (${width}px, ${tema})`);
    await ctx.close();
  }
}

await browser.close();
console.log('──────────────────────────────────────────────');
console.log(falhas === 0 ? 'TUDO PASSOU' : `${falhas} FALHA(S)`);
process.exit(falhas === 0 ? 0 : 1);
