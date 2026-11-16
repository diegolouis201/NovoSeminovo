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
- **Formulário no site**: por padrão só administrador logado vê (teste), até a
  redação do termo BACEN ser confirmada (advogado + Creditas). Para ligar para
  todos: `NEXT_PUBLIC_CREDITAS_FORM=1` no `.env` (`0` desliga até para admin) e
  `docker compose build web && docker compose up -d web`.

## Meta Pixel e API de Conversões

Conta para a Meta os leads e cadastros que vieram dos anúncios (eventos `Lead`
e `CompleteRegistration`), pelo navegador (pixel) e pelo servidor (API de
Conversões), com o mesmo id — a Meta junta e conta uma vez. Só de quem clicou
em "Aceitar" no aviso de cookies. **Fica desligado** até os dois passos abaixo;
sem eles o site funciona igual.

1. **ID do pixel** (Gerenciador de Eventos da Meta → Conectar dados → Web; é o
   número do conjunto de dados, só algarismos). No servidor, troque
   `123456789012345` pelo seu ID e cole:
   ```sh
   cd ~/NovoSeminovo && sed -i '/^NEXT_PUBLIC_META_PIXEL_ID=/d' .env && echo 'NEXT_PUBLIC_META_PIXEL_ID=123456789012345' >> .env && grep META_PIXEL .env
   ```
   Se tiver letra, espaço ou outro sinal, o site considera inválido e deixa
   desligado.
2. **Token da API de Conversões** (Gerenciador de Eventos → o conjunto de
   dados → Configurações → API de Conversões → "Gerar token de acesso").
   Nunca no `.env`, no GitHub nem em chat — só no arquivo:
   ```sh
   cd ~/NovoSeminovo && umask 077 && mkdir -p secrets && chmod 700 secrets && nano secrets/meta_capi_token
   ```
   No nano: cole o token (botão direito ou Ctrl+Shift+V), salve com **Ctrl+O**,
   **Enter** e saia com **Ctrl+X**. Depois tire espaços/quebras de linha que
   vierem juntos na colagem, proteja o arquivo e confira o tamanho (mostra só
   o número de caracteres e as 3 primeiras letras, nunca o token):
   ```sh
   cd ~/NovoSeminovo && tr -d ' \t\r\n' < secrets/meta_capi_token > secrets/meta_capi_token.novo && mv secrets/meta_capi_token.novo secrets/meta_capi_token && chmod 600 secrets/meta_capi_token && wc -c < secrets/meta_capi_token && head -c 3 secrets/meta_capi_token; echo
   ```
   O certo: um número grande (em geral mais de 150) e `EAA`. Número pequeno ou
   outras letras = colou errado; rode o `nano` de novo.
3. **Publicar** (o ID fica gravado no site no build; a API lê o token sozinha):
   ```sh
   cd ~/NovoSeminovo && nohup sh -c 'docker compose build web && docker compose up -d && echo PRONTO-OK' > ~/deploy.log 2>&1 &
   ```
   Conferir com `tail -3 ~/deploy.log` (precisa terminar em `PRONTO-OK`).
4. **Verificar no Gerenciador de Eventos** → o conjunto de dados → **Testar
   eventos**: copie o código de teste (ex.: `TEST12345`) e, trocando pelo seu:
   ```sh
   cd ~/NovoSeminovo && sed -i '/^META_TEST_EVENT_CODE=/d' .env && echo 'META_TEST_EVENT_CODE=TEST12345' >> .env && docker compose up -d api
   ```
   Na mesma tela, abra o site pelo campo "Testar eventos do navegador" (ou numa
   aba anônima), clique em **Aceitar** no aviso de cookies e envie o formulário
   de `https://novoseminovo.com.br/para-lojas/comecar` com dados de teste.
   Devem aparecer `PageView` (Navegador) e `Lead` duas vezes — Navegador e
   Servidor — marcado como desduplicado. Erro do lado do servidor aparece no
   log sem o token: `docker compose logs api --since 15m | grep -i "Conversões"`
   (vazio = sem erro). Terminou o teste: apague o código e reinicie a API
   (senão os eventos reais ficam só na aba de teste):
   ```sh
   cd ~/NovoSeminovo && sed -i '/^META_TEST_EVENT_CODE=/d' .env && docker compose up -d api
   ```
- **Trocar o token**: rode de novo o passo 2; a API passa a usar o novo no próximo evento.
- **Desligar**: apague a linha `NEXT_PUBLIC_META_PIXEL_ID` do `.env` (ou o
  arquivo `secrets/meta_capi_token`, que desliga só o servidor) e rode o passo 3.

## Lead Ads da Meta (formulários do Instagram e Facebook)

