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
    // Valor cortado dentro do próprio cartão não faz a página rolar, então
    // passava despercebido: "R$ 12.972,00" virava "R$ 12.972," a 390px.
    cortados: [...document.querySelectorAll('.stat-value, .bar-value, .num')]
      .filter((el) => el.scrollWidth > el.clientWidth + 1)
      .slice(0, 3)
      .map((el) => el.textContent ?? ''),
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
      else if (estado.cortados.length > 0) erro(`${pagina} ${width}px ${tema}: valor cortado — ${JSON.stringify(estado.cortados)}`);
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

/* --------------- 2b. o banco com conta e cartão numa linha só */

{
  const { ctx, page, quebras } = await abrir();
  await page.goto(`${APP}#/ajustes`);
  await page.waitForTimeout(700);

  const tabela = await page.evaluate(() =>
    [...document.querySelectorAll('table tbody tr')].map((tr) => ({
      banco: tr.classList.contains('linha-banco'),
      texto: (tr.textContent ?? '').trim(),
    })),
  );
  const cabecalhos = tabela.filter((l) => l.banco).map((l) => l.texto);
  if (!cabecalhos.some((t) => t.startsWith('Nubank'))) {
    erro(`a lista de contas não agrupou o Nubank: ${JSON.stringify(cabecalhos)}`);
  } else if (!cabecalhos.some((t) => t.startsWith('Itaú'))) {
    erro(`a lista de contas não agrupou o Itaú: ${JSON.stringify(cabecalhos)}`);
  } else if (cabecalhos.some((t) => t.startsWith('Carteira'))) {
    erro('a conta avulsa virou cabeçalho de banco à toa');
  } else ok(`contas agrupadas por banco: ${cabecalhos.map((t) => t.split('·')[0].trim()).join(', ')}`);

  // O painel também: subtotal do banco, sem misturar os dois saldos.
  await page.goto(`${APP}#/painel`);
  await page.waitForTimeout(700);
  const semRepetido = await page.evaluate(() => {
    const cartao = [...document.querySelectorAll('.card')].find((c) =>
      c.querySelector('h2, h3')?.textContent?.includes('Saldo por conta'),
    );
    return (cartao?.textContent ?? '').match(/Cartão/g)?.length ?? 0;
  });
  if (semRepetido !== 2) erro(`o painel deveria mostrar os dois cartões nomeados "Cartão" (achou ${semRepetido})`);
  else ok('o painel mostra cada conta do banco separada, com o subtotal do grupo');

  if (quebras.length > 0) erro(`agrupamento por banco: erro no console — ${quebras[0]}`);
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

/* ------------------------------- 6. importar o CSV do banco sem duplicar */

{
  const { ctx, page, quebras } = await abrir();
  await page.goto(`${APP}#/ajustes`);
  await page.waitForTimeout(700);

  // Extrato no formato do Nubank. A primeira linha é o aluguel que a carteira
  // já tem lançado no dia 10; as outras duas são novas.
  const dia = (d) => `${d}/${HOJE.slice(5, 7)}/${HOJE.slice(0, 4)}`;
  const csv = [
    'Data,Valor,Identificador,Descrição',
    `${dia('10')},-2450.00,abc-0001,Pagamento de boleto - ALUGUEL`,
    `${dia('11')},-78.90,abc-0002,Compra no débito - POSTO IPIRANGA`,
    `${dia('12')},-119.90,abc-0003,Compra no débito - DROGARIA SP`,
  ].join('\n');
  const arquivo = join(tmp, 'extrato.csv');
  writeFileSync(arquivo, csv);

  await page.click('button:text-is("🏦 Importar do banco")');
  await page.waitForTimeout(400);
  await page.setInputFiles('.dialog input[type=file]', arquivo);
  await page.waitForTimeout(700);

  const lido = await page.evaluate(() => {
    const numeros = [...document.querySelectorAll('.dialog .card.stat')].map((c) => ({
      rotulo: c.querySelector('.stat-label')?.textContent ?? '',
      valor: Number(c.querySelector('.stat-value')?.textContent ?? '0'),
    }));
    return {
      numeros,
      formato: [...document.querySelectorAll('.dialog .hint')]
        .map((h) => h.textContent ?? '')
        .find((t) => /separado por/.test(t)) ?? '',
      linhas: document.querySelectorAll('.dialog tbody tr').length,
      marcadas: [...document.querySelectorAll('.dialog tbody input[type=checkbox]')].filter((c) => c.checked).length,
      botao: [...document.querySelectorAll('.dialog button')].map((b) => b.textContent).join(' | '),
    };
  });

  const de = (rotulo) => lido.numeros.find((n) => n.rotulo === rotulo)?.valor;
  if (lido.linhas !== 3) erro(`o extrato deveria ter 3 linhas, tem ${lido.linhas}`);
  else if (de('Novos') !== 2) erro(`deveria achar 2 lançamentos novos, achou ${de('Novos')}`);
  else if (de('Já existem') !== 1) erro(`deveria reconhecer 1 já lançado, reconheceu ${de('Já existem')}`);
  else if (lido.marcadas !== 2) erro(`o repetido deveria vir desmarcado — ${lido.marcadas} marcadas de 3`);
  else ok(`extrato lido: ${de('Novos')} novos, ${de('Já existem')} já existia, só os novos marcados`);

  if (!/separado por/.test(lido.formato)) erro('não mostrou o formato que descobriu');
  else ok(`formato descoberto: "${lido.formato.trim().slice(0, 90)}"`);

  const antes = await page.evaluate(() => JSON.parse(localStorage.getItem('financeiro-pessoal')).entries.length);
  await page.click('.dialog button:has-text("Importar 2")');
  await page.waitForTimeout(800);
  const depois = await page.evaluate(() => JSON.parse(localStorage.getItem('financeiro-pessoal')).entries.length);
  if (depois !== antes + 2) erro(`deveria gravar 2 lançamentos (${antes} → ${depois})`);
  else ok(`importou 2 lançamentos (${antes} → ${depois})`);

  // Reimportar o mesmo arquivo não pode propor nada.
  await page.click('.dialog button:text-is("Fechar")');
  await page.waitForTimeout(300);
  await page.click('button:text-is("🏦 Importar do banco")');
  await page.waitForTimeout(400);
  await page.setInputFiles('.dialog input[type=file]', arquivo);
  await page.waitForTimeout(700);
  const segunda = await page.evaluate(() => ({
    marcadas: [...document.querySelectorAll('.dialog tbody input[type=checkbox]')].filter((c) => c.checked).length,
    temBotao: [...document.querySelectorAll('.dialog button')].some((b) => /^Importar \d/.test(b.textContent ?? '')),
  }));
  if (segunda.marcadas !== 0 || segunda.temBotao) erro(`reimportar o mesmo arquivo ainda propõe ${segunda.marcadas} linhas`);
  else ok('reimportar o mesmo arquivo não propõe nada');

  if (quebras.length > 0) erro(`importar do banco: erro no console — ${quebras[0]}`);
  await ctx.close();
}

/* --------------------------- 7. a cópia automática salva de um "apagar tudo" */

{
  const { ctx, page, quebras } = await abrir();
  await page.goto(`${APP}#/ajustes`);
  await page.waitForTimeout(900);

  // Uma alteração qualquer, para o app gravar de novo e criar a cópia de rotina.
  await page.click('text=+ Novo lançamento');
  await page.waitForTimeout(400);
  await page.fill('.dialog input[inputmode="decimal"], .dialog input[type="text"]', '17,90');
  await page.fill('.dialog input[placeholder^="Supermercado"]', 'Café da tarde');
  await page.click('.dialog button:text-is("Adicionar")');
  await page.waitForTimeout(700);

  const antes = await page.evaluate(() => JSON.parse(localStorage.getItem('financeiro-pessoal')).entries.length);

  // O desastre: apagar tudo.
  await page.click('button:text-is("Apagar tudo")');
  await page.waitForTimeout(400);
  await page.click('.dialog button.danger:text-is("Apagar")');
  await page.waitForTimeout(900);

  const depoisDoEstrago = await page.evaluate(
    () => JSON.parse(localStorage.getItem('financeiro-pessoal')).entries.length,
  );
  if (depoisDoEstrago !== 0) erro(`"Apagar tudo" não apagou (${depoisDoEstrago} lançamentos)`);

  await page.click('button:text-is("🕑 Ver cópias automáticas")');
  await page.waitForTimeout(500);
  const listadas = await page.evaluate(() =>
    [...document.querySelectorAll('.lista-repetidos li')].map((li) => li.textContent ?? ''),
  );
  const queda = listadas.find((t) => /perda grande/i.test(t));
  if (!queda) erro(`não guardou cópia antes do "apagar tudo": ${JSON.stringify(listadas)}`);
  else ok(`cópia guardada antes do estrago: "${queda.replace(/BaixarRestaurar/, '').trim()}"`);

  await page.click('.lista-repetidos li button:text-is("Restaurar")');
  await page.waitForTimeout(400);
  await page.click('.dialog button:text-is("Restaurar")');
  await page.waitForTimeout(900);

  const restaurado = await page.evaluate(
    () => JSON.parse(localStorage.getItem('financeiro-pessoal')).entries.length,
  );
  if (restaurado !== antes) erro(`restaurar não trouxe tudo de volta (${antes} → ${restaurado})`);
  else ok(`restaurou os ${restaurado} lançamentos de volta`);

  if (quebras.length > 0) erro(`cópia automática: erro no console — ${quebras[0]}`);
  await ctx.close();
}

/* ------------------------------------------- 8. a análise do período */

for (const width of [390, 1280]) {
  const { ctx, page, quebras } = await abrir({ width });
  await page.goto(`${APP}#/painel`);
  await page.waitForTimeout(800);

  await page.click('button:has-text("Analisar")');
  await page.waitForTimeout(700);

  const lido = await page.evaluate(() => ({
    indicadores: [...document.querySelectorAll('.dialog .card.stat .stat-label')].map((s) => s.textContent),
    achados: [...document.querySelectorAll('.dialog .banner strong')].map((s) => s.textContent ?? ''),
    corpos: [...document.querySelectorAll('.dialog .banner .dim')].map((s) => s.textContent ?? ''),
    estoura: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    cortados: [...document.querySelectorAll('.dialog .stat-value')]
      .filter((el) => el.scrollWidth > el.clientWidth + 1)
      .map((el) => el.textContent ?? ''),
  }));

  if (lido.indicadores.length < 4) erro(`a análise trouxe só ${lido.indicadores.length} indicadores`);
  else if (lido.achados.length < 3) erro(`a análise trouxe só ${lido.achados.length} achados`);
  else if (lido.estoura) erro(`a análise estoura para os lados em ${width}px`);
  else if (lido.cortados.length > 0) erro(`indicador cortado em ${width}px — ${JSON.stringify(lido.cortados)}`);
  else ok(`análise em ${width}px: ${lido.indicadores.length} indicadores e ${lido.achados.length} achados`);

  // Todo achado precisa carregar um número: sem número é opinião.
  const semNumero = lido.corpos.filter((t) => !/R\$|\d+%/.test(t));
  if (semNumero.length > 0) erro(`achado sem número: "${semNumero[0].slice(0, 70)}"`);
  else ok('todo achado da análise carrega o número que o sustenta');

  if (quebras.length > 0) erro(`análise em ${width}px: erro no console — ${quebras[0]}`);
  await ctx.close();
}

/* ------------------------- 9. os atalhos: do número até os lançamentos */

{
  const { ctx, page, quebras } = await abrir();
  await page.goto(`${APP}#/painel`);
  await page.waitForTimeout(900);

  // O aviso de atrasados é um botão e leva à lista já filtrada.
  await page.click('.banner.warn.clicavel');
  await page.waitForTimeout(800);
  const depoisDoAviso = await page.evaluate(() => ({
    rota: location.hash,
    recorte: document.querySelector('.segmented button[aria-pressed="true"]')?.textContent ?? '',
    periodo: document.querySelector('.month-nav .label')?.textContent ?? '',
    quantos: document.querySelectorAll('.entry').length,
  }));
  if (!depoisDoAviso.rota.includes('lancamentos')) erro(`o aviso de atrasados não navegou (${depoisDoAviso.rota})`);
  else if (!/Atrasados/.test(depoisDoAviso.recorte)) erro(`não abriu no recorte Atrasados (${depoisDoAviso.recorte})`);
  else if (depoisDoAviso.quantos === 0) erro('abriu a lista de atrasados vazia');
  else ok(`o aviso leva a ${depoisDoAviso.quantos} atrasados, período ${depoisDoAviso.periodo.trim()}`);

  // Uma barra de categoria leva aos lançamentos daquela categoria.
  await page.goto(`${APP}#/painel`);
  await page.waitForTimeout(800);
  const categoria = await page.locator('.bar-row.clicavel .bar-label .text').first().innerText();
  await page.locator('.bar-row.clicavel').first().click();
  await page.waitForTimeout(800);
  const depoisDaBarra = await page.evaluate(() => ({
    rota: location.hash,
    categoria: document.querySelector('select[aria-label="Filtrar por categoria"]')?.value ?? '',
    quantos: document.querySelectorAll('.entry').length,
  }));
  if (!depoisDaBarra.rota.includes('lancamentos') || !depoisDaBarra.categoria) {
    erro(`a barra de "${categoria}" não filtrou por categoria`);
  } else ok(`a barra de "${categoria}" leva a ${depoisDaBarra.quantos} lançamentos daquela categoria`);

  // Um cartão de indicador leva ao recorte dele.
  await page.goto(`${APP}#/painel`);
  await page.waitForTimeout(800);
  await page.click('.card.stat.clicavel:has-text("Saídas")');
  await page.waitForTimeout(800);
  const depoisDoCartao = await page.evaluate(
    () => document.querySelector('.segmented button[aria-pressed="true"]')?.textContent ?? '',
  );
  if (!/Saídas/.test(depoisDoCartao)) erro(`o cartão de saídas não abriu o recorte certo (${depoisDoCartao})`);
  else ok('o cartão de saídas leva à lista de saídas');

  if (quebras.length > 0) erro(`atalhos: erro no console — ${quebras[0]}`);
  await ctx.close();
}

/* --------------------------- 10. desmarcar todos como pagos */

{
  const { ctx, page, quebras } = await abrir();
  await page.goto(`${APP}#/ajustes`);
  await page.waitForTimeout(900);

  const antes = await page.evaluate(
    () => JSON.parse(localStorage.getItem('financeiro-pessoal')).entries.filter((e) => e.status === 'settled').length,
  );
  if (antes === 0) erro('a carteira de exemplo deveria ter lançamentos pagos para o teste valer');

  await page.click('button:has-text("Desmarcar todos como pagos")');
  await page.waitForTimeout(400);
  await page.click('.dialog button:text-is("Desmarcar todos")');
  await page.waitForTimeout(900);

  const depois = await page.evaluate(() => {
    const dados = JSON.parse(localStorage.getItem('financeiro-pessoal'));
    return {
      pagos: dados.entries.filter((e) => e.status === 'settled' && e.kind !== 'transfer').length,
      transferencias: dados.entries.filter((e) => e.kind === 'transfer' && e.status === 'settled').length,
      total: dados.entries.length,
    };
  });
  if (depois.pagos !== 0) erro(`sobraram ${depois.pagos} marcados como pagos`);
  else if (depois.transferencias === 0) erro('as transferências não deveriam ter sido desmarcadas');
  else ok(`${antes} pagos viraram 0; ${depois.transferencias} transferências intactas, ${depois.total} lançamentos preservados`);

  if (quebras.length > 0) erro(`desmarcar todos: erro no console — ${quebras[0]}`);
  await ctx.close();
}

await browser.close();
console.log('──────────────────────────────────────────────');
console.log(falhas === 0 ? 'TUDO PASSOU' : `${falhas} FALHA(S)`);
process.exit(falhas === 0 ? 0 : 1);
