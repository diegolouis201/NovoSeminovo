#!/bin/sh
# Cria as chaves secretas do NovoSeminovo no servidor, na pasta secrets/
# (que nunca vai para o GitHub). Rodar dentro de ~/NovoSeminovo:
#   sh scripts/criar-segredos.sh          -> cria só o que estiver faltando
#   sh scripts/criar-segredos.sh --trocar -> gera NOVAS jwt_secret e auth_secret
#                                             e as chaves dos CRMs (todo mundo precisa
#                                             entrar de novo; os CRMs recebem a chave nova)
# data_key (criptografa CPF, telefones e Pix no banco) NUNCA é trocada por
# este script: chave nova = dados antigos ilegíveis. Guarde uma cópia dela
# fora do servidor (ver DEPLOY.md, "Chaves secretas").
set -eu
cd "$(dirname "$0")/.."
umask 077
mkdir -p secrets
chmod 700 secrets

for nome in jwt_secret auth_secret data_key marketing_feed_key finance_feed_key; do
  arquivo="secrets/$nome"
  if [ -s "$arquivo" ] && { [ "${1:-}" != "--trocar" ] || [ "$nome" = "data_key" ]; }; then
    echo "OK  $arquivo já existe (mantido)"
    continue
  fi
  # 48 bytes aleatórios do sistema = 64 caracteres. Ninguém adivinha.
  openssl rand -base64 48 | tr -d '\n' > "$arquivo"
  chmod 600 "$arquivo"
  echo "NOVO $arquivo criado"
done
ls -l secrets
echo
echo "IMPORTANTE: guarde uma cópia de secrets/data_key fora do servidor"
echo "(gerenciador de senhas). Sem ela, CPF e telefones do backup não abrem."
echo "Para ver a chave e copiar:  cat secrets/data_key; echo"
