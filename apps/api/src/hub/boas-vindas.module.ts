import { Module } from "@nestjs/common";
import { BoasVindasService } from "./boas-vindas.service";

// Post automático de boas-vindas: módulo pequeno (só banco e armazenamento)
// para Parceiros e Integrações usarem sem depender do módulo do Hub.
@Module({
  providers: [BoasVindasService],
  exports: [BoasVindasService],
})
export class BoasVindasModule {}
