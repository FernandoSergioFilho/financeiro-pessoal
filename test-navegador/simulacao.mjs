/**
 * Simulação no navegador: a carteira real, dentro do app de verdade.
 *
 * O Vitest prova as contas; isto prova que a tela desenha. Semeia a carteira de
 * `carteiraExemplo` no armazenamento e percorre as telas em nove larguras, nos
 * dois temas, conferindo:
 *
 *   - que nada estoura para os lados (a barra de rolagem horizontal no celular);
 *   - que o seletor de período funciona em todos os grãos;
 *   - que a conta presa por um lançamento antigo diz o que a está segurando;
 *   - que nenhuma tela cai no salva-vidas do React.
 *
 * Uso: npm run build:single && npm run test:simulacao
 * Chromium alternativo: CHROMIUM=/caminho/do/chrome
 */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const APP = `file://${new URL('../financeiro.html', import.meta.url).pathname}`;
const HOJE = new Date().toISOString().slice(0, 10);

/* A carteira vem do TypeScript do app, compilada na hora: se ela e o app
   divergirem, o teste deixa de valer. */
const tmp = mkdtempSync(join(tmpdir(), 'carteira-'));
const gerador = join(tmp, 'gerar.ts');
writeFileSync(
  gerador,
  `import { carteiraExemplo } from '${new URL('../src/data/carteira-exemplo.ts', import.meta.url).pathname}';\n` +
    `process.stdout.write(JSON.stringify(carteiraExemplo({ hoje: '${HOJE}' })));\n`,
);
const CARTEIRA = execFileSync('npx', ['tsx', gerador], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });

const LARGURAS = [320, 360, 390, 414, 480, 768, 1024, 1280, 1600];
const PAGINAS = ['painel', 'lancamentos', 'recorrentes', 'parceladas', 'ajustes'];
const GRAOS = ['Dia', 'Mês', 'Trimestre', 'Ano', 'Tudo'];

const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
let falhas = 0;

const erro = (mensagem) => {
  console.log(`❌ ${mensagem}`);
  falhas += 1;
};
const ok = (mensagem) => console.log(`✅ ${mensagem}`);

async function abrir({ width = 1280, tema = 'light' } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: tema });
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

async function estadoDaTela(page) {
  return page.evaluate(() => ({
    vazia: (document.getElementById('root')?.childElementCount ?? 0) === 0,
    salvaVidas: [...document.querySelectorAll('#root h3')].some((h) =>
      h.textContent?.includes('Alguma coisa quebrou'),
    ),
    estoura: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    largura: document.documentElement.scrollWidth,
    limite: document.documentElement.clientWidth,
  }));
}

/* ---------------------------------------------- 1. as telas em cada largura */

for (const tema of ['light', 'dark']) {
  for (const width of LARGURAS) {
    const { ctx, page, quebras } = await abrir({ width, tema });
    for (const pagina of PAGINAS) {
      await page.goto(`${APP}#/${pagina}`);
      await page.waitForTimeout(500);
      const estado = await estadoDaTela(page);
      if (estado.vazia) erro(`${pagina} ${width}px ${tema}: a tela sumiu`);
      else if (estado.salvaVidas) erro(`${pagina} ${width}px ${tema}: caiu no salva-vidas`);
      else if (estado.estoura) erro(`${pagina} ${width}px ${tema}: estoura para os lados (${estado.largura} > ${estado.limite})`);
    }
    if (quebras.length > 0) erro(`${width}px ${tema}: erro no console — ${quebras[0]}`);
    else ok(`todas as telas em ${width}px (${tema})`);
    await ctx.close();
  }
}

/* -------------------------------------------------- 2. o seletor de período */

for (const width of [390, 1280]) {
  const { ctx, page, quebras } = await abrir({ width });
  await page.goto(`${APP}#/lancamentos`);
  await page.waitForTimeout(500);

  for (const grao of GRAOS) {
    await page.click('.month-nav .label');
    await page.waitForTimeout(200);
    await page.click(`.periodo-menu button:text-is("${grao}")`);
    await page.waitForTimeout(600);

    const estado = await estadoDaTela(page);
    const quantos = await page.locator('.entry').count();
    if (estado.vazia || estado.salvaVidas) erro(`período ${grao} em ${width}px: a tela quebrou`);
    else if (estado.estoura) erro(`período ${grao} em ${width}px: estoura para os lados`);
    else ok(`período ${grao} em ${width}px — ${quantos} lançamentos na lista`);
  }

  // As setas precisam andar no grão escolhido, não em mês.
  await page.click('.month-nav .label');
  await page.click('.periodo-menu button:text-is("Ano")');
  await page.waitForTimeout(400);
  const anoAtual = await page.locator('.month-nav .label .longo, .month-nav .label .curto').first().innerText();
  await page.click('[aria-label="Período anterior"]');
  await page.waitForTimeout(400);
  const anoAnterior = await page.locator('.month-nav .label .longo, .month-nav .label .curto').first().innerText();
  if (Number(anoAnterior) !== Number(anoAtual) - 1) {
    erro(`a seta no grão "Ano" foi de ${anoAtual} para ${anoAnterior}`);
  } else ok(`a seta anda de ano em ano (${anoAtual} → ${anoAnterior})`);

  if (quebras.length > 0) erro(`período em ${width}px: erro no console — ${quebras[0]}`);
  await ctx.close();
}

/* ------------------------------- 3. a conta que "não tem nada" e não apagava */

