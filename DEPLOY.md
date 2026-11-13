# Publicando o NovoSeminovo

Opção escolhida: **um VPS só**, rodando tudo (site, API, banco) junto via Docker Compose, com HTTPS automático. O domínio continua registrado na UOL — só o DNS aponta pro IP desse servidor.

> **Importante:** os arquivos de Docker (`Dockerfile`, `docker-compose.yml`, `Caddyfile`) foram escritos com cuidado, seguindo os comandos de build que já foram testados à exaustão nesta sessão em dev — mas o build em container em si **ainda não foi testado**, porque este ambiente de desenvolvimento não tem Docker disponível. A primeira subida no servidor é o teste de verdade; se algum passo falhar, me mande o erro (`docker compose logs`) que eu ajusto.

## 1. Contratar o VPS

Especificação mínima: Ubuntu 22.04 (ou mais novo), **2 vCPU, 2GB RAM, 40GB SSD**. Com menos que isso, Postgres + API + site rodando juntos ficam apertados.

- **UOL Cloud Server**: já é a mesma conta/painel que você usa — veja os planos disponíveis no seu painel UOL.
- **DigitalOcean** ou **Hetzner**: alternativas populares, bem documentadas, se a UOL não tiver um plano que caiba no orçamento.

Ao criar, escolha **Ubuntu 22.04 LTS**, anote o **IP público** e garanta acesso **root via SSH** (a maioria dos provedores manda a senha/chave por e-mail ou deixa baixar uma chave `.pem`).

## 2. Apontar o domínio pro servidor

No painel de DNS do domínio na UOL, crie dois registros **A**, ambos apontando pro IP do VPS:

| Tipo | Nome | Valor |
|---|---|---|
| A | `@` (ou o domínio raiz) | IP do VPS |
| A | `api` | IP do VPS |

Propagação pode levar de alguns minutos a algumas horas. Dá pra seguir com os próximos passos enquanto isso propaga — só o certificado HTTPS (passo 5) depende do DNS já estar resolvendo.

## 3. Preparar o servidor

Conecte via SSH (`ssh root@IP_DO_SERVIDOR`) e instale o Docker:

```bash
curl -fsSL https://get.docker.com | sh
```

## 4. Clonar o projeto e configurar

```bash
git clone https://github.com/diegolouis201/NovoSeminovo.git
cd NovoSeminovo
git checkout claude/vehicle-marketplace-platform-lmif9s   # ou a branch/main depois de mergeado

cp .env.docker.example .env
nano .env   # preencha DOMAIN e gere POSTGRES_PASSWORD / JWT_SECRET / AUTH_SECRET
```

Pra gerar cada segredo: `openssl rand -hex 32`. Use `-hex` (não `-base64`) especificamente pro `POSTGRES_PASSWORD` — ele entra numa URL de conexão (`postgresql://usuario:SENHA@postgres:5432/...`) e o base64 às vezes sorteia `/`, `+` ou `=`, que quebram essa URL (o Prisma recusa com "invalid port number" ou erro parecido). Hex só usa `0-9a-f`, sempre seguro.

## 5. Subir tudo

```bash
docker compose up --build -d
```

A primeira vez demora alguns minutos (building das duas imagens). Acompanhe com:

```bash
docker compose logs -f
```

O Caddy só emite o certificado HTTPS com sucesso se o DNS do passo 2 já estiver resolvendo pro IP do servidor — se der erro de certificado, confirme a propagação (`ping seudominio.com.br` deve devolver o IP do VPS) e rode `docker compose restart caddy`.

## 6. Primeira configuração do banco

Com os containers no ar:

```bash
docker compose exec api pnpm --filter @novoseminovo/db push
docker compose exec api pnpm --filter @novoseminovo/db seed   # opcional — cria as contas de teste do README (senha "senha1234")
```

## 7. Verificar

