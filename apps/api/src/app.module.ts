import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "./prisma/prisma.module";
import { ListingsModule } from "./listings/listings.module";
import { AuthModule } from "./auth/auth.module";
import { FavoritesModule } from "./favorites/favorites.module";
import { ConversationsModule } from "./conversations/conversations.module";
import { PartnersModule } from "./partners/partners.module";
import { AdminModule } from "./admin/admin.module";
import { SavedSearchesModule } from "./saved-searches/saved-searches.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { PaymentsModule } from "./payments/payments.module";
import { WebhooksModule } from "./webhooks/webhooks.module";
import { VehiclesModule } from "./vehicles/vehicles.module";
import { RebatesModule } from "./rebates/rebates.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    ListingsModule,
    AuthModule,
    FavoritesModule,
    ConversationsModule,
    PartnersModule,
    AdminModule,
    SavedSearchesModule,
    NotificationsModule,
    PaymentsModule,
    WebhooksModule,
    VehiclesModule,
    RebatesModule,
  ],
})
export class AppModule {}
