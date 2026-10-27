import { Body, Controller, Get, Post, Query, Res, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Response } from "express";
import { ImportFromPageInputSchema, ImportFromTextInputSchema, ImportFromUrlInputSchema } from "@novoseminovo/shared-types";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { parseOrBadRequest } from "../common/parse";
import { ListingImportService } from "./listing-import.service";

// Importar anúncio pelo link de outro site (ver ListingImportService).
@UseGuards(JwtAuthGuard)
@Controller("listing-import")
export class ListingImportController {
  constructor(private readonly service: ListingImportService) {}

  // Cada importação é uma leitura de página + uma chamada à IA.
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  @Post()
  importFromUrl(@Body() body: unknown) {
    return this.service.importFromUrl(parseOrBadRequest(ImportFromUrlInputSchema, body).url);
  }

  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  @Post("text")
  importFromText(@Body() body: unknown) {
    const input = parseOrBadRequest(ImportFromTextInputSchema, body);
    return this.service.importFromText(input.text, input.sourceUrl);
  }

  // Extensão do Chrome (ver apps/chrome-extension).
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  @Post("page")
  importFromPage(@Body() body: unknown) {
    return this.service.importFromCapturedPage(parseOrBadRequest(ImportFromPageInputSchema, body));
  }

  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get("photo")
  async photo(@Query("url") url: string, @Res() response: Response) {
    const photo = await this.service.fetchPhoto(String(url ?? ""));
    response.setHeader("Content-Type", photo.contentType);
    response.setHeader("Cache-Control", "private, max-age=600");
    response.send(photo.buffer);
  }
}
