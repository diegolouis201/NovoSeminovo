import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { OperationsModule } from "../operations/operations.module";
import { SalesModule } from "../sales/sales.module";
import { AreaOrdersController, CrmController, NpsController, SalesOrdersController } from "./crm.controller";
import { NpsService } from "./nps.service";
import { CrmOrdersService } from "./crm-orders.service";
import { CrmService } from "./crm.service";

@Module({
  imports: [AuthModule, OperationsModule, SalesModule],
  controllers: [CrmController, AreaOrdersController, SalesOrdersController, NpsController],
  providers: [CrmService, CrmOrdersService, NpsService],
})
export class CrmModule {}