Acesse `https://seudominio.com.br` — deve carregar o site; `https://api.seudominio.com.br/listings` deve devolver uma lista (vazia ou com os anúncios do seed) em JSON.

## Chaves secretas (arquivos `secrets/`, só no servidor)

O site usa três mensagens secretas: `jwt_secret` (assina o "crachá" de login da
API), `auth_secret` (criptografa o cookie de sessão do site) e `data_key`
(criptografa CPF, telefones e chave Pix guardados no banco). Há ainda a
`marketing_feed_key`, que libera a consulta de empresas cadastradas pelo CRM
de marketing (docs/crm-conversoes.md), a `finance_feed_key`, do CRM financeiro
(docs/crm-financeiro.md), e a `crm_feed_key`, do CRM geral (docs/crm-geral.md). Elas ficam em
arquivos na pasta `~/NovoSeminovo/secrets/`, que **nunca vai para o GitHub**
(está no `.gitignore`). O docker monta essa pasta só para leitura em
`/run/secrets` e a API e o site leem o arquivo sempre que precisam (releitura a
cada minuto). Em produção a variável `JWT_SECRET`/`AUTH_SECRET` do `.env` é
ignorada: sem o arquivo, o sistema não sobe.

- **Criar (uma vez, antes do deploy)**: `sh scripts/criar-segredos.sh`. Gera
  64 caracteres aleatórios por arquivo (`openssl rand -base64 48`), com
  permissão `600` (só o dono lê). Rodar de novo não troca as chaves existentes.
- **Gerar à mão** (mesmo resultado):
  `mkdir -p secrets && chmod 700 secrets && openssl rand -base64 48 | tr -d '\n' > secrets/jwt_secret && chmod 600 secrets/jwt_secret`
  (idem para `auth_secret`). Mínimo de 32 caracteres; nunca inventar "de cabeça".
- **Trocar as chaves** (ex.: suspeita de vazamento): `sh scripts/criar-segredos.sh --trocar`
  e `docker compose restart api web`. Todo mundo precisa entrar de novo.
  O `--trocar` **não** mexe na `data_key`.
- **`data_key` é a única que não pode ser perdida nem trocada**: com outra
  chave, os CPFs e telefones já gravados viram texto ilegível para sempre.
  Guarde uma cópia fora do servidor (gerenciador de senhas, ex.: Bitwarden),
  nunca junto com o backup do banco: `cat secrets/data_key; echo` mostra para
  copiar. Para restaurar o site em outro servidor: banco do backup + esta
  chave em `secrets/data_key`.
- Arquivo com permissão aberta para outros usuários é recusado (mensagem
  pede `chmod 600`).
- Nunca colar o conteúdo dos arquivos em chat, e-mail ou print. O backup do
  servidor não leva a pasta: se o VPS for perdido, `jwt_secret` e `auth_secret`
  podem ser geradas de novo (só obriga todos a entrar de novo); a `data_key`
  vem da sua cópia.

## Creditas (financiamento de veículo, Autofin C2C)

As duas chaves que a Creditas envia (consumer key e consumer secret) ficam em
arquivos na mesma pasta `secrets/` (nunca no `.env`, nunca no GitHub). A API lê
`/run/secrets/creditas_consumer_key` e `/run/secrets/creditas_consumer_secret`
(o docker já monta `secrets/` ali). Sem os dois arquivos, a integração fica
desligada: o pedido vira card no quadro com o motivo, sem quebrar nada. O
endereço padrão é o de **homologação** (`CREDITAS_AUTH_URL` e
`CREDITAS_API_URL` no `.env` trocam para produção quando a Creditas liberar).

