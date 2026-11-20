import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ListingsModule } from "../listings/listings.module";
import { VehiclesModule } from "../vehicles/vehicles.module";
import { BoasVindasModule } from "../hub/boas-vindas.module";
import { ApiKeyGuard } from "./api-key.guard";
import { PartnerIntegrationsController, PublicIntegrationsController } from "./integrations.controller";
import { IntegrationsService } from "./integrations.service";

@Module({
  imports: [AuthModule, ListingsModule, VehiclesModule, BoasVindasModule],
  controllers: [PartnerIntegrationsController, PublicIntegrationsController],
  providers: [IntegrationsService, ApiKeyGuard],
})
export class IntegrationsModule {}
