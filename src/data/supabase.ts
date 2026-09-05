/**
 * Ligação com o Supabase: configuração, cliente e login.
 *
 * O app funciona sem nada disto. Se as variáveis não estiverem definidas,
 * `getSupabase()` devolve `null` e tudo segue local, como sempre foi — é o
 * que mantém o `financeiro.html` de arquivo único e o modo offline válidos.
 */

import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';

/**
 * Aceita tanto a URL base quanto a que o painel do Supabase mostra com
 * `/rest/v1/` no fim: colar a errada é o engano mais fácil de cometer, e
 * falharia com uma mensagem que não ajuda em nada.
 */
export function normalizeUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, '').replace(/\/rest\/v1$/, '').replace(/\/auth\/v1$/, '');
}

export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

export function readConfig(): SupabaseConfig | null {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return { url: normalizeUrl(url), anonKey };
}

let client: SupabaseClient | null | undefined;

/** `null` quando o app está configurado apenas para uso local. */
export function getSupabase(): SupabaseClient | null {
  if (client !== undefined) return client;

  const config = readConfig();
  client = config
    ? createClient(config.url, config.anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          // O link de e-mail volta com a sessão no hash da URL; como a
          // navegação do app também usa hash, ela é lida e limpa na hora.
          detectSessionInUrl: true,
        },
      })
    : null;
  return client;
}

export const isCloudEnabled = (): boolean => getSupabase() !== null;

/* ------------------------------------------------------------------ login */

/** Envia o link de acesso. Sem senha para o usuário decorar ou vazar. */
export async function sendMagicLink(email: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) throw new Error('A sincronização não está configurada neste aplicativo.');

  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim(),
    options: {
      // Volta para a mesma página de onde saiu, sem o hash de navegação.
      emailRedirectTo: window.location.href.split('#')[0],
    },
  });
  if (error) throw new Error(traduzirErro(error.message));
}

export async function signOut(): Promise<void> {
  await getSupabase()?.auth.signOut();
}

export async function currentUser(): Promise<User | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}

export function onAuthChange(listener: (user: User | null) => void): () => void {
  const supabase = getSupabase();
  if (!supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange((_event, session) => listener(session?.user ?? null));
  return () => data.subscription.unsubscribe();
}

/* ---------------------------------------------------------------- carteira */

/** A carteira de quem está logado; cria uma na primeira vez. */
export async function ensureWallet(): Promise<string> {
  const supabase = getSupabase();
  if (!supabase) throw new Error('A sincronização não está configurada neste aplicativo.');

  const { data: existente, error: erroBusca } = await supabase.rpc('my_wallet');
  if (erroBusca) throw new Error(traduzirErro(erroBusca.message));
  if (existente) return existente as string;

  const { data: nova, error } = await supabase.rpc('create_wallet', { wallet_name: 'Nossa carteira' });
  if (error) throw new Error(traduzirErro(error.message));
  return nova as string;
}

export async function createInvite(walletId: string): Promise<string> {
  const supabase = getSupabase();
  if (!supabase) throw new Error('A sincronização não está configurada neste aplicativo.');
  const { data, error } = await supabase.rpc('create_invite', { w: walletId });
  if (error) throw new Error(traduzirErro(error.message));
  return data as string;
}

export async function acceptInvite(code: string): Promise<string> {
  const supabase = getSupabase();
  if (!supabase) throw new Error('A sincronização não está configurada neste aplicativo.');
  const { data, error } = await supabase.rpc('accept_invite', { invite_code: code.trim() });
  if (error) throw new Error(traduzirErro(error.message));
  return data as string;
}

/** Mensagens do servidor chegam em inglês e técnicas demais. */
function traduzirErro(mensagem: string): string {
  const m = mensagem.toLowerCase();
  if (m.includes('convite')) return mensagem; // as nossas já vêm em português
  if (m.includes('rate limit') || m.includes('too many')) {
    return 'Muitas tentativas seguidas. Espere um minuto e tente de novo.';
  }
  if (m.includes('invalid') && m.includes('email')) return 'E-mail inválido.';
  if (m.includes('failed to fetch') || m.includes('networkerror')) {
    return 'Sem conexão com o servidor.';
  }
  if (m.includes('does not exist') || m.includes('schema cache')) {
    return 'O banco ainda não tem a estrutura: rode o supabase/schema.sql no SQL Editor.';
  }
  return mensagem;
}
