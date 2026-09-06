#!/bin/bash
# Cola o schema novo por cima de um banco que já está no formato antigo —
# que é exatamente o que acontece com o projeto de verdade.
#
# Existe por causa de um risco específico: o dono precisa continuar sendo dono
# depois da migração. Se o preenchimento do papel falhasse, ninguém poderia
# aprovar mais ninguém e o acesso ficaria travado para sempre.
#
# Uso: testar-migracao.sh <schema-antigo.sql> <schema-novo.sql>
set -uo pipefail

ANTIGO="${1:?informe o schema antigo}"
NOVO="${2:?informe o schema novo}"
SCRATCH="$(dirname "$0")"
SOCK="${PGSOCK:-/tmp}"
P="psql -h $SOCK -p 55432 -U postgres -d migratest -qtA -v ON_ERROR_STOP=1"

falhas=0
ok()    { echo "✅ $1"; }
falha() { echo "❌ $1"; [ -n "${2:-}" ] && echo "   $2"; falhas=$((falhas+1)); }
igual() { [ "$2" = "$3" ] && ok "$1" || falha "$1" "esperava '$3', veio '$2'"; }

psql -h "$SOCK" -p 55432 -U postgres -qc "drop database if exists migratest;" >/dev/null 2>&1
psql -h "$SOCK" -p 55432 -U postgres -qc "create database migratest;" >/dev/null 2>&1
$P -f "$SCRATCH/ambiente-simulado.sql" >/dev/null 2>&1

# ---- o banco como está hoje: schema antigo, carteira criada, convite aceito
$P -f "$ANTIGO" >/dev/null 2>&1
A=$($P -c "insert into auth.users (email) values ('dono@t.com') returning id;")
B=$($P -c "insert into auth.users (email) values ('convidado@t.com') returning id;")
CART=$($P -c "set role authenticated; set request.jwt.claim.sub='$A'; select public.create_wallet('Nossa carteira');")
COD=$($P -c "set role authenticated; set request.jwt.claim.sub='$A'; select public.create_invite('$CART');")
$P -c "set role authenticated; set request.jwt.claim.sub='$B'; select public.accept_invite('$COD');" >/dev/null 2>&1
$P -c "set role authenticated; set request.jwt.claim.sub='$A';
       insert into public.records (wallet_id,table_name,record_id,payload,updated_at)
       values ('$CART','entries','antigo','{\"v\":1}'::jsonb,now());" >/dev/null 2>&1
ok "banco montado no formato antigo (2 membros, 1 lançamento)"

# ---- a migração
# `grep` sem acerto sai com 1 e, com `pipefail`, isso faria a migração boa
# parecer quebrada. Guardar a saída primeiro e só depois procurar o erro.
saida=$($P -f "$NOVO" 2>&1)
erro=$(printf '%s\n' "$saida" | grep -i 'ERROR' | head -3)
if [ -z "$erro" ]; then
  ok "o schema novo aplicou por cima do antigo"
else
  falha "a migração deu erro" "$erro"; exit 1
fi

# ---- nada se perdeu
igual "os dois membros continuam lá"    "$($P -c 'select count(*) from public.wallet_members;')" "2"
igual "o lançamento continua lá"        "$($P -c 'select count(*) from public.records;')"        "1"
igual "continua existindo uma carteira" "$($P -c 'select count(*) from public.wallets;')"        "1"

# ---- o essencial: quem criou virou dono, e só ele
igual "quem criou a carteira virou dono" \
  "$($P -c "set role authenticated; set request.jwt.claim.sub='$A'; select public.is_owner();")" "t"
igual "o convidado NÃO virou dono junto" \
  "$($P -c "set role authenticated; set request.jwt.claim.sub='$B'; select public.is_owner();")" "f"
igual "exatamente um dono na carteira" \
  "$($P -c "select count(*) from public.wallet_members where role='owner';")" "1"

# ---- os dois continuam trabalhando normalmente
igual "o dono segue liberado" \
  "$($P -c "set role authenticated; set request.jwt.claim.sub='$A'; select situacao from public.meu_acesso();")" "liberado"
igual "o convidado segue liberado" \
  "$($P -c "set role authenticated; set request.jwt.claim.sub='$B'; select situacao from public.meu_acesso();")" "liberado"
igual "o convidado continua enxergando os lançamentos" \
  "$($P -c "set role authenticated; set request.jwt.claim.sub='$B'; select count(*) from public.records;")" "1"

# ---- e a porta fechou para o resto
X=$($P -c "insert into auth.users (email) values ('estranho@x.com') returning id;")
igual "quem se cadastrar agora fica pendente" \
  "$($P -c "set role authenticated; set request.jwt.claim.sub='$X'; select coalesce(situacao,'?') from public.meu_acesso();")" "pending"
igual "e não ganha carteira própria" "$($P -c 'select count(*) from public.wallets;')" "1"

echo "──────────────────────────────────────────────"
[ "$falhas" -eq 0 ] && echo "MIGRAÇÃO SEGURA" || echo "$falhas FALHA(S)"
exit "$falhas"
