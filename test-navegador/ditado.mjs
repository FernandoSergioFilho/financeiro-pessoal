/**
 * Ditar e lembrar, na tela de verdade.
 *
 * **Por que um reconhecedor falso.** O de verdade precisa de microfone e de
 * internet, e devolve o que quiser: não dá para testar com ele. Mas tudo o que
 * vem *depois* dele — interpretar a frase, preencher sete campos, manter o
 * formulário coerente, gravar — é código deste app, é onde o erro mora, e é
 * exatamente o que esta sonda exercita. O falso entra no lugar de
 * `webkitSpeechRecognition` antes de a página carregar e devolve uma frase
 * escrita aqui.
 *
 * A sonda também confere o `lang`: sem `pt-BR` o reconhecedor de verdade
 * transcreve em inglês e nada mais funciona — e isso não apareceria em
 * nenhum teste de unidade.
 *
 * O que se cobra, nas três larguras:
 *  1. a frase ditada preenche valor, data, nome, tipo e conta;
 *  2. o que foi entendido aparece escrito, para conferência;
 *  3. escrever um nome já usado traz de volta categoria, conta e — quando o
 *     valor nunca mudou — o valor;
 *  4. o que a pessoa escolheu com a mão não é sobrescrito pela memória;
 *  5. o bloco de ditar não rola a tela de lado nem encolhe o botão.
 */
import { chromium } from 'playwright';

const APP = 'file://' + new URL('../financeiro.html', import.meta.url).pathname;
const falhas = [];
const cobrar = (cond, msg) => { if (!cond) falhas.push(msg); };

const T = '2026-01-01T00:00:00.000Z';
const HOJE = new Date();
const iso = (d) => d.toISOString().slice(0, 10);
const ONTEM = iso(new Date(HOJE.getTime() - 864e5));

let n = 0;
const lanc = (nome, over) => ({
  id: `e${(n += 1)}`, date: iso(new Date(HOJE.getTime() - 30 * 864e5)), description: nome,
  amount: 9200, kind: 'expense', accountId: 'nb', toAccountId: null, categoryId: 'alim',
  status: 'settled', recurringId: null, occurrenceDate: null, purchaseId: null,
  installmentNumber: null, installmentTotal: null, createdAt: T, updatedAt: T, ...over,
});

const CARTEIRA = JSON.stringify({
  version: 2,
  accounts: [
    { id: 'cc', name: 'Conta corrente', kind: 'checking', openingBalance: 500000, color: 'green', updatedAt: T },
    { id: 'nb', name: 'Nubank', kind: 'checking', openingBalance: 200000, color: 'violet', updatedAt: T },
    { id: 'card', name: 'Cartão', kind: 'credit_card', openingBalance: 0, color: 'magenta', closingDay: 25, dueDay: 8, updatedAt: T },
  ],
  categories: [
    { id: 'alim', name: 'Alimentação', kind: 'expense', color: 'orange', emoji: '🍽️', updatedAt: T },
    { id: 'casa', name: 'Casa', kind: 'expense', color: 'blue', emoji: '🏠', updatedAt: T },
    { id: 'sal', name: 'Salário', kind: 'income', color: 'green', emoji: '💰', updatedAt: T },
  ],
  entries: [
    // Mercado: três vezes, valores diferentes — o valor NÃO deve ser preenchido.
    lanc('Mercado', { amount: 9200 }), lanc('Mercado', { amount: 8800 }), lanc('Mercado', { amount: 10100 }),
    // Aluguel: sempre o mesmo valor — este deve vir preenchido.
    lanc('Aluguel', { amount: 180000, accountId: 'cc', categoryId: 'casa' }),
    lanc('Aluguel', { amount: 180000, accountId: 'cc', categoryId: 'casa' }),
    // Salário: entrada, para provar que o tipo também é lembrado.
    lanc('Salário', { amount: 500000, accountId: 'cc', categoryId: 'sal', kind: 'income' }),
  ],
  recurring: [], purchases: [], tombstones: [],
});

