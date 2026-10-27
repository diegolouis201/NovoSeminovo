#!/bin/sh
# Backup do NovoSeminovo na VPS (rodado pelo cron, ver scripts/instalar-backup.sh).
#   - Banco: todo dia, formato do pg_dump (-Fc), guarda 14 dias. Cada cópia é
#     restaurada num banco temporário para provar que funciona.
#   - Fotos dos anúncios (pasta uploads da API): aos domingos (ou com
#     BACKUP_FOTOS=1), guarda as 4 últimas.
#   - Se existir um destino do rclone chamado "backup", copia tudo para lá
#     (cópia fora da VPS).
# Uso manual: sh scripts/backup.sh   (termina com BACKUP-OK)
set -eu

PROJETO="${PROJETO:-$HOME/NovoSeminovo}"
DESTINO="${BACKUP_DIR:-$HOME/backups}"
DIAS_BANCO="${BACKUP_DIAS_BANCO:-14}"
COPIAS_FOTOS="${BACKUP_COPIAS_FOTOS:-4}"
QUANDO="$(date +%Y%m%d-%H%M)"

cd "$PROJETO"
mkdir -p "$DESTINO/banco" "$DESTINO/fotos"

falha() {
  rm -f "$DESTINO"/banco/*.parcial "$DESTINO"/fotos/*.parcial
  echo "$(date '+%d/%m %H:%M') ERRO: $1" >&2
  exit 1
}

# Espaço: pelo menos 1 GB livre antes de começar.
LIVRE_KB="$(df -Pk "$DESTINO" | awk 'NR==2 {print $4}')"
[ "$LIVRE_KB" -ge 1048576 ] || falha "menos de 1 GB livre em $DESTINO"

# 1) Banco
ARQ="$DESTINO/banco/banco-$QUANDO.dump"
docker compose exec -T postgres pg_dump -U novoseminovo -Fc novoseminovo > "$ARQ.parcial" || falha "pg_dump falhou"
[ -s "$ARQ.parcial" ] || falha "backup do banco saiu vazio"
mv "$ARQ.parcial" "$ARQ"

# Prova de restauração: um banco temporário, apagado no fim.
TESTE="restauracao_teste"
docker compose exec -T postgres dropdb -U novoseminovo --if-exists "$TESTE"
docker compose exec -T postgres createdb -U novoseminovo "$TESTE"
if ! docker compose exec -T postgres pg_restore -U novoseminovo -d "$TESTE" --no-owner < "$ARQ"; then
  docker compose exec -T postgres dropdb -U novoseminovo --if-exists "$TESTE"
  falha "a cópia do banco não restaurou"
fi
ANUNCIOS="$(docker compose exec -T postgres psql -U novoseminovo -d "$TESTE" -Atc 'select count(*) from listings')"
USUARIOS="$(docker compose exec -T postgres psql -U novoseminovo -d "$TESTE" -Atc 'select count(*) from users')"
docker compose exec -T postgres dropdb -U novoseminovo --if-exists "$TESTE"
echo "$(date '+%d/%m %H:%M') banco ok: $(du -h "$ARQ" | cut -f1), restaurado com $ANUNCIOS anúncios e $USUARIOS usuários"

find "$DESTINO/banco" -name 'banco-*.dump' -mtime +"$DIAS_BANCO" -delete
find "$DESTINO/banco" -name '*.parcial' -delete

# 2) Fotos (domingo ou quando pedido)
if [ "$(date +%u)" = "7" ] || [ "${BACKUP_FOTOS:-}" = "1" ]; then
  FOTOS="$DESTINO/fotos/fotos-$QUANDO.tar.gz"
  docker compose exec -T api tar czf - -C /app/apps/api uploads > "$FOTOS.parcial" || falha "cópia das fotos falhou"
  gzip -t "$FOTOS.parcial" || falha "arquivo das fotos corrompido"
  mv "$FOTOS.parcial" "$FOTOS"
  echo "$(date '+%d/%m %H:%M') fotos ok: $(du -h "$FOTOS" | cut -f1)"
  ls -1t "$DESTINO"/fotos/fotos-*.tar.gz | tail -n +"$((COPIAS_FOTOS + 1))" | xargs -r rm -f
fi

# 3) Cópia fora da VPS, se configurada (rclone config → destino "backup").
if command -v rclone >/dev/null 2>&1 && rclone listremotes 2>/dev/null | grep -qx 'backup:'; then
  rclone copy "$DESTINO" backup:novoseminovo-backups --exclude '*.parcial' || falha "cópia para fora da VPS falhou"
  echo "$(date '+%d/%m %H:%M') cópia fora da VPS ok"
fi

echo "BACKUP-OK"
