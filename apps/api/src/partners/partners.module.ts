import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ListingsModule } from "../listings/listings.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { PaymentsModule } from "../payments/payments.module";
import { PartnersController } from "./partners.controller";
import { PartnersService } from "./partners.service";
import { CnpjService } from "./cnpj.service";
import { ContactsModule } from "../marketing/contacts.module";

@Module({
  imports: [AuthModule, PaymentsModule, ListingsModule, NotificationsModule, ContactsModule],
  controllers: [PartnersController],
  providers: [PartnersService, CnpjService],
  exports: [PartnersService],
})
export class PartnersModule {}
