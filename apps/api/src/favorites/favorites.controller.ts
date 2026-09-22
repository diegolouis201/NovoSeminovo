import { Controller, Delete, Get, Param, Post, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { FavoritesService } from "./favorites.service";

@UseGuards(JwtAuthGuard)
@Controller()
export class FavoritesController {
  constructor(private readonly favoritesService: FavoritesService) {}

  @Get("me/favorites")
  listMine(@CurrentUser() user: { id: string }) {
    return this.favoritesService.listMine(user.id);
  }

  @Get("me/favorites/ids")
  listMineIds(@CurrentUser() user: { id: string }) {
    return this.favoritesService.listMineIds(user.id);
  }

  @Post("listings/:id/favorite")
  add(@CurrentUser() user: { id: string }, @Param("id") listingId: string) {
    return this.favoritesService.add(user.id, listingId);
  }

  @Delete("listings/:id/favorite")
  remove(@CurrentUser() user: { id: string }, @Param("id") listingId: string) {
    return this.favoritesService.remove(user.id, listingId);
  }
}
