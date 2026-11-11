/**
 * "O que mudou", na tela de verdade.
 *
 * O app se atualiza em silêncio, e quem usa descobre o botão novo por acaso ou
 * nunca. Esta janela é a resposta — a mesma que o Chrome e o Edge dão depois
 * de reiniciar. O que ela precisa acertar, e que esta sonda cobra:
 *
 *  1. aparece sozinha para quem já usava o app e ainda não leu;
 *  2. **não** aparece para quem está abrindo o app pela primeira vez: contar o
 *     que mudou para quem nunca viu a versão anterior é história sem começo;
 *  3. aparece uma vez só — fechar tem de valer depois de recarregar, senão a
 *     janela vira um pedágio em toda abertura;
 *  4. quem pulou versões vê as que faltam, e não só a última;
 *  5. dá para rever de propósito, em Ajustes.
 *
 * A recarga é servida por HTTP, e não por `file://`: naquele protocolo o que
 * a página grava em `localStorage` não sobrevive à recarga, e a sonda
 * reprovaria por um defeito que não é do app — já aconteceu antes aqui.
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { execFileSync, } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ARQUIVO = new URL('../financeiro.html', import.meta.url).pathname;
const APP = `file://${ARQUIVO}`;
const CHAVE = 'financeiro-pessoal:novidades-vistas';

// A lista sai do próprio código, e não copiada para cá: assim a sonda
// continua valendo quando uma novidade for acrescentada.
const tmp = mkdtempSync(join(tmpdir(), 'nov-'));
const g = join(tmp, 'g.ts');
writeFileSync(g, `import { NOVIDADES } from '${new URL('../src/novidades.ts', import.meta.url).pathname}';\nprocess.stdout.write(JSON.stringify(NOVIDADES));\n`);
const NOVIDADES = JSON.parse(execFileSync('npx', ['tsx', g], { encoding: 'utf8', maxBuffer: 8e6 }));

const falhas = [];
const cobrar = (cond, msg) => { if (!cond) falhas.push(msg); };

if (NOVIDADES.length < 2) {
  falhas.push('a lista de novidades tem menos de duas entradas — a sonda não provaria nada');
}

const T = '2026-01-01T00:00:00.000Z';
const CARTEIRA = JSON.stringify({
  version: 2,
  accounts: [{ id: 'cc', name: 'Conta corrente', kind: 'checking', openingBalance: 100000, color: 'green', updatedAt: T }],
  categories: [],
  entries: [{
    id: 'e1', date: '2026-11-01', description: 'Mercado', amount: 5000, kind: 'expense',
    accountId: 'cc', toAccountId: null, categoryId: null, status: 'settled', recurringId: null,
    occurrenceDate: null, purchaseId: null, installmentNumber: null, installmentTotal: null,
    createdAt: T, updatedAt: T,
  }],
  recurring: [], purchases: [], tombstones: [],
});

const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});

/** Abre o app com a carteira dada e, se houver, a marca do que já foi lido. */
async function abrir(endereco, { carteira, marca, largura = 1280, tema = 'light' } = {}) {
  const ctx = await b.newContext({
    viewport: { width: largura, height: 900 }, colorScheme: tema,
    hasTouch: largura < 600, isMobile: largura < 600,
  });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => falhas.push(`erro de página: ${e}`));
  await p.addInitScript(([c, m, chave]) => {
    if (c) localStorage.setItem('financeiro-pessoal', c);
    if (m) localStorage.setItem(chave, m);
  }, [carteira ?? null, marca ?? null, CHAVE]);
  await p.goto(endereco);
  await p.waitForTimeout(900);
  return { ctx, p };
}

const titulosNaTela = (p) =>
  p.locator('.overlay .novidades section h3').allTextContents();

