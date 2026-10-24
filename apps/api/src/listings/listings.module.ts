import { AffiliatesModule } from "../affiliates/affiliates.module";
import { Module } from "@nestjs/common";
import { PaymentsModule } from "../payments/payments.module";
import { AuthModule } from "../auth/auth.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { VehiclesModule } from "../vehicles/vehicles.module";
import { AiService } from "./ai.service";
import { ListingsController } from "./listings.controller";
import { GeocodingService } from "./geocoding.service";
import { ListingsService } from "./listings.service";
import { SocialAssetsService } from "./social-assets.service";

@Module({
  imports: [AuthModule, NotificationsModule, VehiclesModule, PaymentsModule, AffiliatesModule],
  controllers: [ListingsController],
  providers: [ListingsService, AiService, SocialAssetsService, GeocodingService],
  exports: [AiService, ListingsService],
})
export class ListingsModule {}
