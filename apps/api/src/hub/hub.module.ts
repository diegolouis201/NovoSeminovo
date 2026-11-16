import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { CrmModule } from "../crm/crm.module";
import { FinanceiroController } from "./financeiro.controller";
import { FinanceiroService } from "./financeiro.service";
import { HubController } from "./hub.controller";
import { MarketingFeedController, MarketingHubController } from "./marketing.controller";
import { MarketingHubService } from "./marketing.service";
import { HubGuard } from "./hub.guard";
import { HubService } from "./hub.service";
import { BuyerLeadsService } from "./compradores.service";
import { JornadaController } from "./jornada.controller";
import { JornadaService } from "./jornada.service";

@Module({
  imports: [AuthModule, CrmModule],
  controllers: [HubController, FinanceiroController, MarketingHubController, MarketingFeedController, JornadaController],
  providers: [HubService, BuyerLeadsService, HubGuard, FinanceiroService, MarketingHubService, JornadaService],
})
export class HubModule {}
