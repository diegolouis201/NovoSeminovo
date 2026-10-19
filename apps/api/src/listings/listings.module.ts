import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { VehiclesModule } from "../vehicles/vehicles.module";
import { AiService } from "./ai.service";
import { ListingsController } from "./listings.controller";
import { ListingsService } from "./listings.service";
import { SocialAssetsService } from "./social-assets.service";

@Module({
  imports: [AuthModule, NotificationsModule, VehiclesModule],
  controllers: [ListingsController],
  providers: [ListingsService, AiService, SocialAssetsService],
  exports: [AiService],
})
export class ListingsModule {}
