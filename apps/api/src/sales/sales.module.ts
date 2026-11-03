import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { EmailModule } from "../email/email.module";
import { SalesController, SalesTeamController } from "./sales.controller";
import { SalesService } from "./sales.service";

@Module({
  imports: [AuthModule, EmailModule],
  controllers: [SalesController, SalesTeamController],
  providers: [SalesService],
  exports: [SalesService],
})
export class SalesModule {}