- **Salvar as chaves** (dentro de `~/NovoSeminovo`; o que você cola não aparece na tela):
  ```sh
  cd ~/NovoSeminovo && umask 077 && mkdir -p secrets && chmod 700 secrets
  read -rsp "Cole a consumer key e aperte Enter: " K; echo; printf '%s' "$K" > secrets/creditas_consumer_key; unset K
  read -rsp "Cole o consumer secret e aperte Enter: " S; echo; printf '%s' "$S" > secrets/creditas_consumer_secret; unset S
  chmod 600 secrets/creditas_consumer_key secrets/creditas_consumer_secret && ls -l secrets/creditas_*
  ```
- **Testar o login na Creditas** (mostra só `token ok (expira em 7200s)`, nunca a chave):
  `docker run --rm -v ~/NovoSeminovo/scripts:/s -v ~/NovoSeminovo/secrets:/secrets:ro -w /s node:20-alpine node creditas-teste.mjs /s/creditas-lead-teste.json`
- **Enviar um lead de teste**: copie o modelo (`cp scripts/creditas-lead-teste.exemplo.json scripts/creditas-lead-teste.json`),
  troque nome/CPF/nascimento/celular/e-mail pelos seus (`nano scripts/creditas-lead-teste.json`;
  esse arquivo nunca vai para o GitHub) e rode o comando acima com `--enviar` no final.
  Mostra o código HTTP e o id do lead (ou o erro da Creditas).
- **Formulário no site**: desligado até a redação do termo BACEN ser confirmada
  (advogado + Creditas). Para ligar: `NEXT_PUBLIC_CREDITAS_FORM=1` no `.env` e
  `docker compose build web && docker compose up -d web`.

## Antivírus (opcional, ClamAV)

Toda imagem enviada já é conferida pelo tipo real (bytes, não pela extensão),
limitada a 40 megapixels e 12.000 px de lado (contra "bomba" de imagem),
recusada se animada e **refeita do zero** (vira um JPEG/WebP novo, sem
metadados nem nada escondido). Para também passar tudo no antivírus ClamAV
(fotos, logos, PDF do CRLV):

1. Conferir memória: `free -h` — o ClamAV usa ~1,5 GB de RAM.
2. No `.env`: `COMPOSE_PROFILES=antivirus` e `CLAMAV_HOST=clamav`.
3. `docker compose up -d` (a primeira subida baixa a base de vírus, ~2 minutos).

Com `CLAMAV_HOST` preenchido e o antivírus fora do ar, o envio é recusado
(melhor recusar do que aceitar sem conferir).

## Manutenção

- **Atualizar depois de um novo commit**: `git pull && docker compose up --build -d`.
- **Ver logs de um serviço**: `docker compose logs -f api` (ou `web`, `postgres`, `caddy`).
- **Backup automático** (`scripts/backup.sh`): banco todo dia às 03:17 (guarda 14 dias, e cada cópia é restaurada num banco temporário para provar que funciona) e fotos aos domingos (guarda as 4 últimas), em `~/backups`. Ativar uma vez: `sh scripts/instalar-backup.sh`. Rodar na hora: `sh scripts/backup.sh` (termina com `BACKUP-OK`). Registro: `tail ~/backups/backup.log`. Cópia fora da VPS (Google Drive, 60 dias): instalar o rclone (`curl https://rclone.org/install.sh | bash`), entrar na VPS com `ssh -L 53682:127.0.0.1:53682 root@<ip>` e rodar `rclone config create backup drive scope=drive.file` — abrir no navegador do computador o link `http://127.0.0.1:53682/auth…` que ele mostra e entrar na conta Google. A partir daí o script copia para a pasta `novoseminovo-backups` do Drive sozinho (o rclone só enxerga os arquivos que ele mesmo criou).
- **Restaurar o banco** (apaga o banco atual e põe o do backup — só em caso de perda): `docker compose stop api web && docker compose exec -T postgres pg_restore -U novoseminovo -d novoseminovo --clean --if-exists --no-owner < ~/backups/banco/banco-AAAAMMDD-HHMM.dump && docker compose start api web`.
- **Restaurar as fotos**: `docker compose exec -T api tar xzf - -C /app/apps/api < ~/backups/fotos/fotos-AAAAMMDD-HHMM.tar.gz`.

