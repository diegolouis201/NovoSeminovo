import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { CreateVehicleEventInputSchema } from "@novoseminovo/shared-types";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { OptionalJwtAuthGuard } from "../auth/optional-jwt-auth.guard";
import { parseOrBadRequest } from "../common/parse";
import { VehiclesService } from "./vehicles.service";

@Controller("vehicles")
export class VehiclesController {
  constructor(private readonly vehiclesService: VehiclesService) {}

  // Público de propósito — o Passaporte Digital só funciona como prova de
  // confiança se qualquer comprador conseguir ver o histórico antes de
  // comprar, sem precisar estar logado.
  @UseGuards(OptionalJwtAuthGuard)
  @Get(":id")
  getProfile(@CurrentUser() user: { id: string } | undefined, @Param("id") id: string) {
    return this.vehiclesService.getProfile(id, user?.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post(":id/events")
  addEvent(@CurrentUser() user: { id: string }, @Param("id") id: string, @Body() body: unknown) {
    const input = parseOrBadRequest(CreateVehicleEventInputSchema, body);
    return this.vehiclesService.addEvent(id, user.id, input);
  }
}
