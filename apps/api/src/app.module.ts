import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "./prisma/prisma.module";
import { ListingsModule } from "./listings/listings.module";
import { AuthModule } from "./auth/auth.module";
import { FavoritesModule } from "./favorites/favorites.module";
import { ConversationsModule } from "./conversations/conversations.module";
import { PartnersModule } from "./partners/partners.module";
import { AdminModule } from "./admin/admin.module";
import { SavedSearchesModule } from "./saved-searches/saved-searches.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    ListingsModule,
    AuthModule,
    FavoritesModule,
    ConversationsModule,
    PartnersModule,
    AdminModule,
    SavedSearchesModule,
  ],
})
export class AppModule {}