/* ============ 1. quem já usava o app, e ainda não leu, vê a janela ======== */
for (const [largura, tema] of [[390, 'light'], [834, 'dark'], [1280, 'light']]) {
  const { ctx, p } = await abrir(APP, { carteira: CARTEIRA, largura, tema });

  const aberta = (await p.locator('.overlay .novidades').count()) === 1;
  cobrar(aberta, `${largura}/${tema}: a janela do que mudou não apareceu para quem já usava o app`);
  if (aberta) {
    const titulos = await titulosNaTela(p);
    cobrar(titulos.length === 1, `${largura}/${tema}: apareceram ${titulos.length} novidades em vez de só a mais nova`);
    cobrar((titulos[0] ?? '').includes(NOVIDADES[0].titulo),
      `${largura}/${tema}: o título mostrado não é o da versão mais nova — "${titulos[0]}"`);
    const corpo = (await p.locator('.overlay .novidades').textContent())?.replace(/\s+/g, ' ') ?? '';
    const primeiroItem = NOVIDADES[0].itens[0].replaceAll('**', '').slice(0, 30);
    cobrar(corpo.includes(primeiroItem),
      `${largura}/${tema}: o texto da novidade não está na tela — esperava "${primeiroItem}"`);
    cobrar(!corpo.includes('**'), `${largura}/${tema}: sobrou asterisco cru na tela`);

    // Nada pode ficar fora da tela nem fazer a página rolar de lado.
    if (await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)) {
      falhas.push(`${largura}/${tema}: a janela do que mudou faz a página rolar de lado`);
    }
    const estouro = await p.evaluate(() => {
      const caixa = document.querySelector('.overlay .dialog, .overlay > div');
      if (!caixa) return 'não achei a caixa do diálogo';
      const r = caixa.getBoundingClientRect();
      if (r.right > window.innerWidth + 1 || r.left < -1) return 'a caixa passa da largura da tela';
      if (r.height > window.innerHeight + 1) return 'a caixa é mais alta que a tela';
      return null;
    });
    if (estouro) falhas.push(`${largura}/${tema}: ${estouro}`);
  }
  await ctx.close();
}

/* ============ 2. quem está estreando no app não vê nada ================== */
{
  const { ctx, p } = await abrir(APP, {});
  cobrar((await p.locator('.overlay .novidades').count()) === 0,
    'a janela do que mudou apareceu para quem está abrindo o app pela primeira vez');
  // E a marca fica gravada, para a PRÓXIMA atualização ter o que comparar.
  const marca = await p.evaluate((c) => localStorage.getItem(c), CHAVE);
  cobrar(marca === NOVIDADES[0].id,
    `quem estreia deveria ficar ancorado na versão atual, e a marca ficou "${marca}"`);
  await ctx.close();
}

/* ============ 3. quem pulou versões vê as que faltam ===================== */
{
  const { ctx, p } = await abrir(APP, { carteira: CARTEIRA, marca: NOVIDADES[2]?.id ?? NOVIDADES[1].id });
  const titulos = await titulosNaTela(p);
  const esperadas = NOVIDADES[2] ? 2 : 1;
  cobrar(titulos.length === esperadas,
    `quem pulou ${esperadas} versões viu ${titulos.length} — esperava ${esperadas}`);
  cobrar((titulos[0] ?? '').includes(NOVIDADES[0].titulo),
    'a mais nova não vem primeiro na lista do que se perdeu');
  await ctx.close();
}

/* ============ 4. fechar vale depois de recarregar ======================== */
{
  const srv = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(readFileSync(ARQUIVO));
  });
  await new Promise((r) => srv.listen(4602, r));

  const { ctx, p } = await abrir('http://localhost:4602/', { carteira: CARTEIRA });
  const apareceu = (await p.locator('.overlay .novidades').count()) === 1;
  cobrar(apareceu, 'servido por HTTP, a janela do que mudou não apareceu');
  if (apareceu) {
    await p.click('.overlay button:has-text("Entendi")');
    await p.waitForTimeout(400);
    cobrar((await p.locator('.overlay .novidades').count()) === 0, '"Entendi" não fechou a janela');
    const marca = await p.evaluate((c) => localStorage.getItem(c), CHAVE);
    cobrar(marca === NOVIDADES[0].id, `fechar guardou a marca "${marca}" em vez de "${NOVIDADES[0].id}"`);

    await p.reload();
    await p.waitForTimeout(1200);
    cobrar((await p.locator('.overlay .novidades').count()) === 0,
      'a janela do que mudou voltou depois de recarregar — ela viraria um pedágio em toda abertura');
  }
  await ctx.close();
  srv.close();
}

/* ============ 5. dá para rever de propósito, em Ajustes =================== */
{
  const { ctx, p } = await abrir(APP, { carteira: CARTEIRA, marca: NOVIDADES[0].id });
  cobrar((await p.locator('.overlay .novidades').count()) === 0,
    'quem já leu a última novidade ainda vê a janela sozinha');

  await p.goto(`${APP}#/ajustes`);
  await p.waitForTimeout(700);
  const botao = p.locator('button:has-text("Ver o que mudou")');
  if ((await botao.count()) === 0) {
    falhas.push('não há como rever o que mudou em Ajustes');
  } else {
    await botao.scrollIntoViewIfNeeded();
    await botao.click();
    await p.waitForTimeout(400);
    const titulos = await titulosNaTela(p);
    cobrar(titulos.length >= 2, `rever em Ajustes mostrou ${titulos.length} novidades — esperava o histórico`);
  }
  await ctx.close();
}

await b.close();

if (falhas.length) {
  console.error('❌ o que mudou:');
  for (const f of falhas) console.error('   ·', f);
  process.exit(1);
}
console.log('✅ o que mudou: aparece uma vez, para quem já usava, e dá para rever');
