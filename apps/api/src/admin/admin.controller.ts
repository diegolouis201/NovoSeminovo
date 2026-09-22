import { Body, Controller, Get, Param, Patch, UseGuards } from "@nestjs/common";
import { ModerateListingInputSchema } from "@novoseminovo/shared-types";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { parseOrBadRequest } from "../common/parse";
import { AdminGuard } from "./admin.guard";
import { AdminService } from "./admin.service";

@UseGuards(JwtAuthGuard, AdminGuard)
@Controller("admin")
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get("listings/pending")
  listPendingListings() {
    return this.adminService.listPendingListings();
  }

  @Patch("listings/:id/moderate")
  moderateListing(@CurrentUser() user: { id: string }, @Param("id") id: string, @Body() body: unknown) {
    const input = parseOrBadRequest(ModerateListingInputSchema, body);
    return this.adminService.moderateListing(user.id, id, input);
  }

  @Get("partners/pending")
  listPendingPartners() {
    return this.adminService.listPendingPartners();
  }

  @Patch("partners/:id/verify")
  verifyPartner(@Param("id") id: string) {
    return this.adminService.verifyPartner(id);
  }
}
