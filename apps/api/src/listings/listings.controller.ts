import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import {
  CreateListingInputSchema,
  FinancingSimulationInputSchema,
  UpdateListingStatusInputSchema,
  type Role,
} from "@novoseminovo/shared-types";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { OptionalJwtAuthGuard } from "../auth/optional-jwt-auth.guard";
import { parseOrBadRequest } from "../common/parse";
import { ListingsService, type ListingSearchQuery } from "./listings.service";

@Controller("listings")
export class ListingsController {
  constructor(private readonly listingsService: ListingsService) {}

  @Get()
  findAll(@Query() query: ListingSearchQuery) {
    return this.listingsService.search(query);
  }

  // Precisa vir antes de ":id" — senão o Nest casaria "mine" como um :id.
  @UseGuards(JwtAuthGuard)
  @Get("mine")
  findMine(@CurrentUser() user: { id: string }) {
    return this.listingsService.listMine(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  create(@CurrentUser() user: { id: string }, @Body() body: unknown) {
    const input = parseOrBadRequest(CreateListingInputSchema, body);
    return this.listingsService.create(user.id, input);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get(":id")
  findOne(@CurrentUser() user: { id: string; role: Role } | undefined, @Param("id") id: string) {
    return this.listingsService.getDetail(id, user);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(":id/status")
  updateStatus(@CurrentUser() user: { id: string }, @Param("id") id: string, @Body() body: unknown) {
    const input = parseOrBadRequest(UpdateListingStatusInputSchema, body);
    return this.listingsService.updateStatus(id, user.id, input);
  }

  @Post(":id/financing-simulations")
  simulate(@Param("id") id: string, @Body() body: unknown) {
    const input = parseOrBadRequest(FinancingSimulationInputSchema.omit({ listingId: true }), body);
    return this.listingsService.simulateFinancing(id, input);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Post(":id/whatsapp-clicks")
  registerWhatsappClick(@CurrentUser() user: { id: string } | undefined, @Param("id") id: string) {
    return this.listingsService.registerWhatsappClick(id, user?.id);
  }
}
