import { Module } from "@nestjs/common";
import { CatalogFeedsController } from "./catalog-feeds.controller";
import { CatalogFeedsService } from "./catalog-feeds.service";

@Module({ controllers: [CatalogFeedsController], providers: [CatalogFeedsService] })
export class CatalogFeedsModule {}
