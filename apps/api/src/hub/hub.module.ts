import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { CrmModule } from "../crm/crm.module";
import { FinanceiroController } from "./financeiro.controller";
import { FinanceiroService } from "./financeiro.service";
import { HubController } from "./hub.controller";
import { HubGuard } from "./hub.guard";
import { HubService } from "./hub.service";

@Module({
  imports: [AuthModule, CrmModule],
  controllers: [HubController, FinanceiroController],
  providers: [HubService, HubGuard, FinanceiroService],
})
export class HubModule {}
