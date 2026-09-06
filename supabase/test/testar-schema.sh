#!/bin/bash
# Exercita o supabase/schema.sql num Postgres de verdade, sem pgcrypto,
# como dois usuários diferentes e um estranho.
#
# Uso: testar-schema.sh <arquivo-schema.sql>
set -uo pipefail

SCHEMA="${1:?informe o caminho do schema.sql}"
SCRATCH="$(dirname "$0")"
PSQL="psql -h /tmp -p 55432 -U postgres -d supatest -v ON_ERROR_STOP=1 -qtA"

falhas=0
ok()   { echo "✅ $1"; }
falha() { echo "❌ $1"; echo "   $2"; falhas=$((falhas+1)); }

# banco limpo a cada execução
psql -h /tmp -p 55432 -U postgres -qc "drop database if exists supatest;" >/dev/null 2>&1
psql -h /tmp -p 55432 -U postgres -qc "create database supatest;" >/dev/null 2>&1

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

# ---- dois usuários e um estranho
A=$($PSQL -c "insert into auth.users (email) values ('a@teste.com') returning id;")
B=$($PSQL -c "insert into auth.users (email) values ('b@teste.com') returning id;")
C=$($PSQL -c "insert into auth.users (email) values ('c@teste.com') returning id;")

# executa um SQL como um usuário logado (papel authenticated + uid do JWT)
como() {
  local uid="$1"; shift
  $PSQL -c "set role authenticated; set request.jwt.claim.sub = '$uid'; $*"
}

# ---- A cria a carteira
if CARTEIRA=$(como "$A" "select public.create_wallet('Nossa carteira');" 2>&1) && [ -n "$CARTEIRA" ]; then
  ok "A criou a carteira ($CARTEIRA)"
else
  falha "A não conseguiu criar a carteira" "$CARTEIRA"; exit 1
fi

if [ "$(como "$A" "select public.my_wallet();" 2>&1)" = "$CARTEIRA" ]; then
  ok "my_wallet() devolve a carteira de A"
else
  falha "my_wallet() não achou a carteira de A" ""
fi

# ---- o convite: é aqui que falhava
if CODIGO=$(como "$A" "select public.create_invite('$CARTEIRA');" 2>&1) && [[ "$CODIGO" =~ ^[0-9A-F]{8}$ ]]; then
  ok "A gerou o código de convite ($CODIGO)"
else
  falha "create_invite falhou" "$CODIGO"
fi

# ---- A grava um lançamento
if out=$(como "$A" "insert into public.records (wallet_id, table_name, record_id, payload, updated_at)
                    values ('$CARTEIRA','entries','e1','{\"id\":\"e1\",\"amount\":1000}'::jsonb, now());" 2>&1); then
  ok "A gravou um lançamento"
else
  falha "A não gravou o lançamento" "$out"
fi

# ---- B ainda não é membro: não pode ver nada
if [ "$(como "$B" "select count(*) from public.records;" 2>&1)" = "0" ]; then
  ok "B, fora da carteira, não vê os lançamentos de A"
else
  falha "VAZAMENTO: B viu lançamentos sem ser membro" ""
fi

# ---- B aceita o convite
if [ -n "${CODIGO:-}" ]; then
  if out=$(como "$B" "select public.accept_invite('$CODIGO');" 2>&1) && [ "$out" = "$CARTEIRA" ]; then
    ok "B entrou na carteira pelo convite"
  else
    falha "accept_invite falhou para B" "$out"
  fi

  if [ "$(como "$B" "select count(*) from public.records;" 2>&1)" = "1" ]; then
    ok "B agora enxerga o lançamento de A"
  else
    falha "B entrou mas não vê os lançamentos" ""
  fi

  # o mesmo convite não pode servir duas vezes
  if como "$C" "select public.accept_invite('$CODIGO');" >/dev/null 2>&1; then
    falha "o convite foi aceito duas vezes" ""
  else
    ok "o convite não funciona uma segunda vez"
  fi
fi

# ---- B grava e A enxerga
if out=$(como "$B" "insert into public.records (wallet_id, table_name, record_id, payload, updated_at)
                    values ('$CARTEIRA','entries','e2','{\"id\":\"e2\"}'::jsonb, now());" 2>&1); then
  ok "B gravou na carteira compartilhada"
else
  falha "B não conseguiu gravar" "$out"
fi
if [ "$(como "$A" "select count(*) from public.records;" 2>&1)" = "2" ]; then
  ok "A enxerga o que B lançou"
else
  falha "A não viu o lançamento de B" ""
fi

# ---- C, estranho: não vê e não grava
if [ "$(como "$C" "select count(*) from public.records;" 2>&1)" = "0" ]; then
  ok "C, que não é da carteira, não vê nada"
else
  falha "VAZAMENTO: C viu os lançamentos" ""
fi
if como "$C" "insert into public.records (wallet_id, table_name, record_id, payload, updated_at)
              values ('$CARTEIRA','entries','invasor','{}'::jsonb, now());" >/dev/null 2>&1; then
  falha "VAZAMENTO: C gravou na carteira dos outros" ""
else
  ok "C não consegue gravar na carteira dos outros"
fi

# ---- visitante sem login (a chave pública sozinha)
semlogin() { $PSQL -c "set role anon; $*"; }
if [ "$(semlogin "select count(*) from public.records;" 2>&1)" = "0" ]; then
  ok "sem login, nenhum lançamento é visível"
else
  falha "VAZAMENTO: sem login dá para ler os lançamentos" ""
fi

# ---- o cursor da sincronização precisa avançar a cada gravação
seq1=$(como "$A" "select seq from public.records where record_id='e1';")
como "$A" "update public.records set payload='{\"id\":\"e1\",\"amount\":2000}'::jsonb, updated_at=now()
           where record_id='e1';" >/dev/null 2>&1
seq2=$(como "$A" "select seq from public.records where record_id='e1';")
if [ "$seq2" -gt "$seq1" ]; then
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
