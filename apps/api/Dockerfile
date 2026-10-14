# Build e runtime juntos (sem estágio "pruned" separado): mesmos comandos
# já testados à exaustão em dev nesta sessão (pnpm install + db:generate +
# build), só rodando dentro do container em vez de na máquina local.
# Prioriza previsibilidade sobre imagem enxuta — simplifica depurar na
# primeira tentativa de deploy, que ainda não foi validada de ponta a ponta.
FROM node:20-slim AS build
# A imagem "slim" não traz openssl — sem isso, o "prisma generate" não
# consegue detectar a versão da libssl do sistema e cai num binário padrão
# (debian-openssl-1.1.x) incompatível com a libssl3 que o Debian desta
# imagem realmente tem, travando a API com PrismaClientInitializationError
# assim que ela tenta abrir uma conexão.
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /app
COPY . .
# "prisma generate" só lê o schema, nunca conecta — mas erra se
# DATABASE_URL não existir. O valor real (de verdade, com senha) só chega
# em runtime via docker-compose; aqui é só pra satisfazer o env() do schema.
# Precisa vir ANTES do install: o postinstall do próprio @prisma/client já
# roda "prisma generate" sozinho nesse passo, antes do RUN db:generate abaixo.
ENV DATABASE_URL="postgresql://user:password@localhost:5432/db"
RUN pnpm install --frozen-lockfile
RUN pnpm db:generate
# "turbo run build" (não "pnpm --filter ... build" direto) é essencial aqui:
# o turbo.json declara build.dependsOn "^build", ou seja, compila
# @novoseminovo/db e @novoseminovo/shared-types (de TS pra dist/*.js) antes
# da API — sem isso, o dist/main.js da API faz require() desses pacotes e
# cai no "main" do package.json deles, que sem essa build aponta pro .ts
# cru, que o Node puro não consegue interpretar (SyntaxError em runtime).
RUN pnpm turbo run build --filter=@novoseminovo/api

FROM node:20-slim
# Mesmo motivo do estágio de build: o binário do Prisma gerado precisa da
# libssl do sistema presente em runtime, não só no momento do generate.
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /app
COPY --from=build /app /app
WORKDIR /app/apps/api
EXPOSE 4000
CMD ["node", "dist/main.js"]
