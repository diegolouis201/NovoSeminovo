#!/bin/sh
# Cria as chaves secretas do NovoSeminovo no servidor, na pasta secrets/
# (que nunca vai para o GitHub). Rodar UMA vez, dentro de ~/NovoSeminovo:
#   sh scripts/criar-segredos.sh          -> cria só o que estiver faltando
#   sh scripts/criar-segredos.sh --trocar -> gera chaves NOVAS (todo mundo
#                                             precisa entrar de novo no site)
set -eu
cd "$(dirname "$0")/.."
umask 077
mkdir -p secrets
chmod 700 secrets

for nome in jwt_secret auth_secret; do
  arquivo="secrets/$nome"
  if [ -s "$arquivo" ] && [ "${1:-}" != "--trocar" ]; then
    echo "OK  $arquivo já existe (mantido)"
    continue
  fi
  # 48 bytes aleatórios do sistema = 64 caracteres. Ninguém adivinha.
  openssl rand -base64 48 | tr -d '\n' > "$arquivo"
  chmod 600 "$arquivo"
  echo "NOVO $arquivo criado"
done
ls -l secrets
