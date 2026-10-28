#!/bin/sh
# Liga os alertas por e-mail: o vigia (a cada 5 minutos) e o aviso de falha
# do backup. Grava o e-mail de destino no .env e manda um e-mail de teste.
# Uso: sh scripts/instalar-vigia.sh seu@email.com
# Pode rodar de novo: não duplica o agendamento.
set -eu
PROJETO="$(cd "$(dirname "$0")/.." && pwd)"
EMAIL="${1:-}"
case "$EMAIL" in
  *@*.*) ;;
  *) echo "Informe o e-mail que recebe os alertas: sh scripts/instalar-vigia.sh seu@email.com"; exit 1 ;;
esac

# ALERTA_EMAIL no .env (troca se já existir).
grep -v '^ALERTA_EMAIL=' "$PROJETO/.env" > "$PROJETO/.env.novo" || true
echo "ALERTA_EMAIL=$EMAIL" >> "$PROJETO/.env.novo"
chmod --reference="$PROJETO/.env" "$PROJETO/.env.novo" 2>/dev/null || chmod 600 "$PROJETO/.env.novo"
mv "$PROJETO/.env.novo" "$PROJETO/.env"

mkdir -p "$HOME/backups"
VIGIA="*/5 * * * * PROJETO=$PROJETO sh $PROJETO/scripts/vigia.sh >> $HOME/backups/vigia.log 2>&1"
# Backup: se terminar com erro, manda alerta com o fim do registro.
BACKUP="17 3 * * * PROJETO=$PROJETO sh $PROJETO/scripts/backup.sh >> $HOME/backups/backup.log 2>&1 || PROJETO=$PROJETO sh $PROJETO/scripts/alerta.sh 'Backup falhou' \"\$(tail -5 $HOME/backups/backup.log)\" >> $HOME/backups/vigia.log 2>&1"
( crontab -l 2>/dev/null | grep -v 'scripts/vigia.sh' | grep -v 'scripts/backup.sh' || true; echo "$VIGIA"; echo "$BACKUP" ) | crontab -

echo "Agendado: vigia a cada 5 minutos e alerta de falha do backup."
PROJETO="$PROJETO" sh "$PROJETO/scripts/alerta.sh" "Alertas ligados" "A partir de agora você recebe aqui um e-mail se o site ou a API saírem do ar, se o backup falhar ou atrasar, ou se o disco da VPS estiver quase cheio." \
  && echo "VIGIA-OK: confira o e-mail de teste em $EMAIL"
