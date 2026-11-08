import { Module } from "@nestjs/common";
import { FipeService } from "./fipe.service";
import { VehiclesService } from "./vehicles.service";

// Sem controller: o perfil público do carro pela placa foi
// descontinuado em 08/11/2026. Ficam o serviço interno usado no cadastro do
// anúncio (placa → hash) e a FIPE do cadastro.
@Module({
  providers: [VehiclesService, FipeService],
  exports: [VehiclesService, FipeService],
})
export class VehiclesModule {}
