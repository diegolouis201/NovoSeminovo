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
import { SeguidoresService } from "./jornada-seguidores.service";
import { SeoController } from "./seo.controller";
import { SeoService } from "./seo.service";
import { ProspeccaoController, ProspeccaoSairController } from "../prospeccao/prospeccao.controller";
import { ProspeccaoSequenciasService } from "../prospeccao/sequencias.service";
import { ProspeccaoImportService } from "../prospeccao/prospeccao-import.service";

@Module({
  imports: [AuthModule, CrmModule],
  controllers: [HubController, FinanceiroController, MarketingHubController, MarketingFeedController, JornadaController, SeoController, ProspeccaoController, ProspeccaoSairController],
  providers: [HubService, BuyerLeadsService, HubGuard, FinanceiroService, MarketingHubService, JornadaService, SeguidoresService, SeoService, ProspeccaoImportService, ProspeccaoSequenciasService],
})
export class HubModule {}
