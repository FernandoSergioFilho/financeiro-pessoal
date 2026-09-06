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

/**
 * E-mail e senha, e não link enviado por e-mail.
 *
 * O serviço de e-mail que vem com o Supabase entrega no máximo duas mensagens
 * por hora e **só para endereços da organização do projeto** — as demais são
 * descartadas sem erro nenhum. Numa carteira compartilhada isso significaria
 * que a segunda pessoa jamais receberia o convite de acesso.
 */
export const SENHA_MINIMA = 6;

export async function signIn(email: string, password: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) throw new Error('A sincronização não está configurada neste aplicativo.');

  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw new Error(traduzirErro(error.message));
}

export async function signUp(email: string, password: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) throw new Error('A sincronização não está configurada neste aplicativo.');

  const { error } = await supabase.auth.signUp({ email: email.trim(), password });
  if (error) throw new Error(traduzirErro(error.message));

  // Com a confirmação por e-mail desligada, cadastrar já deixa a pessoa
  // dentro. Se estiver ligada, a sessão não vem e o erro abaixo explica o
  // que fazer, em vez de deixar a tela parada sem dizer nada.
  const { data } = await supabase.auth.getSession();
  if (!data.session) {
    throw new Error(
      'Conta criada, mas o projeto está exigindo confirmação por e-mail. ' +
        'Desligue "Confirm email" em Authentication → Sign In / Providers → Email, no painel do Supabase.',
    );
  }
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

/* ------------------------------------------------------- acesso e carteira */

/** Situação de quem está logado perante a carteira. */
export type Situacao = 'liberado' | 'pending' | 'rejected';

export interface Acesso {
  /** Nulo enquanto o acesso não foi liberado. */
  walletId: string | null;
  situacao: Situacao;
}

function exigirCliente(): SupabaseClient {
  const supabase = getSupabase();
  if (!supabase) throw new Error('A sincronização não está configurada neste aplicativo.');
  return supabase;
}

/**
 * A única porta de entrada. Quem já é da carteira recebe o id dela; quem se
 * cadastrou e ainda não foi liberado recebe `pending` e nenhuma carteira.
 *
 * Antes isto criava uma carteira para qualquer pessoa autenticada, o que
 * deixava o projeto aberto para qualquer um que abrisse o endereço.
 */
export async function meuAcesso(): Promise<Acesso> {
  const { data, error } = await exigirCliente().rpc('meu_acesso');
  if (error) throw new Error(traduzirErro(error.message));

  // A função devolve uma tabela de uma linha só.
  const linha = (Array.isArray(data) ? data[0] : data) as
    | { wallet_id: string | null; situacao: Situacao }
    | undefined;
  if (!linha) throw new Error('O servidor não disse qual é a sua situação.');
  return { walletId: linha.wallet_id, situacao: linha.situacao };
}

export interface Pedido {
  userId: string;
  email: string;
  pedidoEm: string;
}

export async function pedidosPendentes(): Promise<Pedido[]> {
  const { data, error } = await exigirCliente().rpc('pedidos_pendentes');
  if (error) throw new Error(traduzirErro(error.message));
  return ((data ?? []) as { user_id: string; email: string; requested_at: string }[]).map((linha) => ({
    userId: linha.user_id,
    email: linha.email,
    pedidoEm: linha.requested_at,
  }));
}

export interface Membro {
  userId: string;
  email: string;
  dono: boolean;
  desde: string;
}

export async function membros(): Promise<Membro[]> {
  const { data, error } = await exigirCliente().rpc('membros');
  if (error) throw new Error(traduzirErro(error.message));
  return ((data ?? []) as { user_id: string; email: string; role: string; created_at: string }[]).map((linha) => ({
    userId: linha.user_id,
    email: linha.email,
    dono: linha.role === 'owner',
    desde: linha.created_at,
  }));
}

async function chamar(funcao: string, quem: string): Promise<void> {
  const { error } = await exigirCliente().rpc(funcao, { quem });
  if (error) throw new Error(traduzirErro(error.message));
}

export const aprovarPedido = (userId: string) => chamar('aprovar_pedido', userId);
export const recusarPedido = (userId: string) => chamar('recusar_pedido', userId);
export const removerMembro = (userId: string) => chamar('remover_membro', userId);

/** Só o dono vê a fila e libera gente; a tela esconde o que ele não pode usar. */
export async function souDono(): Promise<boolean> {
  const { data, error } = await exigirCliente().rpc('is_owner');
  if (error) return false;
  return data === true;
}

/**
 * Mensagens do servidor chegam em inglês e técnicas demais. Cada tradução
 * aqui existe porque a mensagem original deixaria o usuário sem saber o que
 * fazer a seguir.
 */
export function traduzirErro(mensagem: string): string {
  const m = mensagem.toLowerCase();
  if (m.includes('convite') || m.includes('Desligue')) return mensagem; // as nossas já vêm em português

  if (m.includes('invalid login credentials')) return 'E-mail ou senha incorretos.';
  if (m.includes('already registered') || m.includes('already been registered')) {
    return 'Já existe uma conta com este e-mail. Use "Entrar".';
  }
  if (m.includes('password should be at least')) {
    return `A senha precisa ter pelo menos ${SENHA_MINIMA} caracteres.`;
  }
  if (m.includes('email not confirmed')) {
    return 'Este projeto está exigindo confirmação por e-mail. Desligue "Confirm email" em Authentication → Sign In / Providers → Email, no painel do Supabase.';
  }
  if (m.includes('signups not allowed') || m.includes('signup is disabled')) {
    return 'O projeto está com novos cadastros desativados. Ligue "Allow new users to sign up" no painel do Supabase.';
  }
  if (m.includes('rate limit') || m.includes('too many')) {
    return 'Muitas tentativas seguidas. Espere um minuto e tente de novo.';
  }
  // As mensagens das funções de aprovação já vêm em português e explicam a
  // regra; repassar direto é melhor do que traduzir para algo mais vago.
  if (m.includes('só o dono') || m.includes('autenticado')) return mensagem;
  if (m.includes('invalid') && m.includes('email')) return 'E-mail inválido.';
  if (m.includes('failed to fetch') || m.includes('networkerror')) {
    return 'Sem conexão com o servidor.';
  }
  // Uma extensão que falta é diferente de um schema que falta: a mensagem
  // genérica mandaria rodar de novo um SQL que já rodou.
  if (m.includes('gen_random_bytes')) {
    return 'O banco está sem a extensão pgcrypto. Rode o supabase/schema.sql atualizado, que não depende mais dela.';
  }
  // Só as nossas tabelas e funções indicam schema faltando. Um "does not
  // exist" solto pode ser qualquer dependência interna do banco, e traduzir
  // tudo igual esconde a causa real em vez de ajudar.
  if (
    m.includes('schema cache') ||
    /relation .*(wallets|wallet_members|access_requests|records).* does not exist/.test(m) ||
    /function .*(meu_acesso|pedidos_pendentes|aprovar_pedido|recusar_pedido|remover_membro|membros|my_wallet|is_wallet_member|is_owner).* does not exist/.test(m)
  ) {
    return 'O banco ainda não tem a estrutura: rode o supabase/schema.sql no SQL Editor.';
  }
  return mensagem;
}
