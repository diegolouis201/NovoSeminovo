# NEXT_PUBLIC_API_URL precisa ser um build ARG, não só uma variável de
# ambiente do container: o Next.js grava esse valor dentro do bundle do
# navegador em tempo de build (ver apps/web/components/ConversationLive.tsx,
# que roda no cliente) — defini-lo só em "environment:" no compose, depois
# do build pronto, não teria efeito nenhum.
FROM node:20-slim AS build
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
# "pnpm install" na raiz do monorepo processa o workspace inteiro, incluindo
# @novoseminovo/db — o postinstall do @prisma/client roda "prisma generate"
# sozinho nesse passo e erra sem isso, mesmo o apps/web não usando o pacote.
ENV DATABASE_URL="postgresql://user:password@localhost:5432/db"
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @novoseminovo/web build

FROM node:20-slim
RUN corepack enable
WORKDIR /app
COPY --from=build /app /app
WORKDIR /app/apps/web
EXPOSE 3000
CMD ["pnpm", "start", "-p", "3000"]
