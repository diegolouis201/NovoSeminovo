import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { VehiclesModule } from "../vehicles/vehicles.module";
import { AiService } from "./ai.service";
import { ListingsController } from "./listings.controller";
import { ListingsService } from "./listings.service";

@Module({
  imports: [AuthModule, NotificationsModule, VehiclesModule],
  controllers: [ListingsController],
  providers: [ListingsService, AiService],
  exports: [AiService],
})
export class ListingsModule {}
