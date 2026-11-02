import { Module } from "@nestjs/common";
import { ContactsModule } from "./contacts.module";
import { NewsletterController } from "./newsletter.controller";
import { ConversionsController } from "./conversions.controller";
import { ConversionsService } from "./conversions.service";

@Module({
  imports: [ContactsModule],
  controllers: [NewsletterController, ConversionsController],
  providers: [ConversionsService],
})
export class NewsletterModule {}
