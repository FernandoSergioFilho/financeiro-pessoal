/**
 * Dois aparelhos na mesma carteira, com um Supabase de mentira que guarda
 * estado de verdade.
 *
 * Existe porque o mesmo defeito foi relatado duas vezes: abrir o app num
 * navegador novo duplicava as categorias e não trazia o que já estava lançado.
 * As duas vezes a correção anterior parecia certa lendo o código — e o que
 * faltava era justamente isto, ver dois navegadores conversando.
 *
 * A carteira do servidor começa COM os repetidos do bug antigo, de propósito:
 * é o estado em que as carteiras de verdade ficaram, e a limpeza precisa
 * atravessar a sincronização para valer em todos os aparelhos.
 */

/**
 * Dois aparelhos na mesma carteira, com o Supabase de mentira guardando
 * estado de verdade. Reproduz o relato: Edge primeiro, Chrome depois.
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';

const RAIZ=new URL('../dist', import.meta.url).pathname, REF='ugxazdowfborqbatjmqt';
const TIPOS={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json','.ico':'image/x-icon'};
const srv=createServer((req,res)=>{let p=join(RAIZ,decodeURIComponent(req.url.split('?')[0]));if(!existsSync(p)||p.endsWith('/'))p=join(RAIZ,'index.html');res.writeHead(200,{'content-type':TIPOS[extname(p)]??'application/octet-stream'});res.end(readFileSync(p));});
await new Promise(r=>srv.listen(4600,r));

// ---- o servidor: a carteira JÁ tem os duplicados do bug antigo ----
const T='2026-09-10T10:00:00.000Z';
let seq=0; const linhas=[];
const por=(t,r)=>linhas.push({wallet_id:'w1',table_name:t,record_id:r.id,payload:r,updated_at:r.updatedAt,deleted_at:null,seq:++seq});
por('accounts',{id:'a1',name:'Nubank',kind:'checking',openingBalance:500000,createdAt:T,updatedAt:T});
por('accounts',{id:'a2',name:'Nubank',kind:'checking',openingBalance:0,createdAt:T,updatedAt:T}); // repetida
for (const [id,name] of [['c1','Alimentação'],['c2','Moradia'],['c1b','Alimentação'],['c2b','Moradia']])
  por('categories',{id,name,kind:'expense',createdAt:T,updatedAt:T});
por('categories',{id:'c9',name:'Escola do Pedro',kind:'expense',createdAt:T,updatedAt:T});
por('entries',{id:'e1',kind:'expense',amount:25000,date:'2026-09-11',description:'Mercado do Edge',accountId:'a1',categoryId:'c1',paid:true,createdAt:T,updatedAt:T});

const rotear = async (rota) => {
  const req=rota.request(), url=new URL(req.url()), c=url.pathname;
  const ok=(b)=>rota.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(b)});
  if (req.method()==='OPTIONS') return rota.fulfill({status:200,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'},body:''});
  if (c.startsWith('/auth/v1/token')) return ok({access_token:'tok',token_type:'bearer',expires_in:99999,expires_at:Math.floor(Date.now()/1000)+99999,refresh_token:'r',user:{id:'u1',email:'eu@exemplo.com',aud:'authenticated',role:'authenticated'}});
  if (c.startsWith('/auth/v1/user')) return ok({id:'u1',email:'eu@exemplo.com',aud:'authenticated',role:'authenticated'});
  if (c.startsWith('/auth/v1/logout')) return ok({});
  if (c==='/rest/v1/rpc/meu_acesso') return ok([{wallet_id:'w1',situacao:'liberado'}]);
  if (c==='/rest/v1/rpc/is_owner') return ok(true);
  if (c==='/rest/v1/rpc/pedidos_pendentes'||c==='/rest/v1/rpc/membros') return ok([]);
  if (c==='/rest/v1/records') {
    if (req.method()==='GET') { const gt=Number((url.searchParams.get('seq')||'gt.0').replace('gt.','')); return ok(linhas.filter(l=>l.seq>gt)); }
    for (const r of JSON.parse(req.postData()||'[]')) {
      const i=linhas.findIndex(l=>l.table_name===r.table_name&&l.record_id===r.record_id);
      const nova={...r,seq:++seq}; if(i>=0) linhas[i]=nova; else linhas.push(nova);
    }
    return ok(JSON.parse(req.postData()||'[]'));
  }
  return ok([]);
};

const b=await chromium.launch({executablePath:process.env.CHROMIUM});
const abrir = async (nome) => {
  const ctx=await b.newContext({viewport:{width:1280,height:1000}});
  const p=await ctx.newPage();
  p.on('pageerror',e=>console.log(`  !! ${nome}:`,String(e).slice(0,120)));
  await p.route(`**${REF}.supabase.co/**`, rotear);
  await p.goto('http://localhost:4600/',{waitUntil:'domcontentloaded'});
  await p.waitForTimeout(1000);
  await p.fill('input[type="email"]','eu@exemplo.com');
  await p.fill('input[type="password"]','senha123');
  await p.click('form.form-narrow button[type="submit"]');
  try { await p.waitForSelector('.nav-link', {timeout:25000}); }
  catch { console.log(`  !! ${nome} não entrou:`, (await p.locator('body').innerText()).replace(/\s+/g,' ').slice(0,180)); }
  await p.waitForTimeout(3000);
  return p;
};
const ler = (p) => p.evaluate(()=>{
  const d=JSON.parse(localStorage.getItem('financeiro-pessoal')||'{}');
  const n={}; for(const c of d.categories??[]) n[c.name]=(n[c.name]??0)+1;
  const a={}; for(const c of d.accounts??[]) a[c.name]=(a[c.name]??0)+1;
  return {catsRepetidas:Object.entries(n).filter(([,x])=>x>1).map(([k,x])=>`${k}×${x}`),
          contasRepetidas:Object.entries(a).filter(([,x])=>x>1).map(([k,x])=>`${k}×${x}`),
          cats:(d.categories??[]).length, lanc:(d.entries??[]).map(e=>e.description), lapides:(d.tombstones??[]).length};
});


const falhas=[];
const cobrar=(cond,msg)=>{ if(!cond) falhas.push(msg); };

console.log('=== 1) Edge entra ===');
const edge = await abrir('edge');
const e1=await ler(edge);
console.log('edge:', JSON.stringify(e1));
cobrar(e1.lanc.includes('Mercado do Edge'), 'o primeiro aparelho não recebeu o que havia na carteira');
cobrar(e1.catsRepetidas.length>0, 'o cenário não montou os repetidos antigos — o teste não provaria nada');

console.log('\n=== 2) Edge junta os duplicados ===');
await edge.click('.nav-link:has-text("Ajustes")'); await edge.waitForTimeout(600);
const temBotao = await edge.locator('button:has-text("Juntar")').count();
console.log('botão "Juntar" aparece?', temBotao>0);
if (temBotao) { await edge.click('button:has-text("Juntar")'); await edge.waitForTimeout(600);
  const conf = await edge.locator('.dialog button:has-text("Juntar")').count();
  if (conf) await edge.click('.dialog button:has-text("Juntar")');
  await edge.waitForTimeout(4000); }
const e2=await ler(edge);
console.log('edge depois de juntar:', JSON.stringify(e2));
cobrar(temBotao>0, 'o botão de juntar repetidos não apareceu com repetidos na carteira');
cobrar(e2.catsRepetidas.length===0 && e2.contasRepetidas.length===0, 'juntar não limpou os repetidos');
cobrar(e2.lanc.includes('Mercado do Edge'), 'juntar repetidos perdeu um lançamento');

console.log('\n=== 3) Chrome entra pela primeira vez ===');
const chrome = await abrir('chrome');
const c1=await ler(chrome);
console.log('chrome:', JSON.stringify(c1));
cobrar(c1.catsRepetidas.length===0 && c1.contasRepetidas.length===0,
  `o aparelho novo viu repetidos: ${c1.catsRepetidas.concat(c1.contasRepetidas).join(', ')}`);
cobrar(c1.lanc.includes('Mercado do Edge'), 'o aparelho novo não trouxe o que já estava lançado');
cobrar(c1.cats>0, 'o aparelho novo ficou sem categoria nenhuma');

console.log('\n=== 4) Edge lança algo novo; o Chrome recebe? ===');
await edge.click('.nav-link:has-text("Lançamentos")'); await edge.waitForTimeout(400);
await edge.click('button:has-text("Novo lançamento")'); await edge.waitForTimeout(600);
await edge.fill('.dialog input.money','77,00');
await edge.fill('.dialog input[placeholder*="Supermercado"]','Lançado no Edge depois');
await edge.click('.dialog button:has-text("Adicionar")');
await edge.waitForTimeout(5000);
await chrome.evaluate(()=>window.dispatchEvent(new Event('online')));
await chrome.waitForTimeout(5000);
const c2=await ler(chrome);
console.log('chrome:', JSON.stringify(c2));
cobrar(c2.lanc.includes('Lançado no Edge depois'), 'o que foi lançado num aparelho não chegou ao outro');
cobrar(c2.catsRepetidas.length===0, 'os repetidos voltaram depois de sincronizar de novo');
console.log('\nservidor tem', linhas.filter(l=>l.table_name==='categories').length, 'linhas de categoria,',
  linhas.filter(l=>l.table_name==='categories'&&l.deleted_at).length,'apagadas');
await b.close(); srv.close();
if (falhas.length) { console.log('\n'+falhas.map(f=>'❌ '+f).join('\n')); process.exit(1); }
console.log('\n✅ o aparelho novo entra sem repetir e com tudo o que já havia');
console.log('✅ juntar repetidos atravessa a sincronização');
console.log('✅ o que um aparelho lança chega ao outro');
console.log('\nTUDO PASSOU');
