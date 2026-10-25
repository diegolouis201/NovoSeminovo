import { Module } from "@nestjs/common";
import { ContactsService } from "./contacts.service";

// Separado do MarketingModule: cadastro, parceiros e financiamento gravam
// contatos sem depender da operação de marketing inteira.
@Module({
  providers: [ContactsService],
  exports: [ContactsService],
})
export class ContactsModule {}
