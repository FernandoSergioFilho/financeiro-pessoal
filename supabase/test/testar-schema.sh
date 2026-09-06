#!/bin/bash
# Exercita o supabase/schema.sql num Postgres de verdade, sem pgcrypto,
# como o dono, um aprovado, um pendente e um estranho.
#
# O que este arquivo prova, e por isso existe: quem se cadastra e não foi
# liberado não lê nem grava nada. Isso é uma regra do banco, não da tela —
# então tem que ser verificada no banco.
#
# Uso: testar-schema.sh <arquivo-schema.sql>
set -uo pipefail

SCHEMA="${1:?informe o caminho do schema.sql}"
SCRATCH="$(dirname "$0")"
SOCK="${PGSOCK:-/tmp}"
PSQL="psql -h $SOCK -p 55432 -U postgres -d supatest -v ON_ERROR_STOP=1 -qtA"

falhas=0
ok()   { echo "✅ $1"; }
falha() { echo "❌ $1"; [ -n "${2:-}" ] && echo "   $2"; falhas=$((falhas+1)); }

# banco limpo a cada execução
psql -h "$SOCK" -p 55432 -U postgres -qc "drop database if exists supatest;" >/dev/null 2>&1
psql -h "$SOCK" -p 55432 -U postgres -qc "create database supatest;" >/dev/null 2>&1

if out=$($PSQL -f "$SCRATCH/ambiente-simulado.sql" 2>&1); then
  ok "ambiente do Supabase simulado (sem pgcrypto, de propósito)"
else
  falha "não montou o ambiente" "$out"; exit 1
fi

# ---- o schema de verdade, como quem cola no SQL Editor
if out=$($PSQL -f "$SCHEMA" 2>&1); then
  ok "schema.sql aplicou sem erro"
else
  falha "schema.sql falhou ao aplicar" "$out"; exit 1
fi

# rodar duas vezes tem que ser inofensivo
if out=$($PSQL -f "$SCHEMA" 2>&1); then
  ok "schema.sql pode rodar de novo sem quebrar"
else
  falha "rodar o schema duas vezes quebra" "$out"
fi

# ---- o dono, um convidado, um curioso e um estranho
A=$($PSQL -c "insert into auth.users (email) values ('dono@teste.com') returning id;")
B=$($PSQL -c "insert into auth.users (email) values ('convidado@teste.com') returning id;")
C=$($PSQL -c "insert into auth.users (email) values ('curioso@teste.com') returning id;")
D=$($PSQL -c "insert into auth.users (email) values ('estranho@teste.com') returning id;")

# executa um SQL como um usuário logado (papel authenticated + uid do JWT)
como() {
  local uid="$1"; shift
  $PSQL -c "set role authenticated; set request.jwt.claim.sub = '$uid'; $*"
}

# ---- A chega primeiro e vira dono
if CARTEIRA=$(como "$A" "select wallet_id from public.meu_acesso();" 2>&1) && [ -n "$CARTEIRA" ]; then
  ok "o primeiro a entrar ganha a carteira ($CARTEIRA)"
else
  falha "meu_acesso() não criou a carteira do primeiro" "$CARTEIRA"; exit 1
fi

if [ "$(como "$A" "select situacao from public.meu_acesso();" 2>&1)" = "liberado" ]; then
  ok "o dono aparece como liberado"
else
  falha "o dono não ficou liberado" ""
fi

if [ "$(como "$A" "select public.is_owner();" 2>&1)" = "t" ]; then
  ok "quem criou a carteira é o dono"
else
  falha "o criador da carteira não virou dono" ""
fi

