#!/bin/sh
# Poda as cópias das fotos no Google Drive: guarda só as N mais novas
# (padrão 4, a mesma regra da VPS) e apaga as outras DE VEZ (sem passar pela
# lixeira do Drive, que continuaria ocupando o espaço da conta Google).
# Chamado pelo scripts/backup.sh depois de uma cópia bem-sucedida; pode rodar
# sozinho para liberar espaço na hora:
#   sh scripts/podar-fotos-drive.sh                       (backup:novoseminovo-backups/fotos, 4 cópias)
#   sh scripts/podar-fotos-drive.sh <destino>/fotos <N>
# Cuidados (de propósito, nunca "rclone sync"):
#   - só apaga dentro de uma pasta que termina em /fotos;
#   - só arquivos com nome exato fotos-AAAAMMDD-HHMM.tar.gz (o resto é ignorado);
#   - se não conseguir listar o Drive, não apaga nada (sai com erro);
#   - com N cópias ou menos, não apaga nada.
set -u

REMOTO="${1:-backup:novoseminovo-backups/fotos}"
COPIAS="${2:-${BACKUP_COPIAS_FOTOS:-4}}"

case "$REMOTO" in
  *:*/fotos) ;;
  *) echo "ERRO: destino precisa ser uma pasta fotos do rclone (ex.: backup:novoseminovo-backups/fotos), veio: $REMOTO" >&2; exit 2 ;;
esac
case "$COPIAS" in
  '' | *[!0-9]*) echo "ERRO: número de cópias inválido: '$COPIAS'" >&2; exit 2 ;;
esac
[ "$COPIAS" -ge 1 ] || { echo "ERRO: precisa guardar pelo menos 1 cópia" >&2; exit 2; }

LISTA="$(rclone lsf --files-only "$REMOTO")" || {
  echo "ERRO: não consegui listar $REMOTO no Drive; nada foi apagado" >&2
  exit 1
}

# Mais novas primeiro: o nome tem a data (AAAAMMDD-HHMM), então ordem do nome = ordem da data.
NOMES="$(printf '%s\n' "$LISTA" | grep -E '^fotos-[0-9]{8}-[0-9]{4}\.tar\.gz$' | sort -r)"
TOTAL="$(printf '%s\n' "$NOMES" | grep -c . || true)"

if [ "$TOTAL" -le "$COPIAS" ]; then
  echo "$(date '+%d/%m %H:%M') fotos no Drive: $TOTAL cópia(s), nada a apagar (guarda $COPIAS)"
  exit 0
fi

APAGADAS=0
ERROS=0
# Os nomes passaram pelo padrão acima: sem espaço nem caractere especial.
for NOME in $(printf '%s\n' "$NOMES" | tail -n +"$((COPIAS + 1))"); do
  if rclone deletefile --drive-use-trash=false "$REMOTO/$NOME"; then
    APAGADAS=$((APAGADAS + 1))
  else
    ERROS=$((ERROS + 1))
    echo "ERRO: não consegui apagar $NOME do Drive" >&2
  fi
done

echo "$(date '+%d/%m %H:%M') fotos no Drive: $APAGADAS cópia(s) antiga(s) apagada(s), ficam as $COPIAS mais novas"
[ "$ERROS" -eq 0 ] || exit 1