/** O reconhecedor de mentira, instalado antes de a página rodar. */
function instalarFalso(frase) {
  window.__ditado = { idiomas: [], iniciou: 0 };
  class Falso {
    constructor() {
      this.lang = ''; this.continuous = false; this.interimResults = false; this.maxAlternatives = 1;
      this.onresult = null; this.onerror = null; this.onend = null;
    }
    start() {
      window.__ditado.idiomas.push(this.lang);
      window.__ditado.iniciou += 1;
      setTimeout(() => {
        const resultados = [{ 0: { transcript: frase }, isFinal: true }];
        this.onresult?.({ resultIndex: 0, results: resultados });
        this.onend?.();
      }, 20);
    }
    stop() { this.onend?.(); }
    abort() {}
  }
  // Os dois nomes: o Chromium novo expõe o sem prefixo, e sobrescrever só o
  // `webkit` deixava o reconhecedor DE VERDADE rodando — que abre, não ouve
  // nada e nunca volta.
  window.SpeechRecognition = Falso;
  window.webkitSpeechRecognition = Falso;
}

const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});

/** Abre o diálogo de novo lançamento pelo botão que estiver visível. */
async function abrirNovo(p, largura) {
  await p.click(largura < 600 ? '.fab' : '.topbar button:has-text("Novo lançamento")');
  await p.waitForSelector('.dialog');
}

async function conferirCss(p, onde, largura) {
  if (await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1))
    falhas.push(`${onde} ${largura}: a página rola de lado`);
  const ruins = await p.evaluate(() => {
    const fora = [];
    for (const el of document.querySelectorAll('.ditado .btn, .ditado-linha .hint, .ditado-texto')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      if (r.right > window.innerWidth + 1 || r.left < -1) fora.push(`${el.className} fora da tela`);
      if (el.classList.contains('btn') && (r.width < 44 || r.height < 32)) {
        fora.push(`botão de ditar ${Math.round(r.width)}×${Math.round(r.height)}`);
      }
    }
    return fora;
  });
  if (ruins.length) falhas.push(`${onde} ${largura}: ${ruins.join(', ')}`);
}

/* ========================= 1. a frase ditada preenche ===================== */
const FRASE = 'paguei o mercado quarenta e cinco reais ontem no Nubank';

