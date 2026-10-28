#!/bin/sh
# Vigia da VPS (cron a cada 5 minutos, ver scripts/instalar-vigia.sh).
#   - Site e API respondendo? Se falhar 2 vezes seguidas (10 min), tenta
#     religar os containers e manda e-mail; repete o aviso a cada hora
#     enquanto continuar fora e avisa quando voltar.
#   - Backup do banco com mais de 26 horas? Avisa (uma vez por dia).
#   - Menos de 2 GB livres no disco? Avisa (uma vez por dia).
# Se a VPS inteira cair, este script cai junto: para isso serve o monitor
# externo (DEPLOY.md, "Alertas").
set -u

PROJETO="${PROJETO:-$HOME/NovoSeminovo}"
ESTADO="$HOME/.vigia"
BACKUPS="${BACKUP_DIR:-$HOME/backups}"
mkdir -p "$ESTADO"
cd "$PROJETO" || exit 1

DOMINIO="$(grep -E '^DOMAIN=' .env | tail -1 | cut -d= -f2- | tr -d '"'\''')"
HOJE="$(date +%Y%m%d)"
alerta() { PROJETO="$PROJETO" sh "$PROJETO/scripts/alerta.sh" "$1" "$2"; }

# Uma vez por dia por assunto.
uma_vez_hoje() {
  [ "$(cat "$ESTADO/$1" 2>/dev/null)" = "$HOJE" ] && return 1
  echo "$HOJE" > "$ESTADO/$1"
}

# 1) Site e API
PROBLEMA=""
curl -fsS -o /dev/null -m 20 "https://$DOMINIO/" || PROBLEMA="o site (https://$DOMINIO) não abriu"
curl -fsS -o /dev/null -m 20 "https://api.$DOMINIO/health" || PROBLEMA="${PROBLEMA:+$PROBLEMA; }a API (pagamentos, cadastro, anúncios) não respondeu"

FALHAS="$(cat "$ESTADO/falhas" 2>/dev/null || echo 0)"
if [ -n "$PROBLEMA" ]; then
  FALHAS=$((FALHAS + 1))
  echo "$FALHAS" > "$ESTADO/falhas"
  if [ "$FALHAS" -eq 2 ] || [ $(( (FALHAS - 2) % 12 )) -eq 0 ]; then
    docker compose up -d >/dev/null 2>&1
    sleep 30
    CONTAINERS="$(docker compose ps --format '{{.Service}}: {{.State}} {{.Status}}' 2>&1 | head -10)"
    alerta "Site fora do ar há $((FALHAS * 5)) minutos" "O que falhou: $PROBLEMA.

Já tentei religar os serviços. Situação agora:
$CONTAINERS

Se continuar fora, entre na VPS e rode:
cd ~/NovoSeminovo && docker compose logs --tail 50 api web"
    echo "$(date '+%d/%m %H:%M') fora do ar ($FALHAS): $PROBLEMA"
  fi
else
  if [ "$FALHAS" -ge 2 ]; then
    alerta "Site de volta ao ar" "O site e a API voltaram a responder depois de cerca de $((FALHAS * 5)) minutos fora."
    echo "$(date '+%d/%m %H:%M') voltou ao ar"
  fi
  echo 0 > "$ESTADO/falhas"
fi

# 2) Backup do banco recente
if [ -d "$BACKUPS/banco" ] && [ -z "$(find "$BACKUPS/banco" -name 'banco-*.dump' -mmin -1560 2>/dev/null | head -1)" ]; then
  if uma_vez_hoje backup; then
    alerta "Backup do banco atrasado" "Não há cópia do banco das últimas 26 horas.

Últimas linhas do registro do backup:
$(tail -5 "$BACKUPS/backup.log" 2>/dev/null || echo 'registro não encontrado')

Para rodar na mão: cd ~/NovoSeminovo && sh scripts/backup.sh"
  fi
fi

# 3) Espaço em disco
LIVRE_KB="$(df -Pk "$HOME" | awk 'NR==2 {print $4}')"
if [ "$LIVRE_KB" -lt 2097152 ] && uma_vez_hoje disco; then
  alerta "Pouco espaço no disco da VPS" "Restam $((LIVRE_KB / 1024)) MB livres. Com o disco cheio o site e o backup param.

Para liberar espaço: docker image prune -f && docker builder prune -f"
fi
exit 0
