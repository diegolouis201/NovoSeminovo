import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { FinancingSimulationInputSchema } from "@novoseminovo/shared-types";
import { parseOrBadRequest } from "../common/parse";
import { ListingsService, type ListingSearchQuery } from "./listings.service";

@Controller("listings")
export class ListingsController {
  constructor(private readonly listingsService: ListingsService) {}

  @Get()
  findAll(@Query() query: ListingSearchQuery) {
    return this.listingsService.search(query);
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.listingsService.getDetail(id);
  }

  @Post(":id/financing-simulations")
  simulate(@Param("id") id: string, @Body() body: unknown) {
    const input = parseOrBadRequest(FinancingSimulationInputSchema.omit({ listingId: true }), body);
    return this.listingsService.simulateFinancing(id, input);
  }
}
