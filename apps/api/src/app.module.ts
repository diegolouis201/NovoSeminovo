import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "./prisma/prisma.module";
import { ListingsModule } from "./listings/listings.module";

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, ListingsModule],
})
export class AppModule {}
