-- OPCIONAL: avisar por e-mail quando alguém pedir acesso.
--
-- Nada aqui é necessário para o aplicativo funcionar. Sem este arquivo, os
-- pedidos continuam chegando na fila em Ajustes; você só precisa abrir o app
-- para vê-los. Isto aqui é para não precisar abrir.
--
-- ---------------------------------------------------------------------------
-- POR QUE PRECISA DE UM SERVIÇO DE FORA
-- ---------------------------------------------------------------------------
-- O e-mail que vem junto com o Supabase não serve para isto. Ele entrega
-- poucas mensagens por hora e **só para endereços da organização do projeto** —
-- as demais são descartadas sem erro nenhum. Foi exatamente isso que fez o
-- login por link nunca chegar, e é por isso que o login virou senha.
--
-- Então: qualquer aviso para um endereço de fora passa por um serviço de envio.
-- Abaixo está montado com o Resend, que tem plano grátis e é o de configuração
-- mais curta. Sem um domínio próprio verificado, o Resend só entrega no e-mail
-- da própria conta — o que serve perfeitamente aqui, desde que você crie a
-- conta do Resend com o MESMO endereço que quer avisar.
--
-- ---------------------------------------------------------------------------
-- PASSO A PASSO
-- ---------------------------------------------------------------------------
-- 1. Crie uma conta em resend.com usando o e-mail que quer ser avisado.
-- 2. Gere uma API key (Settings → API Keys).
-- 3. No Supabase: Database → Extensions → ligue `pg_net`.
-- 4. No SQL Editor, rode UMA VEZ, trocando os dois valores:
--
--      select vault.create_secret('re_sua_chave_aqui', 'resend_key');
--      select vault.create_secret('voce@exemplo.com',  'email_do_dono');
--
--    (Para trocar depois: `select vault.update_secret(id, novo_valor)`.)
-- 5. Rode este arquivo inteiro.
--
-- A chave fica no Vault, cifrada, e nunca sai para o navegador — diferente da
-- chave `anon`, que é pública por natureza. Uma chave de envio de e-mail no
-- meio do JavaScript deixaria qualquer um mandar e-mail no seu nome.
--
-- ---------------------------------------------------------------------------

create extension if not exists pg_net with schema extensions;

create or replace function public.avisar_pedido_de_acesso()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  chave text;
  destino text;
begin
  -- Se o Vault não estiver preenchido, não faz nada e não atrapalha: o pedido
  -- já foi gravado, e é ele que importa. Um aviso que falha nunca pode
  -- derrubar o cadastro de quem está pedindo acesso.
  begin
    select decrypted_secret into chave from vault.decrypted_secrets where name = 'resend_key';
    select decrypted_secret into destino from vault.decrypted_secrets where name = 'email_do_dono';
  exception when others then
    return new;
  end;

  if chave is null or destino is null then
    return new;
  end if;

  begin
    perform net.http_post(
      url := 'https://api.resend.com/emails',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || chave,
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object(
        'from', 'Financeiro <onboarding@resend.dev>',
        'to', jsonb_build_array(destino),
        'subject', 'Alguém pediu acesso à carteira',
        'text',
          new.email || ' criou uma conta e está esperando liberação.' || chr(10) || chr(10) ||
          'Abra o aplicativo, vá em Ajustes e escolha Liberar ou Recusar.' || chr(10) ||
          'Enquanto isso, essa pessoa não enxerga nenhum lançamento.'
      )
    );
  exception when others then
    -- Idem: e-mail é aviso, não é a barreira. A barreira é a RLS.
    return new;
  end;

  return new;
end;
$$;

drop trigger if exists avisa_pedido on public.access_requests;
create trigger avisa_pedido
  after insert on public.access_requests
  for each row execute function public.avisar_pedido_de_acesso();

-- Para desligar o aviso sem desfazer nada:
--   drop trigger if exists avisa_pedido on public.access_requests;
