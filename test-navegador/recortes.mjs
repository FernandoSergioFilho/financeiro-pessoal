/**
 * Os dois pedidos, vistos na tela de verdade.
 *
 * 1. Em Lançamentos, tipo e situação combinam: "saídas E atrasados" tem de
 *    dar uma lista menor do que cada um sozinho, e não um apagar o outro.
 * 2. No painel, a vista escolhida manda — e em "Lançamentos" a lista encosta
 *    no filtro, sem cartões nem gráficos no meio.
 *
 * Nas três larguras e nos dois temas, porque controle novo é onde o CSS
 * quebra: são duas filas de botões a mais numa tela que já estava cheia.
 */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const APP = 'file://' + new URL('../financeiro.html', import.meta.url).pathname;
const HOJE = new Date().toISOString().slice(0, 10);
const tmp = mkdtempSync(join(tmpdir(), 'rec-'));
const g = join(tmp, 'g.ts');
writeFileSync(g, `import { carteiraExemplo } from '${new URL('../src/data/carteira-exemplo.ts', import.meta.url).pathname}';\nprocess.stdout.write(JSON.stringify(carteiraExemplo({ hoje: '${HOJE}' })));\n`);
const C = execFileSync('npx', ['tsx', g], { encoding: 'utf8', maxBuffer: 32e6 });

const falhas = [];
const cobrar = (cond, msg) => { if (!cond) falhas.push(msg); };
const b = await chromium.launch({ executablePath: process.env.CHROMIUM });

/** Nenhum controle pode ficar fora da tela nem empurrar a página de lado. */
async function conferirCss(p, onde, largura, tema) {
  if (await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1))
    falhas.push(`${onde} ${largura}/${tema}: a página rola de lado`);
  const fora = await p.evaluate(() => {
    const ruins = [];
    for (const bt of document.querySelectorAll('.segmented button')) {
      const r = bt.getBoundingClientRect();
      if (r.right > window.innerWidth + 1 || r.left < -1) ruins.push(bt.textContent.trim());
      if (r.width < 24 || r.height < 24) ruins.push(`${bt.textContent.trim()} (${Math.round(r.width)}×${Math.round(r.height)})`);
    }
    return ruins;
  });
  if (fora.length) falhas.push(`${onde} ${largura}/${tema}: botão de filtro inalcançável — ${fora.join(', ')}`);
}

