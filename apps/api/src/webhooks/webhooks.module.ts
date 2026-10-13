import { Module } from "@nestjs/common";
import { PartnersModule } from "../partners/partners.module";
import { PaymentsModule } from "../payments/payments.module";
import { WebhooksController } from "./webhooks.controller";

@Module({
  imports: [PaymentsModule, PartnersModule],
  controllers: [WebhooksController],
})
export class WebhooksModule {}
