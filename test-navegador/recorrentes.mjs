/**
 * Mudar uma conta recorrente daqui em diante, na tela de verdade.
 *
 * O pedido, com o caso: "uma assinatura mudou de preço, as do passado já
 * foram, mas as recorrências futuras serão todas com novo preço". O app tinha
 * os dois extremos — mudar um mês só, ou mudar todos, inclusive os que já
 * aconteceram — e nada no meio.
 *
 * A sonda anda pelos meses com as setas do período, que é como quem usa
 * confere, e cobra as três coisas que um corte mal feito estraga:
 *
 *  1. o passado continua com o valor antigo;
 *  2. deste mês em diante vale o novo;
 *  3. nenhum mês aparece duas vezes — o erro clássico de dividir uma série é
 *     a regra velha e a nova projetarem o mesmo dia.
 *
 * E a outra metade da escolha: "somente este" tem de continuar mudando um mês
 * só, senão a caixa nova teria estragado o que já funcionava.
 */
import { chromium } from 'playwright';

const APP = 'file://' + new URL('../financeiro.html', import.meta.url).pathname;
const falhas = [];
const cobrar = (cond, msg) => { if (!cond) falhas.push(msg); };

const T = '2026-01-01T00:00:00.000Z';
const hoje = new Date();
/** O dia 5 de N meses atrás, para a série ter passado de sobra. */
function diaCinco(mesesAtras) {
  const d = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - mesesAtras, 5));
  return d.toISOString().slice(0, 10);
}

const CARTEIRA = JSON.stringify({
  version: 2,
  accounts: [{ id: 'cc', name: 'Conta corrente', kind: 'checking', openingBalance: 500000, color: 'green', updatedAt: T }],
  categories: [{ id: 'lazer', name: 'Lazer', kind: 'expense', color: 'violet', emoji: '🎬', updatedAt: T }],
  entries: [],
  recurring: [{
    id: 'r1', description: 'Streaming', amount: 2990, kind: 'expense', accountId: 'cc',
    toAccountId: null, categoryId: 'lazer', frequency: 'monthly', interval: 1,
    startDate: diaCinco(4), endDate: null, maxOccurrences: null, active: true,
    skippedDates: [], createdAt: T, updatedAt: T,
  }],
  purchases: [], tombstones: [],
});

const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});

/** As linhas de "Streaming" do mês em que o período está, com o valor. */
async function streamingDoMes(p) {
  return p.evaluate(() =>
    [...document.querySelectorAll('.entry')]
      .filter((e) => (e.querySelector('.entry-title .text')?.textContent ?? '').includes('Streaming'))
      .map((e) => (e.querySelector('.entry-amount')?.textContent ?? '').replace(/\s+/g, ' ').trim()));
}

async function andarMeses(p, quantos) {
  const rotulo = quantos > 0 ? 'Próximo período' : 'Período anterior';
  for (let i = 0; i < Math.abs(quantos); i += 1) {
    await p.click(`[aria-label="${rotulo}"]`);
    await p.waitForTimeout(250);
  }
  await p.waitForTimeout(250);
}

/** Abre a ocorrência do mês atual, muda o valor e escolhe o alcance. */
async function editar(p, novoValor, escolha) {
  await p.click('.entry:has(.entry-title .text:text-is("Streaming"))');
  await p.waitForSelector('.dialog');
  await p.waitForTimeout(300);
  await p.locator('.dialog input.money').fill(novoValor);
  await p.click('.dialog button:has-text("Salvar")');
  await p.waitForSelector('.alcance', { timeout: 5000 });
  await p.click(`.alcance button:has-text("${escolha}")`);
  await p.waitForTimeout(600);
}

