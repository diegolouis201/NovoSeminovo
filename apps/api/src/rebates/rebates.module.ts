import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { RebatesController } from "./rebates.controller";
import { RebatesService } from "./rebates.service";

@Module({
  imports: [AuthModule],
  controllers: [RebatesController],
  providers: [RebatesService],
  exports: [RebatesService],
})
export class RebatesModule {}