for (const largura of [390, 834, 1280]) {
  const ctx = await b.newContext({
    viewport: { width: largura, height: 1000 },
    hasTouch: largura < 600, isMobile: largura < 600,
  });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => falhas.push(`erro de página (ditado) ${largura}: ${e}`));
  await p.addInitScript((d) => localStorage.setItem('financeiro-pessoal', d), CARTEIRA);
  await p.addInitScript(instalarFalso, FRASE);

  await p.goto(`${APP}#/lancamentos`);
  await p.waitForSelector('.eixos-do-recorte');
  await abrirNovo(p, largura);

  const botao = p.locator('.dialog .ditado button:has-text("Ditar")');
  cobrar(await botao.isVisible(), `${largura}: o botão de ditar não aparece no diálogo`);
  await conferirCss(p, 'diálogo antes de ditar', largura);
  if (!(await botao.isEnabled())) {
    falhas.push(`${largura}: o botão de ditar está desabilitado`);
    await ctx.close();
    continue;
  }

  await botao.click();
  await p.waitForSelector('.dialog .banner.ok:has-text("Entendi")', { timeout: 5000 });

  const idioma = await p.evaluate(() => window.__ditado.idiomas[0]);
  cobrar(idioma === 'pt-BR', `${largura}: o reconhecedor foi ligado em "${idioma}" e não em pt-BR`);

  const valor = await p.locator('.dialog input.money').inputValue();
  const data = await p.locator('.dialog input[type="date"]').inputValue();
  const nome = await p.locator('.dialog input[list="nomes-ja-lancados"]').inputValue();
  const saida = await p.locator('.dialog .segmented button:text-is("Saída")').getAttribute('aria-pressed');
  const conta = await p.locator('.dialog').getByLabel('Conta', { exact: true }).inputValue();
  const categoria = await p.locator('.dialog').getByLabel('Categoria', { exact: true }).inputValue();
  const entendi = (await p.locator('.dialog .banner.ok').textContent())?.replace(/\s+/g, ' ') ?? '';

  cobrar(valor === '45,00', `${largura}: o valor ditado virou "${valor}" (esperado 45,00)`);
  cobrar(data === ONTEM, `${largura}: "ontem" virou ${data} (esperado ${ONTEM})`);
  cobrar(nome === 'Mercado', `${largura}: o nome ditado virou "${nome}" (esperado Mercado)`);
  cobrar(saida === 'true', `${largura}: "paguei" não deixou o tipo em Saída`);
  cobrar(conta === 'nb', `${largura}: "no Nubank" não escolheu a conta (ficou "${conta}")`);
  // A categoria não foi dita: vem da memória dos três Mercados já lançados.
  cobrar(categoria === 'alim', `${largura}: a memória não trouxe a categoria do nome ditado (ficou "${categoria}")`);
  cobrar(/45,00/.test(entendi) && /ontem/.test(entendi),
    `${largura}: a linha "Entendi" não diz o que foi entendido — "${entendi}"`);
  cobrar(new RegExp(FRASE.slice(0, 20)).test(await p.locator('.dialog .ditado-texto').textContent() ?? ''),
    `${largura}: o texto ouvido não aparece na tela`);
  await conferirCss(p, 'diálogo depois de ditar', largura);

  // E grava o que está na tela, sem nada perdido no caminho.
  await p.click('.dialog button:has-text("Adicionar")');
  await p.waitForTimeout(700);
  const gravado = await p.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('financeiro-pessoal') || '{}');
    return (d.entries ?? []).filter((e) => e.amount === 4500);
  });
  cobrar(gravado.length === 1, `${largura}: gravou ${gravado.length} lançamentos de R$ 45,00 (esperado 1)`);
  if (gravado[0]) {
    const { description, date, kind, accountId, categoryId, status } = gravado[0];
    cobrar(description === 'Mercado', `${largura}: gravou o nome "${description}"`);
    cobrar(date === ONTEM, `${largura}: gravou a data ${date} (esperado ${ONTEM})`);
    cobrar(kind === 'expense', `${largura}: gravou o tipo ${kind}`);
    cobrar(accountId === 'nb', `${largura}: gravou na conta ${accountId}`);
    cobrar(categoryId === 'alim', `${largura}: gravou a categoria ${categoryId}`);
    // "Paguei" no passado não é confirmação: o app não mexe no saldo sozinho.
    cobrar(status === 'pending', `${largura}: "paguei" marcou como pago sozinho (${status})`);
  }
  await ctx.close();
}

