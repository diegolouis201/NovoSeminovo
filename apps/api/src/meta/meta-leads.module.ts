import { Module } from "@nestjs/common";
import { ContactsModule } from "../marketing/contacts.module";
import { SalesModule } from "../sales/sales.module";
import { MetaLeadsController } from "./meta-leads.controller";
import { MetaLeadsService } from "./meta-leads.service";

// Lead Ads da Meta → CRM (webhook + rotina de segurança). Ver meta-leads.ts.
@Module({
  imports: [SalesModule, ContactsModule],
  controllers: [MetaLeadsController],
  providers: [MetaLeadsService],
})
export class MetaLeadsModule {}
