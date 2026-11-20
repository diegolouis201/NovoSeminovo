import { AffiliatesModule } from "../affiliates/affiliates.module";
import { Module } from "@nestjs/common";
import { PaymentsModule } from "../payments/payments.module";
import { AuthModule } from "../auth/auth.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { VehiclesModule } from "../vehicles/vehicles.module";
import { AiService } from "./ai.service";
import { ListingsController } from "./listings.controller";
import { ListingImportController } from "./listing-import.controller";
import { ListingImportService } from "./listing-import.service";
import { GeocodingService } from "./geocoding.service";
import { ListingsService } from "./listings.service";
import { SocialAssetsService } from "./social-assets.service";
import { ListingCountsController, ListingCountsService } from "./listing-counts";

@Module({
  imports: [AuthModule, NotificationsModule, VehiclesModule, PaymentsModule, AffiliatesModule],
  controllers: [ListingsController, ListingImportController, ListingCountsController],
  providers: [ListingsService, AiService, SocialAssetsService, GeocodingService, ListingImportService, ListingCountsService],
  exports: [AiService, ListingsService],
})
export class ListingsModule {}
