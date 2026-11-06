import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { FinancingDealsController } from "./financing-deals.controller";
import { FinancingDealsService } from "./financing-deals.service";

@Module({
  imports: [AuthModule],
  controllers: [FinancingDealsController],
  providers: [FinancingDealsService],
  exports: [FinancingDealsService],
})
export class FinancingDealsModule {}
