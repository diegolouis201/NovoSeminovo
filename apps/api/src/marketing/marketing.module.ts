import { Module } from "@nestjs/common";
import { AdminModule } from "../admin/admin.module";
import { AdminGuard } from "../admin/admin.guard";
import { ArchitectModule } from "../architect/architect.module";
import { AuthModule } from "../auth/auth.module";
import { EmailModule } from "../email/email.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { OperationsModule } from "../operations/operations.module";
import { MarketingArtService } from "./art.service";
import { ContactsModule } from "./contacts.module";
import { EmailMarketingService } from "./email-marketing.service";
import { MarketingAdminController, MarketingPublicController } from "./marketing.controller";
import { MarketingService } from "./marketing.service";
import { MarketingToolsService } from "./marketing-tools.service";
import { MarketingPostsService } from "./posts.service";

// Marketing de ponta a ponta: posts do Instagram, e-mail, contatos e
// sequências, operados pelo agente de Marketing com aprovação do dono.
@Module({
  imports: [AuthModule, AdminModule, NotificationsModule, EmailModule, ArchitectModule, OperationsModule, ContactsModule],
  controllers: [MarketingAdminController, MarketingPublicController],
  providers: [MarketingArtService, MarketingPostsService, EmailMarketingService, MarketingService, MarketingToolsService, AdminGuard],
})
export class MarketingModule {}
