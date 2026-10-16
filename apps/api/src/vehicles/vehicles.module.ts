import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { FipeService } from "./fipe.service";
import { VehiclesController } from "./vehicles.controller";
import { VehiclesService } from "./vehicles.service";

@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [VehiclesController],
  providers: [VehiclesService, FipeService],
  exports: [VehiclesService, FipeService],
})
export class VehiclesModule {}