Quem preenche um formulário de anúncio (Lead Ads) da página do NovoSeminovo
cai no CRM em segundos: loja/imobiliária/corretor vira card "Lead de
campanha" no funil do Hub (com tarefa para o Comercial); comprador aparece em
Marketing → Leads de compradores como "Formulário Meta". **Fica desligado**
até os passos abaixo (sem eles, o endereço do webhook responde "não
encontrado" e nada é lido da Meta).

São três segredos, cada um num arquivo (nunca no `.env`, no GitHub ou em chat):

| Arquivo | O que é | Onde pegar |
|---|---|---|
| `secrets/meta_app_secret` | Chave secreta do app | developers.facebook.com → seu app → Configurações do app → Básico → "Chave secreta do app" → Mostrar |
| `secrets/meta_webhook_verify_token` | Senha do webhook (você cria) | gerada no servidor (passo 2) |
| `secrets/meta_page_token` | Token da página com permissão `leads_retrieval` (de preferência de um usuário do sistema, que não expira) | business.facebook.com → Configurações do negócio → Usuários do sistema → Gerar token (app acima; permissões `leads_retrieval`, `pages_show_list`, `pages_read_engagement`, `pages_manage_metadata`, `ads_read`) |

1. **Chave secreta do app** (a 1ª linha cria a pasta protegida):
   ```sh
   cd ~/NovoSeminovo && umask 077 && mkdir -p secrets && chmod 700 secrets && nano secrets/meta_app_secret
   ```
   No nano: cole a chave (botão direito ou Ctrl+Shift+V), salve com **Ctrl+O**,
   **Enter** e saia com **Ctrl+X**. Depois limpe espaços/quebras de linha,
   proteja e confira (mostra só o número de caracteres, nunca a chave):
   ```sh
   cd ~/NovoSeminovo && tr -d ' \t\r\n' < secrets/meta_app_secret > secrets/meta_app_secret.novo && mv secrets/meta_app_secret.novo secrets/meta_app_secret && chmod 600 secrets/meta_app_secret && wc -c < secrets/meta_app_secret
   ```
   O certo: `32`.
2. **Senha do webhook**: gere no próprio servidor e veja **uma vez** para colar
   na Meta no passo 5 (é a única vez que ela aparece na tela):
   ```sh
   cd ~/NovoSeminovo && umask 077 && openssl rand -hex 24 > secrets/meta_webhook_verify_token && chmod 600 secrets/meta_webhook_verify_token && cat secrets/meta_webhook_verify_token
   ```
   Copie as 48 letras/números que aparecerem e limpe a tela com `clear`.
3. **Token da página**:
   ```sh
   cd ~/NovoSeminovo && umask 077 && nano secrets/meta_page_token
   ```
   Cole, salve (**Ctrl+O**, **Enter**, **Ctrl+X**) e limpe/confira:
   ```sh
   cd ~/NovoSeminovo && tr -d ' \t\r\n' < secrets/meta_page_token > secrets/meta_page_token.novo && mv secrets/meta_page_token.novo secrets/meta_page_token && chmod 600 secrets/meta_page_token && wc -c < secrets/meta_page_token && head -c 3 secrets/meta_page_token; echo
   ```
   O certo: um número grande (em geral mais de 150) e `EAA`.
4. **Id da página e publicar** (o id não é segredo; a API precisa ser
   reconstruída porque o código é novo, e o banco ganha a tabela
   `meta_leadgens` e colunas novas em `marketing_contacts`):
   ```sh
   cd ~/NovoSeminovo && sed -i '/^META_PAGE_ID=/d' .env && echo 'META_PAGE_ID=828845163855705' >> .env && grep META_PAGE_ID .env
   ```
   Depois rode o comando de deploy de sempre (o do HANDOFF.md, "Deploy —
   comandos corrigidos", que já faz o `prisma db push`) e confira com
   `tail -3 ~/deploy.log` (precisa terminar em `PRONTO-OK`).
5. **Cadastrar o webhook na Meta**: developers.facebook.com → seu app →
   Webhooks (ou "Casos de uso" → Webhooks) → escolha **Page** (Página) →
   "Assinar este objeto":
   - URL de retorno: `https://api.novoseminovo.com.br/webhooks/meta/leadgen`
   - Token de verificação: a senha do passo 2
   - Clique em **Verificar e salvar** e depois em **Assinar** no campo `leadgen`.

   Em seguida ligue o app à página (uma vez), pelo Explorador da Graph API
   (developers.facebook.com/tools/explorer): escolha o app, em "Usuário ou
   página" escolha a página do NovoSeminovo, troque o método para **POST**,
   escreva `828845163855705/subscribed_apps?subscribed_fields=leadgen` e
   clique em **Enviar**; a resposta certa é `"success": true`.
   Se a página tiver "Acesso a leads" restrito (Configurações da página →
   Configurações avançadas de mensagens/Leads → Acesso a leads), dê acesso ao
   app e ao usuário do sistema.
6. **Testar** com a ferramenta da Meta:
   developers.facebook.com/tools/lead-ads-testing → escolha a página e o
   formulário → **Criar lead** (ou "Excluir lead" antes, se já houver um de
   teste). Em segundos ele aparece no Hub (funil, se o nome do formulário ou da
   campanha tiver "lojas", "imobiliarias", "corretores", "parceiros" ou "b2b";
   senão em Marketing → Leads de compradores). Conferir no servidor (sem token
   nem dado pessoal no log):
   ```sh
   cd ~/NovoSeminovo && docker compose logs api --since 15m | grep -i "Lead Ads"
   ```
   Vazio = tudo certo. "HTTP 400 (OAuthException 190)" = token da página
   errado ou vencido (refaça o passo 3); "sem e-mail e sem telefone" = o
   formulário não pediu nenhum dos dois.
- **Rede de segurança**: de 30 em 30 minutos a API lista os formulários da
  página e busca os leads das últimas 24h que o webhook não entregou. Para
  desligar só ela: `META_LEADS_SYNC_DISABLED=1` no `.env` e `docker compose up -d api`.
- **Trocar um segredo**: refaça o passo correspondente; a API lê o arquivo de
  novo a cada lead (trocou a senha do webhook, troque também na Meta).
- **Desligar tudo**: `rm ~/NovoSeminovo/secrets/meta_app_secret` (o webhook
  volta a responder "não encontrado").

## Seguidores da Jornada (Hub → Jornada → Redes sociais)

O painel mostra os seguidores de cada rede. De onde vem cada número:

| Rede | Como chega | O que configurar |
|---|---|---|
| Facebook | sozinho, pela Meta (a cada 6 horas) | nada além do Lead Ads (seção acima) |
| Instagram | sozinho, pela Meta; se a Meta recusar, pelo Windsor | token com as permissões abaixo |
| YouTube | sozinho, pela API do YouTube | chave + canal (passos abaixo) |
| TikTok e LinkedIn | **digitado por você** no próprio painel | nada: atualize toda semana |

Em qualquer rede você pode digitar o número (campo "nº hoje" + **Salvar**, só
aparece para o dono). Quando a leitura automática funciona, ela passa por
cima do número digitado; ao lado do número aparece "automático" ou
"digitado em dd/mm".

**YouTube (uma vez):**

1. Entre em https://console.cloud.google.com com a conta Google do canal.
   No topo, escolha (ou crie) um projeto, ex.: "NovoSeminovo".
2. Menu ☰ → **APIs e serviços** → **Biblioteca** → procure
   **YouTube Data API v3** → **Ativar**.
3. Menu ☰ → **APIs e serviços** → **Credenciais** → **+ Criar credenciais** →
   **Chave de API**. Copie a chave que aparecer (começa com `AIza`).
4. Na mesma tela, clique na chave criada → **Restrições de API** →
   **Restringir chave** → marque só **YouTube Data API v3** → **Salvar**.
5. No servidor, guarde a chave num arquivo (nunca no `.env` nem em chat):
   ```sh
   cd ~/NovoSeminovo && umask 077 && mkdir -p secrets && chmod 700 secrets && nano secrets/youtube_api_key
   ```
   Cole, salve (**Ctrl+O**, **Enter**, **Ctrl+X**) e limpe/confira:
   ```sh
   cd ~/NovoSeminovo && tr -d ' \t\r\n' < secrets/youtube_api_key > secrets/youtube_api_key.novo && mv secrets/youtube_api_key.novo secrets/youtube_api_key && chmod 600 secrets/youtube_api_key && wc -c < secrets/youtube_api_key && head -c 4 secrets/youtube_api_key; echo
   ```
   O certo: `39` e `AIza`.
6. Diga qual é o canal no `.env` (o @ do endereço youtube.com/@... do canal):
   ```sh
   cd ~/NovoSeminovo && grep -q '^YOUTUBE_CHANNEL=' .env && sed -i 's/^YOUTUBE_CHANNEL=.*/YOUTUBE_CHANNEL=@novoseminovooficial/' .env || echo 'YOUTUBE_CHANNEL=@novoseminovooficial' >> .env
   docker compose up -d api
   ```
   Também vale o id do canal (`UC...`). Em até 6 horas (ou ao abrir a
   Jornada, se passou 1 hora da última leitura) o número aparece. O YouTube
   arredonda o total (ex.: 1.230 em vez de 1.234); se o canal esconde o
   número de inscritos, a API não informa e fica "—" (digite à mão).

**Instagram:** a leitura direta pela Meta usa o mesmo token da página do Lead
Ads (`secrets/meta_page_token`). Se o painel mostrar o aviso laranja "A Meta
recusou a leitura do Instagram", gere de novo o token do usuário do sistema
(business.facebook.com → Configurações do negócio → Usuários do sistema →
Gerar token) marcando também **`instagram_basic`**,
**`instagram_manage_insights`** e **`pages_read_engagement`** (além das que
já estavam), e troque o arquivo com os comandos do passo 3 do Lead Ads. A
conta do Instagram precisa ser profissional e estar ligada à página do
Facebook. Enquanto isso o painel tenta o Windsor e, sem ele, mostra o
último número guardado (ou o que você digitar).

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
