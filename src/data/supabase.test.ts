/**
 * As mensagens de erro do login.
 *
 * Cada uma existe porque a mensagem original do servidor deixaria o usuário
 * travado sem saber o que fazer — e as duas mais importantes apontam para uma
 * configuração do painel do Supabase que só quem sabe onde procurar acha.
 */

import { describe, expect, it } from 'vitest';
import { SENHA_MINIMA, normalizeUrl, traduzirErro } from './supabase.ts';

describe('traduzirErro', () => {
  it('explica senha ou e-mail errados sem jargão', () => {
    expect(traduzirErro('Invalid login credentials')).toBe('E-mail ou senha incorretos.');
  });

  it('manda usar Entrar quando a conta já existe', () => {
    expect(traduzirErro('User already registered')).toContain('Já existe uma conta');
  });

  it('diz o tamanho mínimo da senha em português', () => {
    const t = traduzirErro('Password should be at least 6 characters');
    expect(t).toContain(String(SENHA_MINIMA));
    expect(t).not.toContain('Password');
  });

  it('aponta a configuração exata quando o projeto exige confirmação por e-mail', () => {
    // Sem isto o usuário fica preso: o cadastro "funciona" e o login não.
    const t = traduzirErro('Email not confirmed');
    expect(t).toContain('Confirm email');
    expect(t).toContain('Authentication');
  });

  it('aponta a configuração quando o cadastro está desativado', () => {
    expect(traduzirErro('Signups not allowed for this instance')).toContain('novos cadastros');
  });

  it('avisa que falta rodar o schema quando uma tabela nossa não existe', () => {
    expect(traduzirErro('relation "public.records" does not exist')).toContain('schema.sql');
    expect(traduzirErro('Could not find the function public.create_invite in the schema cache'))
      .toContain('schema.sql');
  });

  it('não confunde dependência faltando com schema faltando', () => {
    // Este erro já mandou o usuário rodar de novo um SQL que ele acabara de
    // rodar com sucesso: a função existia, faltava a extensão que ela usava.
    const t = traduzirErro('function gen_random_bytes(integer) does not exist');
    expect(t).toContain('pgcrypto');
    expect(t).not.toContain('ainda não tem a estrutura');
  });

  it('não engole um "does not exist" que não é nosso', () => {
    const original = 'column "alguma_coisa" does not exist';
    expect(traduzirErro(original)).toBe(original);
  });

  it('distingue falta de conexão de erro do servidor', () => {
    expect(traduzirErro('Failed to fetch')).toBe('Sem conexão com o servidor.');
  });

  it('preserva as mensagens que já escrevemos em português', () => {
    expect(traduzirErro('Convite não encontrado.')).toBe('Convite não encontrado.');
  });

  it('devolve o original quando não conhece o erro, em vez de engolir', () => {
    expect(traduzirErro('algo bem específico do servidor')).toBe('algo bem específico do servidor');
  });
});

describe('normalizeUrl', () => {
  it('aceita a URL que o painel mostra, com o caminho da API', () => {
    expect(normalizeUrl('https://abc.supabase.co/rest/v1/')).toBe('https://abc.supabase.co');
    expect(normalizeUrl('https://abc.supabase.co/auth/v1')).toBe('https://abc.supabase.co');
  });

  it('aceita a URL base, com ou sem barra e com espaços', () => {
    expect(normalizeUrl('  https://abc.supabase.co/  ')).toBe('https://abc.supabase.co');
  });
});
