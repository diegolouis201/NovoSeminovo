#!/bin/sh
# Agenda o backup (scripts/backup.sh) todo dia às 03:17, com registro em
# ~/backups/backup.log. Pode rodar de novo: não duplica o agendamento.
set -eu
PROJETO="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$HOME/backups"
LINHA="17 3 * * * PROJETO=$PROJETO sh $PROJETO/scripts/backup.sh >> $HOME/backups/backup.log 2>&1"
( crontab -l 2>/dev/null | grep -v 'scripts/backup.sh' || true; echo "$LINHA" ) | crontab -
echo "Agendado: todo dia às 03:17."
crontab -l | grep 'scripts/backup.sh'