/* =================== 2. a memória dos nomes, digitando ==================== */
for (const largura of [390, 1280]) {
  const ctx = await b.newContext({
    viewport: { width: largura, height: 1000 },
    hasTouch: largura < 600, isMobile: largura < 600,
  });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => falhas.push(`erro de página (memória) ${largura}: ${e}`));
  await p.addInitScript((d) => localStorage.setItem('financeiro-pessoal', d), CARTEIRA);
  await p.goto(`${APP}#/lancamentos`);
  await p.waitForSelector('.eixos-do-recorte');
  await abrirNovo(p, largura);

  const nome = p.locator('.dialog input[list="nomes-ja-lancados"]');
  const conta = p.locator('.dialog').getByLabel('Conta', { exact: true });
  const categoria = p.locator('.dialog').getByLabel('Categoria', { exact: true });
  const valor = p.locator('.dialog input.money');

  // A lista de nomes conhecidos existe e tem o que já foi lançado.
  const opcoes = await p.evaluate(() =>
    [...document.querySelectorAll('#nomes-ja-lancados option')].map((o) => o.value));
  for (const esperado of ['Mercado', 'Aluguel', 'Salário']) {
    cobrar(opcoes.includes(esperado), `${largura}: "${esperado}" não está na lista de nomes já usados — ${opcoes.join(', ')}`);
  }

  // Nome de valor que muda: traz categoria e conta, e NÃO chuta o valor.
  await nome.fill('Mercado');
  await p.waitForTimeout(350);
  cobrar(await categoria.inputValue() === 'alim', `${largura}: "Mercado" não trouxe a categoria`);
  cobrar(await conta.inputValue() === 'nb', `${largura}: "Mercado" não trouxe a conta`);
  cobrar(await valor.inputValue() === '', `${largura}: chutou um valor para um nome cujo valor muda ("${await valor.inputValue()}")`);
  const dica = (await p.locator('.dialog .field:has(input[list="nomes-ja-lancados"]) .hint').textContent()) ?? '';
  cobrar(/Como em/.test(dica), `${largura}: a dica não diz de onde veio o preenchido — "${dica}"`);

  // Nome de valor fixo: aí sim o valor vem pronto.
  await nome.fill('Aluguel');
  await p.waitForTimeout(350);
  cobrar(await valor.inputValue() === '1.800,00', `${largura}: "Aluguel" não trouxe o valor fixo (ficou "${await valor.inputValue()}")`);
  cobrar(await categoria.inputValue() === 'casa', `${largura}: "Aluguel" não trouxe a categoria Casa`);
  cobrar(await conta.inputValue() === 'cc', `${largura}: "Aluguel" não trouxe a conta corrente`);

  // Nome de entrada: o tipo vira Entrada, e a categoria é de entrada.
  await nome.fill('Salário');
  await p.waitForTimeout(350);
  const entrada = await p.locator('.dialog .segmented button:text-is("Entrada")').getAttribute('aria-pressed');
  cobrar(entrada === 'true', `${largura}: "Salário" não virou Entrada`);
  cobrar(await p.locator('.dialog').getByLabel('Categoria', { exact: true }).inputValue() === 'sal',
    `${largura}: "Salário" não trouxe a categoria de entrada`);

  await ctx.close();
}

/* ============ 3. o que foi escolhido com a mão não é sobrescrito ========== */
{
  const ctx = await b.newContext({ viewport: { width: 1280, height: 1000 } });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => falhas.push(`erro de página (mão): ${e}`));
  await p.addInitScript((d) => localStorage.setItem('financeiro-pessoal', d), CARTEIRA);
  await p.goto(`${APP}#/lancamentos`);
  await p.waitForSelector('.eixos-do-recorte');
  await abrirNovo(p, 1280);

  // Escolhe Casa na mão; depois escreve "Mercado", cuja memória diz Alimentação.
  await p.locator('.dialog').getByLabel('Categoria', { exact: true }).selectOption('casa');
  await p.locator('.dialog').getByLabel('Conta', { exact: true }).selectOption('card');
  await p.locator('.dialog input.money').fill('33,00');
  await p.locator('.dialog input[list="nomes-ja-lancados"]').fill('Mercado');
  await p.waitForTimeout(400);

  cobrar(await p.locator('.dialog').getByLabel('Categoria', { exact: true }).inputValue() === 'casa',
    'a memória passou por cima da categoria escolhida na mão');
  cobrar(await p.locator('.dialog').getByLabel('Conta', { exact: true }).inputValue() === 'card',
    'a memória passou por cima da conta escolhida na mão');
  cobrar(await p.locator('.dialog input.money').inputValue() === '33,00',
    'a memória passou por cima do valor digitado');

  // E com um nome de valor FIXO, que é o único caso em que a memória
  // preencheria o valor: ela tem de continuar sem encostar nele.
  await p.locator('.dialog input[list="nomes-ja-lancados"]').fill('Aluguel');
  await p.waitForTimeout(400);
  cobrar(await p.locator('.dialog input.money').inputValue() === '33,00',
    `a memória trocou o valor digitado pelo valor fixo do nome (ficou "${await p.locator('.dialog input.money').inputValue()}")`);
  await ctx.close();
}

await b.close();

if (falhas.length) {
  console.error('❌ ditado e memória:');
  for (const f of falhas) console.error('   ·', f);
  process.exit(1);
}
console.log('✅ ditado e memória: a frase preenche, o nome lembra, a mão manda');
