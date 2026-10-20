import "reflect-metadata";
import { mkdirSync } from "node:fs";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module";
import { UPLOADS_DIR, UPLOADS_URL_PREFIX } from "./common/storage";

async function bootstrap() {
  // O multer não cria o diretório de destino sozinho — sem isso, o primeiro
  // upload falha com ENOENT.
  mkdirSync(UPLOADS_DIR, { recursive: true });

  // rawBody: true preserva req.rawBody em todas as rotas — precisamos dele
  // só no webhook do Stripe (WebhooksController), pra verificar a assinatura
  // sobre os bytes exatos recebidos, mas o Nest só tem essa opção global.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
  // Padrão do Express é 100kb — pouco pro envio em lote da API de
  // integração (até 100 anúncios com descrição, ver IntegrationsController).
  app.useBodyParser("json", { limit: "5mb" });
  app.enableCors({ origin: process.env.WEB_ORIGIN ?? "http://localhost:3000" });
  app.useStaticAssets(UPLOADS_DIR, { prefix: UPLOADS_URL_PREFIX });
  const port = process.env.PORT ? Number(process.env.PORT) : 4000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`API rodando em http://localhost:${port}`);
}

bootstrap();