# ---- A grava um lançamento
if out=$(como "$A" "insert into public.records (wallet_id, table_name, record_id, payload, updated_at)
                    values ('$CARTEIRA','entries','e1','{\"id\":\"e1\",\"amount\":1000}'::jsonb, now());" 2>&1); then
  ok "o dono gravou um lançamento"
else
  falha "o dono não gravou o lançamento" "$out"
fi

# ---- B se cadastra: NÃO pode ganhar carteira própria nem ver nada
SIT_B=$(como "$B" "select coalesce(situacao,'?') from public.meu_acesso();" 2>&1)
if [ "$SIT_B" = "pending" ]; then
  ok "quem se cadastra depois fica pendente"
else
  falha "o segundo cadastro não ficou pendente (veio '$SIT_B')" ""
fi

if [ "$(como "$B" "select count(*) from public.wallets;" 2>&1)" = "0" ]; then
  ok "o pendente não ganhou carteira própria"
else
  falha "VAZAMENTO: o pendente tem uma carteira" ""
fi

if [ "$(como "$B" "select count(*) from public.records;" 2>&1)" = "0" ]; then
  ok "o pendente não lê nenhum lançamento"
else
  falha "VAZAMENTO: o pendente leu lançamentos" ""
fi

if como "$B" "insert into public.records (wallet_id, table_name, record_id, payload, updated_at)
              values ('$CARTEIRA','entries','invasor','{}'::jsonb, now());" >/dev/null 2>&1; then
  falha "VAZAMENTO: o pendente gravou na carteira do dono" ""
else
  ok "o pendente não consegue gravar"
fi

# ---- o pendente não pode se aprovar sozinho
if como "$B" "select public.aprovar_pedido('$B');" >/dev/null 2>&1; then
  falha "VAZAMENTO: o pendente se aprovou sozinho" ""
else
  ok "o pendente não consegue se aprovar"
fi

if como "$B" "update public.access_requests set status='approved' where user_id='$B';" >/dev/null 2>&1 \
   && [ "$(como "$B" "select count(*) from public.records;" 2>&1)" != "0" ]; then
  falha "VAZAMENTO: o pendente entrou editando access_requests" ""
else
  ok "o pendente não consegue editar a própria situação na tabela"
fi

if como "$B" "select public.pedidos_pendentes();" >/dev/null 2>&1; then
  falha "VAZAMENTO: quem não é dono viu a fila de pedidos" ""
else
  ok "só o dono enxerga a fila de pedidos"
fi

# ---- o dono vê o pedido e aprova
if [ "$(como "$A" "select count(*) from public.pedidos_pendentes();" 2>&1)" = "1" ]; then
  ok "o pedido do cadastrado aparece para o dono"
else
  falha "o dono não viu o pedido pendente" ""
fi

if out=$(como "$A" "select public.aprovar_pedido('$B');" 2>&1); then
  ok "o dono aprovou o pedido"
else
  falha "aprovar_pedido falhou" "$out"
fi

if [ "$(como "$B" "select situacao from public.meu_acesso();" 2>&1)" = "liberado" ]; then
  ok "o aprovado passa a estar liberado"
else
  falha "o aprovado continua sem acesso" ""
fi

if [ "$(como "$B" "select count(*) from public.records;" 2>&1)" = "1" ]; then
  ok "o aprovado enxerga os lançamentos do dono"
else
  falha "o aprovado entrou mas não vê os lançamentos" ""
fi

if out=$(como "$B" "insert into public.records (wallet_id, table_name, record_id, payload, updated_at)
                    values ('$CARTEIRA','entries','e2','{\"id\":\"e2\"}'::jsonb, now());" 2>&1); then
  ok "o aprovado grava na carteira compartilhada"
else
  falha "o aprovado não conseguiu gravar" "$out"
fi
if [ "$(como "$A" "select count(*) from public.records;" 2>&1)" = "2" ]; then
  ok "o dono enxerga o que o aprovado lançou"
else
  falha "o dono não viu o lançamento do aprovado" ""
fi

# ---- o aprovado não vira dono junto
if [ "$(como "$B" "select public.is_owner();" 2>&1)" = "f" ]; then
  ok "aprovar não transforma o convidado em dono"
else
  falha "VAZAMENTO: o aprovado virou dono e pode liberar outros" ""
fi

# ---- C é recusado e continua fora
como "$C" "select public.meu_acesso();" >/dev/null 2>&1
if out=$(como "$A" "select public.recusar_pedido('$C');" 2>&1); then
  ok "o dono recusou um pedido"
else
  falha "recusar_pedido falhou" "$out"
fi
if [ "$(como "$C" "select situacao from public.meu_acesso();" 2>&1)" = "rejected" ]; then
  ok "o recusado continua sabendo que foi recusado"
else
  falha "a situação do recusado não ficou 'rejected'" ""
fi
if [ "$(como "$C" "select count(*) from public.records;" 2>&1)" = "0" ]; then
  ok "o recusado não vê nada"
else
  falha "VAZAMENTO: o recusado viu lançamentos" ""
fi
if [ "$(como "$A" "select count(*) from public.pedidos_pendentes();" 2>&1)" = "0" ]; then
  ok "o recusado sai da fila de pendentes"
else
  falha "o recusado continua na fila" ""
fi

# ---- D, que nunca pediu nada
if [ "$(como "$D" "select count(*) from public.records;" 2>&1)" = "0" ]; then
  ok "quem nunca pediu acesso não vê nada"
else
  falha "VAZAMENTO: um estranho viu os lançamentos" ""
fi

# ---- visitante sem login (a chave pública sozinha)
semlogin() { $PSQL -c "set role anon; $*"; }
if [ "$(semlogin "select count(*) from public.records;" 2>&1)" = "0" ]; then
  ok "sem login, nenhum lançamento é visível"
else
  falha "VAZAMENTO: sem login dá para ler os lançamentos" ""
fi

# ---- tirar o acesso de quem já entrou
if out=$(como "$A" "select public.remover_membro('$B');" 2>&1); then
  ok "o dono removeu um membro"
else
  falha "remover_membro falhou" "$out"
fi
if [ "$(como "$B" "select count(*) from public.records;" 2>&1)" = "0" ]; then
  ok "o removido perde o acesso na hora"
else
  falha "VAZAMENTO: o removido continua enxergando tudo" ""
fi
if como "$A" "select public.remover_membro('$A');" >/dev/null 2>&1; then
  falha "o dono conseguiu remover a si mesmo e a carteira ficou sem dono" ""
else
  ok "o dono não pode remover a si mesmo"
fi

# ---- o convite por código não existe mais
if $PSQL -c "select 'public.create_invite'::regproc;" >/dev/null 2>&1; then
  falha "create_invite ainda existe: sobrou um segundo caminho de entrada" ""
else
  ok "o convite por código foi removido do banco"
fi
if $PSQL -c "select 'public.create_wallet'::regproc;" >/dev/null 2>&1; then
  falha "create_wallet ainda é pública: qualquer cadastrado cria carteira" ""
else
  ok "criar carteira deixou de ser público"
fi

# ---- o cursor da sincronização precisa avançar a cada gravação
seq1=$(como "$A" "select seq from public.records where record_id='e1';")
como "$A" "update public.records set payload='{\"id\":\"e1\",\"amount\":2000}'::jsonb, updated_at=now()
           where record_id='e1';" >/dev/null 2>&1
seq2=$(como "$A" "select seq from public.records where record_id='e1';")
if [ "${seq2:-0}" -gt "${seq1:-0}" ]; then
  ok "editar um registro avança o cursor ($seq1 → $seq2)"
else
  falha "o cursor não avançou ao editar: o outro aparelho não receberia a mudança" "$seq1 → $seq2"
fi

echo "──────────────────────────────────────────────"
if [ "$falhas" -eq 0 ]; then
  echo "TUDO PASSOU"
else
  echo "$falhas FALHA(S)"
fi
exit "$falhas"
