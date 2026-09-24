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
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
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

/* A fila de vistas do painel, apontada sem depender da ordem do DOM nem de
   quantos `.segmented` a tela tem. Um `button:text-is("Números")` solto pega o
   primeiro que casar na página, e essa ambiguidade foi o que fez a sonda
   falhar no runner e passar aqui — o pior tipo de falha, porque bloqueia a
   publicação sem apontar nada. */
const VISTAS = '.segmented.duas-linhas:has(button:text-is("Gráficos"))';

/** Escolhe a vista e SÓ SEGUE quando o aparelho confirmou que guardou. */
async function escolherVista(p, rotulo, esperado) {
  await p.click(`${VISTAS} button:text-is("${rotulo}")`);
  await p.waitForFunction(
    (q) => localStorage.getItem('financeiro-pessoal:vista-do-painel') === q,
    esperado,
    { timeout: 5000 },
  );
  await p.waitForSelector(`${VISTAS} button[aria-pressed="true"]:text-is("${rotulo}")`);
}
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
  /* O filtro e a etiqueta da linha têm de contar a MESMA história.
   *
   * Foi assim que o defeito apareceu para o usuário: com "Atrasados" ligado, a
   * lista mostrava linhas etiquetadas "Previsto" — compras de agosto numa
   * fatura que só vence dia 28. Uma das duas estava mentindo, e era o filtro.
   */
  await p.click('.eixo:has(.rotulo-do-eixo:text-is("Tipo")) button:text-is("Tudo")');
  await p.click('.eixo:has(.rotulo-do-eixo:text-is("Situação")) button:text-is("Atrasados")');
  await p.waitForTimeout(300);
  const mentindo = await p.evaluate(() =>
    [...document.querySelectorAll('.entry')]
      .filter((e) => [...e.querySelectorAll('.tag.pending')].some((t) => t.textContent.trim() === 'Previsto'))
      .map((e) => e.querySelector('.entry-title .text')?.textContent?.trim() ?? '?')
      .slice(0, 4));
  cobrar(mentindo.length === 0,
    `${largura}/${tema}: o filtro "Atrasados" mostra linhas etiquetadas "Previsto" — ${mentindo.join(', ')}`);

  // E o contrário, para o teste não passar com uma lista vazia.
  const quantosAtrasados = await p.locator('.entry').count();
  cobrar(quantosAtrasados > 0, `${largura}/${tema}: nenhum atrasado na carteira de exemplo — o teste não provaria nada`);

  await conferirCss(p, 'lançamentos', largura, tema);

  /* ------------------- 2. Painel: a vista manda na tela ------------------- */
  await p.goto(`${APP}#/painel`);
  await p.waitForSelector('.segmented');
  await p.waitForTimeout(500);

  const tem = async (titulo) => (await p.locator(`.card-head h2:text-is("${titulo}")`).count()) > 0;
  const temGrafico = async () => (await p.locator('svg.chart, .chart svg, .barras, .category-bars').count()) > 0;

  await escolherVista(p, 'Lançamentos', 'lancamentos');
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

  await escolherVista(p, 'Gráficos', 'graficos');
  cobrar(await tem('Gastos por categoria'), `${largura}/${tema}: a vista de gráficos não mostra as categorias`);
  cobrar(!(await tem('Faturas em aberto')), `${largura}/${tema}: a vista de gráficos mostra a lista de faturas`);

  await escolherVista(p, 'Números', 'numeros');
  cobrar(await tem('Saldo por conta'), `${largura}/${tema}: a vista de números não mostra o saldo por conta`);
  cobrar(!(await temGrafico()) || !(await tem('Gastos por categoria')), `${largura}/${tema}: a vista de números mostra gráfico`);
  await conferirCss(p, 'painel/números', largura, tema);

  // "Tudo" continua sendo a leitura completa de sempre.
  await escolherVista(p, 'Tudo', 'tudo');
  for (const titulo of ['Gastos por categoria', 'Faturas em aberto', 'Saldo por conta']) {
    cobrar(await tem(titulo), `${largura}/${tema}: "Tudo" perdeu o cartão "${titulo}"`);
  }
  await conferirCss(p, 'painel/tudo', largura, tema);

  await ctx.close();
}
/* ------- A escolha sobrevive a recarregar, no build servido por HTTP -------
 *
 * Esta é a única checagem que NÃO roda sobre o `financeiro.html` de arquivo
 * único, e a razão é concreta: em `file://` o Chromium perde uma gravação no
 * `localStorage` feita instantes antes de um reload, mais ou menos uma vez em
 * oito. O valor estava gravado (o teste confirma antes de recarregar) e ainda
 * assim voltava vazio.
 *
 * Isso é artefato do `file://`, e não do aplicativo: quem usa o app o abre por
 * https, instalado ou no navegador. Deixar a cobrança no arquivo único fazia a
 * publicação falhar ao acaso — e publicação que falha ao acaso é pior do que
 * checagem nenhuma, porque ensina a ignorar o vermelho.
 */
{
  // O MESMO arquivo único das outras checagens, só que servido por http em vez
  // de aberto do disco. É o que isola a variável: se passar aqui e falhar em
  // `file://`, o problema é do protocolo, não do aplicativo. (O `dist/` não
  // serve para isto: ele tem o Supabase configurado e para no portão de login.)
  const ARQUIVO = new URL('../financeiro.html', import.meta.url).pathname;
  const srv = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(readFileSync(ARQUIVO));
  });
  await new Promise((r) => srv.listen(4601, r));

  const ctx = await b.newContext({ viewport: { width: 1280, height: 1000 } });
  const p = await ctx.newPage();
  await p.addInitScript((d) => localStorage.setItem('financeiro-pessoal', d), C);
  await p.goto('http://localhost:4601/#/painel');
  await p.waitForSelector(`${VISTAS} button[aria-pressed="true"]`);
  await escolherVista(p, 'Números', 'numeros');

  await p.reload();
  await p.waitForSelector(`${VISTAS} button[aria-pressed="true"]`);
  const naTela = (await p.locator(`${VISTAS} button[aria-pressed="true"]`).textContent())?.trim();
  const noAparelho = await p.evaluate(() => {
    try { return localStorage.getItem('financeiro-pessoal:vista-do-painel'); }
    catch (e) { return `ERRO AO LER: ${e}`; }
  });
  cobrar(naTela === 'Números',
    `a vista não sobreviveu à recarga — tela mostra "${naTela}", aparelho guardou "${noAparelho}"`);
  await ctx.close();
  srv.close();
}

