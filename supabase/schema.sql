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
--
-- Quem se cadastra NÃO entra: fica pendente até o dono liberar. Isso é
-- garantido aqui, e não na tela — sem virar membro, a RLS não devolve nem
-- aceita um único registro, mesmo para quem chame a API direto.

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

-- `owner` é quem libera cadastros novos. Coluna adicionada depois, daí o
-- `if not exists` — a carteira que já existia precisa continuar valendo.
alter table public.wallet_members
  add column if not exists role text not null default 'member';

-- Quem criou a carteira é o dono. Sem este preenchimento, a carteira que já
-- existe ficaria sem dono e ninguém poderia aprovar ninguém.
update public.wallet_members m
  set role = 'owner'
  where role <> 'owner'
    and created_at = (
      select min(created_at) from public.wallet_members outros
      where outros.wallet_id = m.wallet_id
    );

-- Quem se cadastrou e ainda não foi liberado.
create table if not exists public.access_requests (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  requested_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  decided_at timestamptz,
  decided_by uuid references auth.users (id)
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

-- O convite por código foi substituído pela aprovação do dono: eram dois
-- caminhos para a mesma coisa, e um a menos é um a menos para dar errado.
drop function if exists public.create_invite(uuid);
drop function if exists public.accept_invite(text);
drop table if exists public.wallet_invites;

-- ------------------------------------------------------------- permissões

alter table public.wallets enable row level security;
alter table public.wallet_members enable row level security;
alter table public.access_requests enable row level security;
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

create or replace function public.is_owner()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.wallet_members
    where user_id = auth.uid() and role = 'owner'
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

-- Sair da carteira é permitido; tirar outra pessoa, não (isso é do dono, e
-- passa por remover_membro).
drop policy if exists members_delete_self on public.wallet_members;
create policy members_delete_self on public.wallet_members
  for delete using (user_id = auth.uid() and role <> 'owner');

-- `access_requests` fica sem policy nenhuma de propósito: com a RLS ligada,
-- isso nega tudo. Todo acesso passa pelas funções abaixo, que conferem quem
-- está pedindo — assim ninguém se aprova sozinho editando a tabela.

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

-- ------------------------------------------------------- entrar e liberar

-- A única porta de entrada do aplicativo. Devolve a carteira de quem chamou
-- e a situação dele, criando o pedido de acesso quando for o caso.
--
-- Não existe função pública de criar carteira: a primeira nasce aqui, uma
-- única vez, para a primeira pessoa que chegar. Antes, qualquer cadastrado
-- ganhava uma carteira própria e saía usando o projeto à vontade.
create or replace function public.meu_acesso()
returns table (wallet_id uuid, situacao text)
language plpgsql
security definer
set search_path = public
as $$
declare
  quem uuid := auth.uid();
  minha uuid;
  nova uuid;
  pedido public.access_requests%rowtype;
begin
  if quem is null then
    raise exception 'É preciso estar autenticado.';
  end if;

  select m.wallet_id into minha
    from public.wallet_members m
    where m.user_id = quem
    order by m.created_at
    limit 1;

  if minha is not null then
    return query select minha, 'liberado'::text;
    return;
  end if;

  -- Ninguém ainda: quem chega primeiro é o dono. Depois desta vez, a única
  -- forma de entrar é ser aprovado.
  if not exists (select 1 from public.wallets) then
    insert into public.wallets (name) values ('Nossa carteira') returning id into nova;
    insert into public.wallet_members (wallet_id, user_id, role) values (nova, quem, 'owner');
    return query select nova, 'liberado'::text;
    return;
  end if;

  select * into pedido from public.access_requests where user_id = quem;
  if not found then
    insert into public.access_requests (user_id, email)
      values (quem, coalesce((select u.email from auth.users u where u.id = quem), ''))
      returning * into pedido;
  end if;

  return query select null::uuid, pedido.status;
end;
$$;

-- Quem está esperando. Só o dono enxerga.
create or replace function public.pedidos_pendentes()
returns table (user_id uuid, email text, requested_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_owner() then
    raise exception 'Só o dono da carteira pode ver os pedidos de acesso.';
  end if;
  return query
    select r.user_id, r.email, r.requested_at
    from public.access_requests r
    where r.status = 'pending'
    order by r.requested_at;
end;
$$;

create or replace function public.aprovar_pedido(quem uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  carteira uuid;
begin
  if not public.is_owner() then
    raise exception 'Só o dono da carteira pode liberar o acesso.';
  end if;

  select m.wallet_id into carteira
    from public.wallet_members m
    where m.user_id = auth.uid() and m.role = 'owner'
    limit 1;

  insert into public.wallet_members (wallet_id, user_id, role)
    values (carteira, quem, 'member')
    on conflict do nothing;

  update public.access_requests
    set status = 'approved', decided_at = now(), decided_by = auth.uid()
    where user_id = quem;
end;
$$;

create or replace function public.recusar_pedido(quem uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_owner() then
    raise exception 'Só o dono da carteira pode recusar um pedido.';
  end if;
  update public.access_requests
    set status = 'rejected', decided_at = now(), decided_by = auth.uid()
    where user_id = quem;
end;
$$;

-- Tirar alguém depois de ter liberado. O acesso precisa poder ser desfeito,
-- senão aprovar é uma decisão sem volta.
create or replace function public.remover_membro(quem uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_owner() then
    raise exception 'Só o dono da carteira pode remover alguém.';
  end if;
  if quem = auth.uid() then
    raise exception 'O dono não pode remover a si mesmo.';
  end if;

  delete from public.wallet_members where user_id = quem and role <> 'owner';
  update public.access_requests
    set status = 'rejected', decided_at = now(), decided_by = auth.uid()
    where user_id = quem;
end;
$$;

-- Quem está na carteira hoje, para a tela de Ajustes.
create or replace function public.membros()
returns table (user_id uuid, email text, role text, created_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_owner() then
    raise exception 'Só o dono da carteira pode ver os membros.';
  end if;
  return query
    select m.user_id, coalesce(u.email, '')::text, m.role, m.created_at
    from public.wallet_members m
    left join auth.users u on u.id = m.user_id
    where m.wallet_id in (
      select w.wallet_id from public.wallet_members w
      where w.user_id = auth.uid()
    )
    order by m.created_at;
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

-- Criar carteira deixou de ser público: a primeira nasce dentro de
-- meu_acesso() e não deve haver uma segunda.
drop function if exists public.create_wallet(text);
