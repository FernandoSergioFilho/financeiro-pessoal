-- Estrutura do banco no Supabase.
--
-- Cole este arquivo inteiro no SQL Editor do projeto e execute. Pode rodar
-- mais de uma vez sem estragar nada.
--
-- LEIA ISTO ANTES: a chave usada pelo aplicativo (`anon`) fica dentro do
-- JavaScript que qualquer pessoa pode abrir. Isso é normal e esperado, mas
-- significa que as políticas de acesso (RLS) deste arquivo são a ÚNICA
-- barreira entre a sua carteira e o resto do mundo. Toda leitura e toda
-- escrita passam por "sou membro desta carteira".

-- ---------------------------------------------------------------- tabelas

create table if not exists public.wallets (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Nossa carteira',
  created_at timestamptz not null default now()
);

create table if not exists public.wallet_members (
  wallet_id uuid not null references public.wallets (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (wallet_id, user_id)
);

create table if not exists public.wallet_invites (
  code text primary key,
  wallet_id uuid not null references public.wallets (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz
);

-- Uma tabela genérica em vez de cinco espelhando o domínio: o aplicativo
-- nunca consulta o servidor por dados, só pergunta "o que mudou desde X".
-- Espelhar as tabelas exigiria uma migração de banco a cada campo novo, sem
-- nenhum ganho em troca.
create table if not exists public.records (
  wallet_id uuid not null references public.wallets (id) on delete cascade,
  table_name text not null check (
    table_name in ('accounts', 'categories', 'entries', 'recurring', 'purchases')
  ),
  record_id text not null,
  payload jsonb,
  -- Carimbo do cliente: decide quem vence quando os dois editam o mesmo registro.
  updated_at timestamptz not null,
  -- Preenchido quando o registro foi apagado (é a marca de exclusão).
  deleted_at timestamptz,
  -- Ordem de chegada ao servidor: é o cursor da sincronização. Vem daqui, e
  -- não do relógio do cliente, senão dois aparelhos com horários levemente
  -- diferentes perderiam alterações.
  seq bigint not null,
  primary key (wallet_id, table_name, record_id)
);

create sequence if not exists public.records_seq;

create index if not exists records_wallet_seq_idx on public.records (wallet_id, seq);

-- Cada gravação recebe o próximo número da fila, inclusive nas atualizações.
create or replace function public.stamp_record_seq()
returns trigger
language plpgsql
as $$
begin
  new.seq := nextval('public.records_seq');
  return new;
end;
$$;

drop trigger if exists records_stamp_seq on public.records;
create trigger records_stamp_seq
  before insert or update on public.records
  for each row execute function public.stamp_record_seq();

-- ------------------------------------------------------------- permissões

alter table public.wallets enable row level security;
alter table public.wallet_members enable row level security;
alter table public.wallet_invites enable row level security;
alter table public.records enable row level security;

-- `security definer` de propósito: uma política em wallet_members que
-- consultasse wallet_members entraria em recursão infinita.
create or replace function public.is_wallet_member(w uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.wallet_members
    where wallet_id = w and user_id = auth.uid()
  );
$$;

drop policy if exists wallets_select on public.wallets;
create policy wallets_select on public.wallets
  for select using (public.is_wallet_member(id));

drop policy if exists wallets_update on public.wallets;
create policy wallets_update on public.wallets
  for update using (public.is_wallet_member(id));

drop policy if exists members_select on public.wallet_members;
create policy members_select on public.wallet_members
  for select using (public.is_wallet_member(wallet_id));

-- Sair da carteira é permitido; tirar outra pessoa, não.
drop policy if exists members_delete_self on public.wallet_members;
create policy members_delete_self on public.wallet_members
  for delete using (user_id = auth.uid());

drop policy if exists invites_select on public.wallet_invites;
create policy invites_select on public.wallet_invites
  for select using (public.is_wallet_member(wallet_id));

drop policy if exists invites_insert on public.wallet_invites;
create policy invites_insert on public.wallet_invites
  for insert with check (
    public.is_wallet_member(wallet_id) and created_by = auth.uid()
  );

-- O coração: os lançamentos só existem para quem é da carteira.
drop policy if exists records_select on public.records;
create policy records_select on public.records
  for select using (public.is_wallet_member(wallet_id));

drop policy if exists records_insert on public.records;
create policy records_insert on public.records
  for insert with check (public.is_wallet_member(wallet_id));

drop policy if exists records_update on public.records;
create policy records_update on public.records
  for update using (public.is_wallet_member(wallet_id))
  with check (public.is_wallet_member(wallet_id));

-- Não há política de DELETE em `records`: apagar é gravar a marca de
-- exclusão (deleted_at), que precisa continuar visível para os outros
-- aparelhos saberem que o registro morreu.

-- ---------------------------------------------------- criar e entrar

-- Cria a carteira e já coloca quem chamou como membro, numa operação só.
-- Sem isso haveria um instante em que a carteira existe sem dono.
create or replace function public.create_wallet(wallet_name text default 'Nossa carteira')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  nova uuid;
begin
  if auth.uid() is null then
    raise exception 'É preciso estar autenticado.';
  end if;

  insert into public.wallets (name) values (wallet_name) returning id into nova;
  insert into public.wallet_members (wallet_id, user_id) values (nova, auth.uid());
  return nova;
end;
$$;

-- Gera um código de convite com validade curta.
create or replace function public.create_invite(w uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  novo_codigo text;
begin
  if not public.is_wallet_member(w) then
    raise exception 'Só quem é da carteira pode convidar.';
  end if;

  novo_codigo := upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8));
  insert into public.wallet_invites (code, wallet_id, created_by, expires_at)
    values (novo_codigo, w, auth.uid(), now() + interval '7 days');
  return novo_codigo;
end;
$$;

-- Aceitar o convite é o único caminho para virar membro de uma carteira.
create or replace function public.accept_invite(invite_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  convite public.wallet_invites%rowtype;
begin
  if auth.uid() is null then
    raise exception 'É preciso estar autenticado.';
  end if;

  select * into convite from public.wallet_invites
    where code = upper(invite_code) for update;

  if not found then
    raise exception 'Convite não encontrado.';
  end if;
  if convite.used_at is not null then
    raise exception 'Este convite já foi usado.';
  end if;
  if convite.expires_at < now() then
    raise exception 'Este convite expirou.';
  end if;

  insert into public.wallet_members (wallet_id, user_id)
    values (convite.wallet_id, auth.uid())
    on conflict do nothing;

  update public.wallet_invites set used_at = now() where code = convite.code;
  return convite.wallet_id;
end;
$$;

-- A carteira de quem está pedindo (a primeira, se houver mais de uma).
create or replace function public.my_wallet()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select wallet_id from public.wallet_members
  where user_id = auth.uid()
  order by created_at
  limit 1;
$$;
