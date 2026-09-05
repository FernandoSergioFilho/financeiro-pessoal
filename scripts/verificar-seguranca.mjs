/**
 * Confere que os lançamentos NÃO são acessíveis sem login.
 *
 * A chave `anon` é entregue a qualquer pessoa que abra o site — é assim que
 * todo aplicativo Supabase funciona no navegador. Quem impede um estranho de
 * ler a sua carteira são as políticas de acesso de `supabase/schema.sql`.
 *
 * Este script usa exatamente a mesma chave pública, sem estar logado, e tenta
 * ler e gravar os seus dados. Rode antes de publicar o site, e de novo sempre
 * que mexer no schema:
 *
 *     npm run verificar-seguranca
 *
 * Um cuidado que vale mais que o resto do arquivo: uma resposta negativa só
 * conta como proteção se veio do SEU servidor. Firewall, proxy corporativo ou
 * URL errada também respondem "não" — e tratar isso como sucesso faria o
 * script dar luz verde sem ter testado coisa alguma.
 */

import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');

async function lerEnv() {
  const valores = {};
  for (const arquivo of ['.env.production', '.env.local']) {
    try {
      const texto = await readFile(join(raiz, arquivo), 'utf8');
      for (const linha of texto.split('\n')) {
        const m = /^\s*([A-Z_]+)\s*=\s*(.+?)\s*$/.exec(linha);
        if (m) valores[m[1]] = m[2];
      }
    } catch {
      // arquivo ausente é normal
    }
  }
  return valores;
}

const env = await lerEnv();
const url = (env.VITE_SUPABASE_URL || '').replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
const chave = env.VITE_SUPABASE_ANON_KEY;

if (!url || !chave) {
  console.error('Faltam VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY em .env.production ou .env.local.');
  process.exit(1);
}

const cabecalhos = { apikey: chave, Authorization: `Bearer ${chave}` };

/**
 * Uma resposta do PostgREST é sempre JSON. Proxies e firewalls no caminho
 * respondem texto ou HTML — é assim que se distingue "o servidor negou" de
 * "não cheguei ao servidor", que é a diferença entre estar protegido e não
 * ter testado nada.
 */
function ehJson(corpo, headers) {
  if (!headers.get('content-type')?.includes('json')) return false;
  try {
    JSON.parse(corpo);
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------- 1. dá para falar com ele? */

console.log(`Testando ${url} com a chave pública, SEM estar logado.\n`);

let alcancavel = false;
try {
  const r = await fetch(`${url}/rest/v1/`, { headers: cabecalhos });
  const corpo = await r.text();
  alcancavel = r.status === 200 && ehJson(corpo, r.headers);
  if (!alcancavel) {
    console.error('❌ Não consegui falar com o seu Supabase.');
    console.error(`   HTTP ${r.status} — ${corpo.slice(0, 200)}`);
  }
} catch (erro) {
  console.error('❌ Não consegui falar com o seu Supabase.');
  console.error(`   ${erro.message}`);
}

if (!alcancavel) {
  console.error('\nPode ser a URL errada, o projeto suspenso por inatividade, ou uma');
  console.error('rede que bloqueia o acesso (proxy, firewall, VPN do trabalho).');
  console.error('NADA foi verificado — não tome isto como sinal de que está seguro.');
  process.exit(2);
}

/* --------------------------------------------------- 2. o que dá para ver? */

let protegidos = 0;
let expostos = 0;
let inconclusivos = 0;
let semEstrutura = false;

async function tentar(rotulo, caminho, opcoes = {}) {
  let r;
  let corpo;
  try {
    r = await fetch(`${url}/rest/v1/${caminho}`, { headers: cabecalhos, ...opcoes });
    corpo = await r.text();
  } catch (erro) {
    inconclusivos += 1;
    console.log(`⚠️  ${rotulo}: não deu para testar (${erro.message})\n`);
    return;
  }

  if (!ehJson(corpo, r.headers)) {
    inconclusivos += 1;
    console.log(`⚠️  ${rotulo}: a resposta não veio do Supabase (algo no caminho respondeu).`);
    console.log(`   HTTP ${r.status} — ${corpo.slice(0, 120)}\n`);
    return;
  }

  const texto = corpo.trim();
  const vazio = texto === '[]';
  const negado = r.status === 401 || r.status === 403;
  // 42P01 é "tabela não existe": o schema ainda não foi aplicado.
  const faltaTabela = texto.includes('42P01') || (r.status === 404 && texto.includes('message'));

  if (faltaTabela) {
    semEstrutura = true;
    inconclusivos += 1;
    console.log(`⚠️  ${rotulo}: a tabela não existe ainda.\n   HTTP ${r.status} — ${texto.slice(0, 120)}\n`);
    return;
  }

  if (vazio || negado) {
    protegidos += 1;
    console.log(`✅ ${rotulo}\n   HTTP ${r.status} — ${texto.slice(0, 120) || '(vazio)'}\n`);
    return;
  }

  expostos += 1;
  console.log(`❌ ${rotulo}`);
  console.log(`   HTTP ${r.status} — ${texto.slice(0, 200)}`);
  console.log('   ATENÇÃO: veio conteúdo sem login. Esta tabela NÃO está protegida.\n');
}

await tentar('Ler lançamentos de qualquer carteira', 'records?select=*&limit=5');
await tentar('Listar carteiras', 'wallets?select=*&limit=5');
await tentar('Listar membros', 'wallet_members?select=*&limit=5');
await tentar('Listar convites', 'wallet_invites?select=*&limit=5');
await tentar('Gravar um lançamento sem permissão', 'records', {
  method: 'POST',
  headers: { ...cabecalhos, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    wallet_id: '00000000-0000-0000-0000-000000000000',
    table_name: 'entries',
    record_id: 'invasor',
    payload: {},
    updated_at: new Date().toISOString(),
  }),
});

/* ------------------------------------------------------------ 3. veredito */

console.log('─'.repeat(62));

if (semEstrutura) {
  console.log('⚠️  O banco ainda não tem a estrutura do aplicativo.');
  console.log('   Rode o conteúdo de supabase/schema.sql no SQL Editor do Supabase');
  console.log('   e execute este comando de novo.');
  process.exitCode = 2;
} else if (expostos > 0) {
  console.log(`❌ ${expostos} tabela(s) acessível(is) SEM LOGIN. Não publique o site assim.`);
  console.log('   Rode supabase/schema.sql de novo e confira se as linhas');
  console.log('   "enable row level security" e as políticas foram aplicadas.');
  process.exitCode = 1;
} else if (inconclusivos > 0) {
  console.log(`⚠️  ${protegidos} verificação(ões) passaram, mas ${inconclusivos} não foi(ram) conclusiva(s).`);
  console.log('   Rode de novo numa rede sem proxy antes de considerar seguro.');
  process.exitCode = 2;
} else {
  console.log(`✅ Tudo protegido (${protegidos}/${protegidos}): sem login, nada é lido nem gravado.`);
  console.log('   Pode publicar o site.');
}
