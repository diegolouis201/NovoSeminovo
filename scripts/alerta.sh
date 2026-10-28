#!/bin/sh
# Manda um e-mail de alerta para o dono (ALERTA_EMAIL no .env) pelo Resend,
# com a mesma chave que o site já usa. Usado pelo vigia e pelo backup.
# Uso: sh scripts/alerta.sh "Assunto" "Texto (pode ter várias linhas)"
set -eu

PROJETO="${PROJETO:-$HOME/NovoSeminovo}"
ENV="$PROJETO/.env"

valor() {
  grep -E "^$1=" "$ENV" 2>/dev/null | tail -1 | cut -d= -f2- | sed -e 's/^["'\'']//' -e 's/["'\'']$//'
}

CHAVE="$(valor RESEND_API_KEY)"
DE="$(valor EMAIL_FROM)"
PARA="$(valor ALERTA_EMAIL)"
ASSUNTO="${1:-Alerta}"
TEXTO="${2:-}"

if [ -z "$CHAVE" ] || [ -z "$DE" ] || [ -z "$PARA" ]; then
  echo "$(date '+%d/%m %H:%M') alerta NÃO enviado (falta RESEND_API_KEY, EMAIL_FROM ou ALERTA_EMAIL no .env): $ASSUNTO" >&2
  exit 1
fi

# json: escapa o que quebraria o JSON. esc: também vira HTML seguro, com
# quebra de linha trocada por <br>.
json() {
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' -e 's/\t/ /g' | awk 'BEGIN{ORS=""} NR>1{print " "} {print}'
}
esc() {
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g' -e 's/\t/ /g' | awk 'BEGIN{ORS=""} NR>1{print "<br>"} {print}'
}

HTML="<div style=\\\"font-family:Arial,sans-serif;max-width:560px;padding:24px;border-top:6px solid #d64545;background:#ffffff\\\"><p style=\\\"font-size:13px;font-weight:700;color:#d64545;letter-spacing:1px;margin:0 0 8px\\\">ALERTA DO SERVIDOR</p><h1 style=\\\"font-size:20px;color:#0e2f4a;margin:0 0 12px\\\">$(esc "$ASSUNTO")</h1><p style=\\\"font-size:15px;line-height:1.6;color:#333\\\">$(esc "$TEXTO")</p><p style=\\\"font-size:12px;color:#888;margin-top:24px\\\">Enviado pelo vigia da VPS em $(date '+%d/%m/%Y %H:%M').</p></div>"

curl -sS -m 20 -o /dev/null -w '%{http_code}' https://api.resend.com/emails \
  -H "Authorization: Bearer $CHAVE" \
  -H "Content-Type: application/json" \
  -d "{\"from\":\"$(json "$DE")\",\"to\":[\"$(json "$PARA")\"],\"subject\":\"[NovoSeminovo] $(json "$ASSUNTO")\",\"html\":\"$HTML\"}" | grep -q '^2' \
  && echo "$(date '+%d/%m %H:%M') alerta enviado: $ASSUNTO" \
  || { echo "$(date '+%d/%m %H:%M') falha ao enviar alerta: $ASSUNTO" >&2; exit 1; }
