import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { OperationsModule } from "../operations/operations.module";
import { SalesModule } from "../sales/sales.module";
import { AreaOrdersController, CrmController, SalesOrdersController } from "./crm.controller";
import { CrmOrdersService } from "./crm-orders.service";
import { CrmService } from "./crm.service";

@Module({
  imports: [AuthModule, OperationsModule, SalesModule],
  controllers: [CrmController, AreaOrdersController, SalesOrdersController],
  providers: [CrmService, CrmOrdersService],
})
export class CrmModule {}
