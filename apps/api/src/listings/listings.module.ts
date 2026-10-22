import { Module } from "@nestjs/common";
import { PaymentsModule } from "../payments/payments.module";
import { AuthModule } from "../auth/auth.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { VehiclesModule } from "../vehicles/vehicles.module";
import { AiService } from "./ai.service";
import { ListingsController } from "./listings.controller";
import { ListingsService } from "./listings.service";
import { SocialAssetsService } from "./social-assets.service";

@Module({
  imports: [AuthModule, NotificationsModule, VehiclesModule, PaymentsModule],
  controllers: [ListingsController],
  providers: [ListingsService, AiService, SocialAssetsService],
  exports: [AiService, ListingsService],
})
export class ListingsModule {}
