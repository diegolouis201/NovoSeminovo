import { Body, Controller, Get, Patch, Post, UseGuards } from "@nestjs/common";
import { UpdateProfileInputSchema, VerifyEmailInputSchema } from "@novoseminovo/shared-types";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { parseOrBadRequest } from "../common/parse";
import { ProfileService } from "./profile.service";

@UseGuards(JwtAuthGuard)
@Controller("me")
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get("profile")
  getProfile(@CurrentUser() user: { id: string }) {
    return this.profileService.getProfile(user.id);
  }

  @Patch("profile")
  updateProfile(@CurrentUser() user: { id: string }, @Body() body: unknown) {
    const input = parseOrBadRequest(UpdateProfileInputSchema, body);
    return this.profileService.updateProfile(user.id, input);
  }

  @Post("email/send-verification")
  sendEmailVerification(@CurrentUser() user: { id: string }) {
    return this.profileService.sendEmailVerification(user.id);
  }

  @Post("email/verify")
  verifyEmail(@CurrentUser() user: { id: string }, @Body() body: unknown) {
    const input = parseOrBadRequest(VerifyEmailInputSchema, body);
    return this.profileService.verifyEmail(user.id, input.code);
  }
}
