import { Module } from "@nestjs/common";
import { ListingsModule } from "../listings/listings.module";
import { PartnersModule } from "../partners/partners.module";
import { PaymentsModule } from "../payments/payments.module";
import { WebhooksController } from "./webhooks.controller";

@Module({
  imports: [PaymentsModule, PartnersModule, ListingsModule],
  controllers: [WebhooksController],
})
export class WebhooksModule {}
