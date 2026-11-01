import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@novoseminovo/db";
import { encryptExistingRows, fieldEncryptionMiddleware } from "../common/field-encryption";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super();
    // CPF, telefones e chave Pix: criptografados ao gravar, legíveis ao ler.
    this.$use(fieldEncryptionMiddleware());
  }

  async onModuleInit() {
    await this.$connect();
  }

  // Chamado uma vez na subida da API (main.ts): dados antigos em texto puro
  // passam a ficar criptografados.
  async encryptLegacyRows() {
    const changed = await encryptExistingRows(this);
    if (changed) this.logger.log(`${changed} registro(s) antigos criptografados.`);
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
