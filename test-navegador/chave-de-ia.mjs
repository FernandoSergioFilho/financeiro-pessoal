/**
 * A chave do Gemini: o caminho aparece, e o aviso de privacidade diz a verdade.
 *
 * Duas coisas que só se veem no navegador, e que o usuário cobrou:
 *
 * 1. **Guardar a chave não mudava nada visível.** O caminho até a resposta tem
 *    três passos — Painel, "Analisar", aba "Levar a uma IA" — e nenhum dos
 *    rótulos tem a palavra "IA" na frente. Quem guardava a chave ficava sem
 *    saber o que fazer com ela. O aviso verde diz o caminho, e só aparece
 *    depois de a chave estar guardada.
 * 2. **Com chave, o aviso de privacidade virou mentira.** Ele dizia "o app não
 *    manda nada sozinho: quem cola é você" — verdade sem chave, falso com ela,
 *    porque aí o app manda mesmo, ao toque do botão. Um aviso de privacidade
 *    errado é pior do que aviso nenhum, então este teste cobra os dois textos.
 *
 * O Gemini é de mentira aqui (`page.route`): o que se prova é o que a tela faz,
 * não a rede.
 */

import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const APP='file://'+new URL('../financeiro.html', import.meta.url).pathname;
const HOJE=new Date().toISOString().slice(0,10);
const S=mkdtempSync(join(tmpdir(),'chave-'));
const tmp=mkdtempSync(join(tmpdir(),'ou-')); const g=join(tmp,'g.ts');
writeFileSync(g,`import { carteiraExemplo } from '/home/user/financeiro-pessoal/src/data/carteira-exemplo.ts';\nprocess.stdout.write(JSON.stringify(carteiraExemplo({ hoje: '${HOJE}' })));\n`);
const C=execFileSync('npx',['tsx',g],{encoding:'utf8',maxBuffer:32e6});
const falhas=[];
const b=await chromium.launch({executablePath:process.env.CHROMIUM});

for (const [w,tema] of [[390,'light'],[834,'dark'],[1280,'light'],[390,'dark']]) {
  const ctx=await b.newContext({viewport:{width:w,height:1100},colorScheme:tema,hasTouch:w<600,isMobile:w<600});
  const p=await ctx.newPage(); p.on('pageerror',e=>falhas.push(`erro de página ${w}/${tema}: ${e}`));
  await p.route('**generativelanguage.googleapis.com/**', async (rota) => {
    const url=rota.request().url();
    if (url.includes('/models?')) await rota.fulfill({status:200,contentType:'application/json',body:JSON.stringify({models:[
      {name:'models/gemini-flash-latest',displayName:'Gemini Flash',supportedGenerationMethods:['generateContent']},
      {name:'models/gemini-pro-latest',displayName:'Gemini Pro',supportedGenerationMethods:['generateContent']}]})});
    else await rota.fulfill({status:200,contentType:'application/json',body:JSON.stringify({candidates:[{content:{parts:[{text:'Resumo de teste.'}]}}]})});
  });
  await p.addInitScript((d)=>localStorage.setItem('financeiro-pessoal',d), C);

  // Sem chave: o aviso de "onde a resposta aparece" NÃO pode estar lá.
  await p.goto(`${APP}#/ajustes`); await p.waitForTimeout(900);
  if (await p.locator('.banner.ok:has-text("Onde a resposta aparece")').count() > 0)
    falhas.push(`${w}/${tema}: o caminho aparece sem chave nenhuma guardada`);

  // Guardar a chave: o caminho tem de aparecer na hora, sem recarregar.
  await p.fill('input[aria-label="Chave da API do Gemini"]','AIza-chave-de-teste');
  await p.click('button:has-text("Testar e guardar")'); await p.waitForTimeout(700);
  const cx=p.locator('.banner.ok:has-text("Onde a resposta aparece")');
  if (await cx.count()===0) { falhas.push(`${w}/${tema}: guardou a chave e não disse onde usar`); }
  else {
    const cd=await cx.boundingBox();
    const card=await p.locator('.card:has(input[aria-label="Chave da API do Gemini"])').boundingBox();
    if (cd.x < card.x - 1 || cd.x+cd.width > card.x+card.width + 1)
      falhas.push(`${w}/${tema}: o aviso do caminho escapa do cartão`);
    const t=(await cx.textContent())||'';
    for (const palavra of ['Analisar','Levar a uma IA','Perguntar agora'])
      if (!t.includes(palavra)) falhas.push(`${w}/${tema}: o caminho não cita "${palavra}"`);
  }
  if (await p.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+1))
    falhas.push(`${w}/${tema}: Ajustes rola de lado`);
  await p.screenshot({path:`${S}/onde-${w}-${tema}.png`,fullPage:false});

  // O aviso de privacidade tem de falar em "perguntar", não em "colar".
  await p.goto(`${APP}#/painel`); await p.waitForTimeout(800);
  await p.click('button:has-text("Analisar")'); await p.waitForTimeout(400);
  await p.click('.segmented button:text-is("Levar a uma IA")'); await p.waitForTimeout(400);
  const aviso=(await p.locator('.dialog .banner.warn').first().textContent())||'';
  if (!aviso.includes('quando você perguntar'))
    falhas.push(`${w}/${tema}: com chave, o aviso ainda diz "quando você colar"`);
  if (aviso.includes('quem cola é você'))
    falhas.push(`${w}/${tema}: com chave, o aviso ainda afirma que o app não manda nada — e manda`);
  if (!aviso.includes('Perguntar agora'))
    falhas.push(`${w}/${tema}: o aviso não diz quando exatamente o texto sai`);
  await ctx.close();
}

// E sem chave o texto antigo continua igual — não quebrei o caminho de sempre.
{
  const ctx=await b.newContext({viewport:{width:1280,height:1100}});
  const p=await ctx.newPage();
  await p.addInitScript((d)=>localStorage.setItem('financeiro-pessoal',d), C);
  await p.goto(`${APP}#/painel`); await p.waitForTimeout(800);
  await p.click('button:has-text("Analisar")'); await p.waitForTimeout(400);
  await p.click('.segmented button:text-is("Levar a uma IA")'); await p.waitForTimeout(400);
  const aviso=(await p.locator('.dialog .banner.warn').first().textContent())||'';
  if (!aviso.includes('quem cola é você')) falhas.push('sem chave: o aviso de sempre mudou');
  if (aviso.includes('quando você perguntar')) falhas.push('sem chave: o aviso fala de perguntar, e não há como perguntar');
  await ctx.close();
}
await b.close();
if (falhas.length) { console.log(falhas.map(f=>'❌ '+f).join('\n')); process.exit(1); }
console.log('✅ o caminho aparece ao guardar a chave, e só então');
console.log('✅ o aviso de privacidade diz a verdade nos dois casos');
console.log('\nTUDO PASSOU');
