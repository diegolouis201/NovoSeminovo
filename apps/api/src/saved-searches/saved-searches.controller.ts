import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { CreateSavedSearchInputSchema, UpdateSavedSearchInputSchema } from "@novoseminovo/shared-types";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { parseOrBadRequest } from "../common/parse";
import { SavedSearchesService } from "./saved-searches.service";

@UseGuards(JwtAuthGuard)
@Controller("saved-searches")
export class SavedSearchesController {
  constructor(private readonly savedSearchesService: SavedSearchesService) {}

  @Get("mine")
  listMine(@CurrentUser() user: { id: string }) {
    return this.savedSearchesService.listMine(user.id);
  }

  @Post()
  create(@CurrentUser() user: { id: string }, @Body() body: unknown) {
    const input = parseOrBadRequest(CreateSavedSearchInputSchema, body);
    return this.savedSearchesService.create(user.id, input);
  }

  @Patch(":id")
  updateAlert(@CurrentUser() user: { id: string }, @Param("id") id: string, @Body() body: unknown) {
    const input = parseOrBadRequest(UpdateSavedSearchInputSchema, body);
    return this.savedSearchesService.updateAlert(user.id, id, input.alertEnabled);
  }

  @Delete(":id")
  remove(@CurrentUser() user: { id: string }, @Param("id") id: string) {
    return this.savedSearchesService.remove(user.id, id);
  }
}
