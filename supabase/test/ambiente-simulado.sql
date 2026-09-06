-- Imita o essencial do ambiente do Supabase num Postgres comum, para que o
-- supabase/schema.sql de verdade possa ser exercitado aqui.
--
-- De propósito NÃO instala pgcrypto: é exatamente o ambiente em que o convite
-- falhava, e é o que torna este teste capaz de pegar o defeito.

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null
);

-- No Supabase, auth.uid() lê o usuário do JWT da requisição. Aqui lê a mesma
-- variável de sessão que ele usa, então dá para "trocar de usuário".
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

-- Os dois papéis que o Supabase expõe pela API. `authenticated` é quem está
-- logado; `anon` é qualquer visitante com a chave pública.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end
$$;

grant usage on schema public to anon, authenticated;
grant usage on schema auth to anon, authenticated;
grant select on auth.users to anon, authenticated;

-- Espelha o que o Supabase deixa configurado: tabelas novas no schema public
-- já nascem acessíveis pelos dois papéis, e a RLS é que decide o que cada um vê.
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
