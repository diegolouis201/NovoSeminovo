# NovoSeminovo Hub (hub.novoseminovo.com.br). Mesmo esquema do site
# (apps/web/Dockerfile): instala o monorepo inteiro e compila só o Hub — ele
# usa as regras do CRM em crm-pacote/scripts, que vão junto no COPY.
FROM node:20-slim AS build
ENV DATABASE_URL="postgresql://user:password@localhost:5432/db"
ENV CYPRESS_INSTALL_BINARY=0
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm turbo run build --filter=@novoseminovo/hub

FROM node:20-slim
ENV NODE_ENV=production
RUN corepack enable
WORKDIR /app
COPY --from=build /app /app
WORKDIR /app/apps/hub
EXPOSE 3100
CMD ["pnpm", "start", "-p", "3100"]