for (const [largura, tema] of [[390, 'light'], [834, 'dark'], [1280, 'light'], [390, 'dark']]) {
  const ctx = await b.newContext({ viewport: { width: largura, height: 1100 }, colorScheme: tema, hasTouch: largura < 600, isMobile: largura < 600 });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => falhas.push(`erro de página ${largura}/${tema}: ${e}`));
  await p.addInitScript((d) => localStorage.setItem('financeiro-pessoal', d), C);

  /* ---------------- 1. Lançamentos: os dois eixos combinam ---------------- */
  await p.goto(`${APP}#/lancamentos`);
  await p.waitForSelector('.eixos-do-recorte');
  await p.waitForTimeout(400);
  const quantos = () => p.locator('.entry').count();

  const tudo = await quantos();
  await p.click('.eixo:has(.rotulo-do-eixo:text-is("Tipo")) button:text-is("Saídas")');
  await p.waitForTimeout(300);
  const saidas = await quantos();
  await p.click('.eixo:has(.rotulo-do-eixo:text-is("Situação")) button:text-is("Atrasados")');
  await p.waitForTimeout(300);
  const saidasAtrasadas = await quantos();

  // O eixo do tipo tem de continuar em "Saídas": é a combinação que se pede.
  const tipoAtivo = await p.locator('.eixo:has(.rotulo-do-eixo:text-is("Tipo")) button[aria-pressed="true"]').textContent();
  cobrar(tipoAtivo?.trim() === 'Saídas', `${largura}/${tema}: escolher a situação apagou o tipo (ficou "${tipoAtivo?.trim()}")`);

  // Os três tipos, dentro de "Atrasados", têm de somar exatamente o total de
  // atrasados: é a prova de que o eixo de cima recorta o de baixo, e não o
  // substitui. Serve com qualquer carteira — não depende de a de exemplo ter
  // uma entrada atrasada, que ela pode não ter.
  const porTipo = {};
  for (const rotulo of ['Saídas', 'Entradas', 'Transferências']) {
    await p.click(`.eixo:has(.rotulo-do-eixo:text-is("Tipo")) button:text-is("${rotulo}")`);
    await p.waitForTimeout(300);
    porTipo[rotulo] = await quantos();
  }
  await p.click('.eixo:has(.rotulo-do-eixo:text-is("Tipo")) button:text-is("Tudo")');
  await p.waitForTimeout(300);
  const atrasados = await quantos();
  const somaDosTipos = Object.values(porTipo).reduce((a, n) => a + n, 0);

  cobrar(saidas < tudo, `${largura}/${tema}: filtrar por saídas não reduziu a lista (${saidas} de ${tudo})`);
  cobrar(atrasados > 0, `${largura}/${tema}: a carteira de exemplo não tem atrasado — o teste não provaria nada`);
  cobrar(somaDosTipos === atrasados,
    `${largura}/${tema}: os tipos dentro de "Atrasados" somam ${somaDosTipos}, e os atrasados são ${atrasados} — os eixos não estão combinando`);
  cobrar(saidasAtrasadas === porTipo['Saídas'],
    `${largura}/${tema}: a ordem em que se escolhe os eixos muda o resultado (${saidasAtrasadas} vs ${porTipo['Saídas']})`);
  cobrar(saidasAtrasadas <= saidas,
    `${largura}/${tema}: somar a situação não restringiu as saídas (${saidasAtrasadas} de ${saidas})`);
  await conferirCss(p, 'lançamentos', largura, tema);

  /* ------------------- 2. Painel: a vista manda na tela ------------------- */
  await p.goto(`${APP}#/painel`);
  await p.waitForSelector('.segmented');
  await p.waitForTimeout(500);

  const tem = async (titulo) => (await p.locator(`.card-head h2:text-is("${titulo}")`).count()) > 0;
  const temGrafico = async () => (await p.locator('svg.chart, .chart svg, .barras, .category-bars').count()) > 0;

  await p.click('button:text-is("Lançamentos")');
  await p.waitForTimeout(500);
  cobrar(!(await tem('Gastos por categoria')), `${largura}/${tema}: a vista de lançamentos ainda mostra gráfico de categorias`);
  cobrar((await p.locator('.stat-label:text-is("Dinheiro disponível")').count()) === 0,
    `${largura}/${tema}: a vista de lançamentos ainda mostra os cartões de números`);

  // O pedido em uma frase: a lista tem de estar ACIMA de onde os gráficos ficavam.
  const ordem = await p.evaluate(() =>
    [...document.querySelectorAll('.card-head h2')].map((t) => t.textContent.trim()));
  cobrar(ordem.some((x) => x.startsWith('Lançamentos')), `${largura}/${tema}: a vista de lançamentos não mostra a lista`);
  cobrar(ordem[0]?.startsWith('Lançamentos'),
    `${largura}/${tema}: a lista não é o primeiro cartão da vista (é "${ordem[0]}")`);
  await conferirCss(p, 'painel/lançamentos', largura, tema);

  await p.click('button:text-is("Gráficos")');
  await p.waitForTimeout(500);
  cobrar(await tem('Gastos por categoria'), `${largura}/${tema}: a vista de gráficos não mostra as categorias`);
  cobrar(!(await tem('Faturas em aberto')), `${largura}/${tema}: a vista de gráficos mostra a lista de faturas`);

  await p.click('button:text-is("Números")');
  await p.waitForTimeout(500);
  cobrar(await tem('Saldo por conta'), `${largura}/${tema}: a vista de números não mostra o saldo por conta`);
  cobrar(!(await temGrafico()) || !(await tem('Gastos por categoria')), `${largura}/${tema}: a vista de números mostra gráfico`);
  await conferirCss(p, 'painel/números', largura, tema);

  // "Tudo" continua sendo a leitura completa de sempre.
  await p.click('.segmented.duas-linhas button:text-is("Tudo")');
  await p.waitForTimeout(500);
  for (const titulo of ['Gastos por categoria', 'Faturas em aberto', 'Saldo por conta']) {
    cobrar(await tem(titulo), `${largura}/${tema}: "Tudo" perdeu o cartão "${titulo}"`);
  }
  await conferirCss(p, 'painel/tudo', largura, tema);

  // E a escolha sobrevive a recarregar a página.
  await p.click('button:text-is("Números")');
  await p.waitForTimeout(400);
  await p.reload();
  await p.waitForSelector('.segmented');
  await p.waitForTimeout(700);
  const guardada = await p.locator('.segmented.duas-linhas button[aria-pressed="true"]').first().textContent();
  cobrar(guardada?.trim() === 'Números', `${largura}/${tema}: a vista escolhida não sobreviveu à recarga (voltou "${guardada?.trim()}")`);

  await ctx.close();
}
await b.close();

if (falhas.length) { console.log(falhas.map((f) => '❌ ' + f).join('\n')); process.exit(1); }
console.log('✅ tipo e situação combinam na lista de lançamentos');
console.log('✅ cada vista do painel mostra só o que promete, e "Tudo" mostra tudo');
console.log('✅ na vista de lançamentos a lista é o primeiro cartão');
console.log('✅ a vista escolhida fica guardada no aparelho');
console.log('\nTUDO PASSOU');
