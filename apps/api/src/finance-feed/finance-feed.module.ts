import { Module } from "@nestjs/common";
import { FinanceFeedController } from "./finance-feed.controller";
import { FinanceFeedService } from "./finance-feed.service";

@Module({ controllers: [FinanceFeedController], providers: [FinanceFeedService] })
export class FinanceFeedModule {}
