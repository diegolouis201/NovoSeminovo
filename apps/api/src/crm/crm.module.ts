import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { OperationsModule } from "../operations/operations.module";
import { SalesModule } from "../sales/sales.module";
import { AreaOrdersController, CrmController, NpsController, SalesOrdersController } from "./crm.controller";
import { NpsService } from "./nps.service";
import { NpsEmailPublicController } from "./nps-email.controller";
import { NpsEmailService } from "./nps-email.service";
import { EmailModule } from "../email/email.module";
import { CrmOrdersService } from "./crm-orders.service";
import { CrmService } from "./crm.service";

@Module({
  imports: [AuthModule, OperationsModule, SalesModule, EmailModule],
  controllers: [CrmController, AreaOrdersController, SalesOrdersController, NpsController, NpsEmailPublicController],
  providers: [CrmService, CrmOrdersService, NpsService, NpsEmailService],
  exports: [CrmService, NpsEmailService],
})
export class CrmModule {}
