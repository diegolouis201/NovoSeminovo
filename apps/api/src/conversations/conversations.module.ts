import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { ConversationsController, ListingContactController } from "./conversations.controller";
import { ListingContactService } from "./listing-contact.service";
import { ContactsModule } from "../marketing/contacts.module";
import { ConversationsGateway } from "./conversations.gateway";
import { ConversationsService } from "./conversations.service";

@Module({
  imports: [AuthModule, NotificationsModule, ContactsModule],
  controllers: [ConversationsController, ListingContactController],
  providers: [ConversationsService, ConversationsGateway, ListingContactService],
})
export class ConversationsModule {}