/* ------- A resposta de "Procurar atualização" fica ao lado do botão -------
 *
 * Ela ia para o aviso do topo da página, a uma tela inteira de distância do
 * botão. Quem toca ali está no fim de uma página longa: o recado aparecia fora
 * do campo de visão e a impressão era de que o botão não tinha feito nada —
 * logo onde a pergunta é justamente "ele fez alguma coisa?".
 */
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 900 }, hasTouch: true, isMobile: true });
  const p = await ctx.newPage();
  await p.addInitScript((d) => localStorage.setItem('financeiro-pessoal', d), C);
  await p.goto(`${APP}#/ajustes`);
  await p.waitForSelector('button:has-text("Procurar atualização")');

  const botao = p.locator('button:has-text("Procurar atualização")');
  await botao.click();
  const recado = p.locator('.card:has(button:has-text("Procurar atualização")) .hint').last();
  await recado.waitFor({ timeout: 10000 });

  const [cxBotao, cxRecado] = [await botao.boundingBox(), await recado.boundingBox()];
  const distancia = Math.abs(cxRecado.y - cxBotao.y);
  cobrar(distancia < 120,
    `o recado da versão está a ${Math.round(distancia)}px do botão — longe demais para ser lido junto`);
  cobrar(cxRecado.y >= cxBotao.y - 8,
    'o recado da versão aparece ACIMA do botão, e não junto dele');

  // E não pode ter ido também para o aviso do topo: dois lugares dizendo a
  // mesma coisa é pior do que um.
  const noTopo = await p.locator('.banner[role="status"]').count();
  cobrar(noTopo === 0, 'o recado da versão também foi para o aviso do topo da página');

  const texto = (await recado.textContent())?.trim() ?? '';
  cobrar(texto.length > 0, 'o botão de procurar atualização não disse nada');
  await ctx.close();
}

await b.close();

if (falhas.length) { console.log(falhas.map((f) => '❌ ' + f).join('\n')); process.exit(1); }
console.log('✅ tipo e situação combinam na lista de lançamentos');
console.log('✅ o filtro "Atrasados" e a etiqueta da linha contam a mesma história');
console.log('✅ cada vista do painel mostra só o que promete, e "Tudo" mostra tudo');
console.log('✅ na vista de lançamentos a lista é o primeiro cartão');
console.log('✅ a vista escolhida fica guardada no aparelho');
console.log('✅ a resposta de "Procurar atualização" aparece ao lado do botão');
console.log('\nTUDO PASSOU');