## Alertas (site fora do ar, backup, disco)

`sh scripts/instalar-vigia.sh seu@email.com` grava `ALERTA_EMAIL` no `.env`,
agenda o vigia (`scripts/vigia.sh`, a cada 5 minutos) e manda um e-mail de
teste. O vigia confere `https://DOMAIN/` e `https://api.DOMAIN/health`; com 2
falhas seguidas tenta `docker compose up -d` e avisa por e-mail (repete a cada
hora e avisa quando voltar). Também avisa se o último backup do banco tiver
mais de 26 horas, se o backup terminar com erro, ou se sobrar menos de 2 GB no
disco. Registro em `~/backups/vigia.log`. O e-mail sai pelo Resend
(`scripts/alerta.sh`), com a mesma chave do site.

Se a VPS inteira cair, o vigia cai junto: para isso, um monitor externo
gratuito (ex.: UptimeRobot) checando `https://api.DOMAIN/health` a cada 5
minutos.

## Stripe, Resend e S3 passam a funcionar de verdade aqui

As integrações de cobrança (Stripe), e-mail (Resend) e fotos em nuvem (S3/R2) já estão prontas no código, mas não puderam ser testadas no ambiente de desenvolvimento usado até aqui porque ele bloqueava a saída de rede pra essas APIs. Um VPS de verdade não tem esse bloqueio — basta preencher as variáveis correspondentes no `.env` (ver `.env.docker.example` e `apps/api/.env.example` pro que cada uma faz) e rodar `docker compose up -d` de novo.

---

## Alternativa: Vercel (site) + Render (API/banco)

Se preferir não administrar um servidor (sem SSH, sem Docker, sem renovar certificado), essa combinação é 100% gerenciada e tem plano grátis pra começar — fica como opção B caso o VPS não seja mais o caminho escolhido.

### 1. Banco de dados + API no Render

1. Crie uma conta em https://render.com (dá pra entrar com o GitHub).
2. **New → Blueprint**, conecte o repositório e aponte pro `render.yaml` da raiz — ele cria sozinho o serviço da API e o banco Postgres.
   - Se o Blueprint der erro, crie manualmente: **New → PostgreSQL** (plano Free) e **New → Web Service** com Build Command `corepack enable && corepack prepare pnpm@9.0.0 --activate && pnpm install --frozen-lockfile && pnpm db:generate && pnpm --filter @novoseminovo/api build`, Start Command `node apps/api/dist/main.js`, e as variáveis `DATABASE_URL`, `JWT_SECRET`, `WEB_ORIGIN`.
3. No **Shell** do serviço, rode uma vez: `pnpm db:push` (e `pnpm db:seed`, opcional).

### 2. Site no Vercel

1. Conta em https://vercel.com, **Add New → Project**, importe o repositório.
2. **Root Directory**: `apps/web`.
3. Env vars: `NEXT_PUBLIC_API_URL` (URL da API no Render) e `AUTH_SECRET`.
4. Deploy, depois volte no Render e atualize `WEB_ORIGIN` pra URL que o Vercel deu.

### 3. Domínio

No DNS da UOL: domínio raiz segue as instruções que o Vercel mostra em **Settings → Domains**; `api.seudominio.com.br` vira um CNAME pro endereço que o Render mostra em **Custom Domains**.

### Cuidado: plano grátis do Render "dorme"

Sem uso por 15 minutos, o serviço da API hiberna — o primeiro acesso depois demora uns 10–30s. Como `apps/web/lib/api.ts` desiste de falar com a API em 1,5s e cai pros dados de exemplo, a pessoa pode ver conteúdo de demonstração por alguns segundos logo depois de um período parado. Resolve com um ping periódico (ex.: UptimeRobot a cada 10min) ou migrando pro plano pago do Render (a partir de uns US$7/mês).
