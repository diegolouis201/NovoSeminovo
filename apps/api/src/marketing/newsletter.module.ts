import { Module } from "@nestjs/common";
import { ContactsModule } from "./contacts.module";
import { NewsletterController } from "./newsletter.controller";

@Module({
  imports: [ContactsModule],
  controllers: [NewsletterController],
})
export class NewsletterModule {}
