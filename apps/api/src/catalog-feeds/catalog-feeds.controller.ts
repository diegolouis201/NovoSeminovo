import { Controller, Get, Res } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Response } from "express";
import { CatalogFeedsService, type CatalogFeed } from "./catalog-feeds.service";

// Feeds de catálogo da Meta (Gerenciador de Comércio → Catálogo → Fontes de
// dados → Feed de dados agendado). Públicos e sem login porque a Meta busca o
// link sozinha: por isso só sai dado que já é público na página do anúncio
// (ver meta-catalog.ts). Só GET, sem parâmetro nenhum de entrada.
// Ficam na API (api.<domínio>/feeds/meta/...) porque é ela que lê o banco; o
// site só repassaria o mesmo XML.
@Controller("feeds/meta")
@Throttle({ default: { limit: 30, ttl: 60_000 } })
export class CatalogFeedsController {
  constructor(private readonly feeds: CatalogFeedsService) {}

  @Get("veiculos.xml")
  async vehicles(@Res({ passthrough: true }) res: Response): Promise<string> {
    return send(res, await this.feeds.vehicleFeed());
  }

  @Get("imoveis.xml")
  async homes(@Res({ passthrough: true }) res: Response): Promise<string> {
    return send(res, await this.feeds.homeListingFeed());
  }
}

function send(res: Response, feed: CatalogFeed): string {
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.setHeader("X-Robots-Tag", "noindex");
  res.setHeader("X-Feed-Itens", String(feed.included));
  res.setHeader("X-Feed-Sem-Foto", String(feed.skippedNoPhoto));
  return feed.xml;
}
