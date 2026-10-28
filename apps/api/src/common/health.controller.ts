import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { PrismaService } from "../prisma/prisma.service";

// Usado pelo vigia da VPS (scripts/vigia.sh) e por monitor externo: só diz
// se a API está de pé e conversando com o banco, sem dado nenhum.
@SkipThrottle()
@Controller("health")
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check(): Promise<{ ok: true }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException("Banco fora do ar");
    }
    return { ok: true };
  }
}
