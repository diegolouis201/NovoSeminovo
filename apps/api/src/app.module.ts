import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "./prisma/prisma.module";
import { ListingsModule } from "./listings/listings.module";
import { AuthModule } from "./auth/auth.module";

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, ListingsModule, AuthModule],
})
export class AppModule {}