{
  const { ctx, page, quebras } = await abrir();
  await page.goto(`${APP}#/ajustes`);
  await page.waitForTimeout(600);

  const linha = page.locator('tr', { has: page.locator('text=Banco do Brasil') }).first();
  await linha.locator('button:text-is("Apagar")').click();
  await page.waitForTimeout(400);

  const texto = await page.locator('.dialog').innerText();
  if (!/lançamento/.test(texto)) erro(`o diálogo não diz o que segura a conta: ${texto.slice(0, 120)}`);
  else ok(`o diálogo diz o que segura a conta: "${texto.split('\n').find((l) => /Ainda aponta/.test(l))}"`);

  if (!/Ver esses lançamentos/.test(texto)) erro('falta o caminho para ver os lançamentos');
  if (!/Passar tudo para|Só arquivar/.test(texto)) erro('falta a saída de mover ou arquivar');

  // Ver os lançamentos: precisa cair em Lançamentos, filtrado e em "Tudo".
  await page.click('button:text-is("Ver esses lançamentos")');
  await page.waitForTimeout(700);
  const depois = await page.evaluate(() => ({
    rota: location.hash,
    rotulo: document.querySelector('.month-nav .label')?.textContent ?? '',
    quantos: document.querySelectorAll('.entry').length,
  }));
  if (!depois.rota.includes('lancamentos')) erro(`"Ver esses lançamentos" não abriu a lista (${depois.rota})`);
  else if (!/Tudo/.test(depois.rotulo)) erro(`a lista não abriu no período "Tudo" (${depois.rotulo})`);
  else if (depois.quantos === 0) erro('a lista abriu vazia — o lançamento continua invisível');
  else ok(`"Ver esses lançamentos" mostra ${depois.quantos} lançamento(s) no período Tudo`);

  if (quebras.length > 0) erro(`apagar conta: erro no console — ${quebras[0]}`);
  await ctx.close();
}

/* ------------------------------------ 4. mover tudo e apagar de verdade */

{
  const { ctx, page, quebras } = await abrir();
  await page.goto(`${APP}#/ajustes`);
  await page.waitForTimeout(600);

  const antes = await page.locator('table tbody tr').count();
  const linha = page.locator('tr', { has: page.locator('text=Banco do Brasil') }).first();
  await linha.locator('button:text-is("Apagar")').click();
  await page.waitForTimeout(400);
  await page.click('.dialog button:text-is("Mover e apagar")');
  await page.waitForTimeout(800);

  const estado = await page.evaluate(() => ({
    sobrou: [...document.querySelectorAll('table tbody tr')].some((tr) => tr.textContent?.includes('Banco do Brasil')),
    linhas: document.querySelectorAll('table tbody tr').length,
    aviso: document.querySelector('.banner.ok, .banner')?.textContent ?? '',
  }));
  if (estado.sobrou) erro('a conta continua na lista depois de "Mover e apagar"');
  else ok(`conta apagada de verdade (${antes} → ${estado.linhas} linhas)`);
  if (!/apagada/i.test(estado.aviso)) erro(`sem aviso do que aconteceu: "${estado.aviso.slice(0, 80)}"`);
  else ok(`aviso: "${estado.aviso.trim().slice(0, 110)}"`);

  if (quebras.length > 0) erro(`mover e apagar: erro no console — ${quebras[0]}`);
  await ctx.close();
}

/* ------------------------------- 5. o aviso de lançamento repetido */

{
  const { ctx, page, quebras } = await abrir();
  await page.goto(`${APP}#/painel`);
  await page.waitForTimeout(700);

  // "Aluguel · R$ 2.450,00" existe todo mês na carteira, no dia 10.
  const dia10 = `${HOJE.slice(0, 8)}10`;
  await page.click('text=+ Novo lançamento');
  await page.waitForTimeout(400);
  await page.fill('.dialog input[inputmode="decimal"], .dialog input[type="text"]', '2450,00');
  await page.fill('.dialog input[type=date]', dia10);
  await page.fill('.dialog input[placeholder^="Supermercado"]', 'Aluguel');
  await page.click('.dialog button:text-is("Adicionar")');
  await page.waitForTimeout(500);

  const avisou = await page.locator('.dialog').innerText().catch(() => '');
  if (!/já não está lançado/i.test(avisou)) erro(`não avisou do lançamento repetido: "${avisou.slice(0, 100)}"`);
  else ok('avisa antes de gravar um lançamento que já existe');

  // "Voltar e conferir" não pode gravar nada.
  const antes = await page.evaluate(() => JSON.parse(localStorage.getItem('financeiro-pessoal')).entries.length);
  await page.click('.dialog button:text-is("Voltar e conferir")');
  await page.waitForTimeout(500);
  const depois = await page.evaluate(() => JSON.parse(localStorage.getItem('financeiro-pessoal')).entries.length);
  if (depois !== antes) erro(`"Voltar e conferir" gravou assim mesmo (${antes} → ${depois})`);
  else ok('"Voltar e conferir" não grava nada');

  // E um lançamento que não existe passa direto, sem aviso nenhum.
  await page.click('.dialog input[placeholder^="Supermercado"]');
  await page.fill('.dialog input[placeholder^="Supermercado"]', 'Cinema com a Marina');
  await page.click('.dialog button:text-is("Adicionar")');
  await page.waitForTimeout(600);
  const gravou = await page.evaluate(() => JSON.parse(localStorage.getItem('financeiro-pessoal')).entries.length);
  if (gravou !== antes + 1) erro(`o lançamento novo não foi gravado (${antes} → ${gravou})`);
  else ok('lançamento que não existia entra sem aviso');

  if (quebras.length > 0) erro(`aviso de repetido: erro no console — ${quebras[0]}`);
  await ctx.close();
}

await browser.close();
console.log('──────────────────────────────────────────────');
console.log(falhas === 0 ? 'TUDO PASSOU' : `${falhas} FALHA(S)`);
process.exit(falhas === 0 ? 0 : 1);