for (const [largura, tema] of [[390, 'light'], [1280, 'dark']]) {
  const ctx = await b.newContext({
    viewport: { width: largura, height: 1000 }, colorScheme: tema,
    hasTouch: largura < 600, isMobile: largura < 600,
  });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => falhas.push(`erro de página ${largura}/${tema}: ${e}`));
  await p.addInitScript((d) => {
    localStorage.setItem('financeiro-pessoal', d);
    localStorage.setItem('financeiro-pessoal:novidades-vistas', 'em-dia');
  }, CARTEIRA);

  await p.goto(`${APP}#/lancamentos`);
  await p.waitForSelector('.entry');

  const antes = await streamingDoMes(p);
  cobrar(antes.length === 1 && /29,90/.test(antes[0] ?? ''),
    `${largura}/${tema}: o mês não começou com uma ocorrência de R$ 29,90 — ${JSON.stringify(antes)}`);

  await editar(p, '39,90', 'Este e os futuros');

  const esteMes = await streamingDoMes(p);
  cobrar(esteMes.length === 1, `${largura}/${tema}: o mês do corte tem ${esteMes.length} linhas — esperava 1`);
  cobrar(/39,90/.test(esteMes[0] ?? ''),
    `${largura}/${tema}: o mês do corte ficou em ${JSON.stringify(esteMes)}`);

  await andarMeses(p, 1);
  const proximo = await streamingDoMes(p);
  cobrar(proximo.length === 1, `${largura}/${tema}: o mês seguinte tem ${proximo.length} linhas — esperava 1`);
  cobrar(/39,90/.test(proximo[0] ?? ''),
    `${largura}/${tema}: o mês seguinte não pegou o valor novo — ${JSON.stringify(proximo)}`);

  await andarMeses(p, 2);
  const daquiADois = await streamingDoMes(p);
  cobrar(daquiADois.length === 1 && /39,90/.test(daquiADois[0] ?? ''),
    `${largura}/${tema}: dois meses à frente não seguiu o valor novo — ${JSON.stringify(daquiADois)}`);

  // E o passado, que é a razão de existir desta escolha.
  await andarMeses(p, -5);
  const passado = await streamingDoMes(p);
  cobrar(passado.length === 1, `${largura}/${tema}: o mês passado tem ${passado.length} linhas — esperava 1`);
  cobrar(/29,90/.test(passado[0] ?? ''),
    `${largura}/${tema}: o passado foi reescrito pelo valor novo — ${JSON.stringify(passado)}`);

  await andarMeses(p, -1);
  const maisAntigo = await streamingDoMes(p);
  cobrar(/29,90/.test(maisAntigo[0] ?? ''),
    `${largura}/${tema}: dois meses atrás também mudou — ${JSON.stringify(maisAntigo)}`);

  await ctx.close();
}

/* ---------------- "Somente este" continua mudando um mês só -------------- */
{
  const ctx = await b.newContext({ viewport: { width: 1280, height: 1000 } });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => falhas.push(`erro de página (somente este): ${e}`));
  await p.addInitScript((d) => {
    localStorage.setItem('financeiro-pessoal', d);
    localStorage.setItem('financeiro-pessoal:novidades-vistas', 'em-dia');
  }, CARTEIRA);

  await p.goto(`${APP}#/lancamentos`);
  await p.waitForSelector('.entry');
  await editar(p, '49,90', 'Somente este');

  const esteMes = await streamingDoMes(p);
  cobrar(esteMes.length === 1 && /49,90/.test(esteMes[0] ?? ''),
    `"somente este" não mudou o mês escolhido — ${JSON.stringify(esteMes)}`);

  await andarMeses(p, 1);
  const proximo = await streamingDoMes(p);
  cobrar(proximo.length === 1, `"somente este" deixou ${proximo.length} linhas no mês seguinte`);
  cobrar(/29,90/.test(proximo[0] ?? ''),
    `"somente este" vazou para o mês seguinte — ${JSON.stringify(proximo)}`);

  await andarMeses(p, -2);
  const passado = await streamingDoMes(p);
  cobrar(/29,90/.test(passado[0] ?? ''),
    `"somente este" mexeu no passado — ${JSON.stringify(passado)}`);

  // E só UMA regra continua existindo: "somente este" não divide nada.
  const regras = await p.evaluate(() =>
    JSON.parse(localStorage.getItem('financeiro-pessoal') || '{}').recurring?.length ?? 0);
  cobrar(regras === 1, `"somente este" criou ${regras} regras recorrentes — esperava 1`);

  await ctx.close();
}

await b.close();

if (falhas.length) {
  console.error('❌ recorrentes:');
  for (const f of falhas) console.error('   ·', f);
  process.exit(1);
}
console.log('✅ recorrentes: daqui em diante muda o futuro e preserva o passado');
