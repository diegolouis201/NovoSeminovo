import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { CrmModule } from "../crm/crm.module";
import { HubController } from "./hub.controller";
import { HubGuard } from "./hub.guard";
import { HubService } from "./hub.service";

@Module({
  imports: [AuthModule, CrmModule],
  controllers: [HubController],
  providers: [HubService, HubGuard],
})
export class HubModule {}
