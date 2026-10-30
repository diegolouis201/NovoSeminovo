import { AffiliatesModule } from "./affiliates/affiliates.module";
import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
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
import { ProfileModule } from "./profile/profile.module";
import { AgentsModule } from "./agents/agents.module";
import { IntegrationsModule } from "./integrations/integrations.module";
import { ArchitectModule } from "./architect/architect.module";
import { OperationsModule } from "./operations/operations.module";
import { NewsletterModule } from "./marketing/newsletter.module";
import { HealthController } from "./common/health.controller";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Limite global por IP (ver auth.controller.ts pro limite mais
    // apertado de login/registro, que sobrescreve este default via
    // @Throttle) — sem isto, nada impedia tentar senha ou criar conta
    // infinitamente. WebhooksController usa @SkipThrottle() porque quem
    // chama lá é o Stripe/WhatsApp/Resend, não uma pessoa num navegador.
    ThrottlerModule.forRoot([{ name: "default", ttl: 60_000, limit: 120 }]),
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
    ProfileModule,
    AgentsModule,
    IntegrationsModule,
    ArchitectModule,
    OperationsModule,
    NewsletterModule,
    AffiliatesModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
