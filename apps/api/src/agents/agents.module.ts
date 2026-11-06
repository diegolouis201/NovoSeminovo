import { Module } from "@nestjs/common";
import { ContactsModule } from "../marketing/contacts.module";
import { AuthModule } from "../auth/auth.module";
import { ListingsModule } from "../listings/listings.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { PartnersModule } from "../partners/partners.module";
import { AdminModule } from "../admin/admin.module";
import { FinancingDealsModule } from "../financing-deals/financing-deals.module";
import { AgentsController } from "./agents.controller";
import { AgentsService } from "./agents.service";
import { CredihomeService } from "./credihome.service";
import { WhatsAppController } from "./whatsapp.controller";
import { WhatsAppService } from "./whatsapp.service";

@Module({
  imports: [AuthModule, ListingsModule, NotificationsModule, PartnersModule, AdminModule, FinancingDealsModule, ContactsModule],
  controllers: [AgentsController, WhatsAppController],
  providers: [AgentsService, WhatsAppService, CredihomeService],
  exports: [AgentsService],
})
export class AgentsModule {}
