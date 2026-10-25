import { Module } from "@nestjs/common";
import { ContactsModule } from "../marketing/contacts.module";
import { AuthModule } from "../auth/auth.module";
import { ListingsModule } from "../listings/listings.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { PartnersModule } from "../partners/partners.module";
import { AdminModule } from "../admin/admin.module";
import { RebatesModule } from "../rebates/rebates.module";
import { AgentsController } from "./agents.controller";
import { AgentsService } from "./agents.service";
import { WhatsAppController } from "./whatsapp.controller";
import { WhatsAppService } from "./whatsapp.service";

@Module({
  imports: [AuthModule, ListingsModule, NotificationsModule, PartnersModule, AdminModule, RebatesModule, ContactsModule],
  controllers: [AgentsController, WhatsAppController],
  providers: [AgentsService, WhatsAppService],
  exports: [AgentsService],
})
export class AgentsModule {}
