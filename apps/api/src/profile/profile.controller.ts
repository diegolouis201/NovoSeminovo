import { Body, Controller, Get, Patch, Post, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
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

  // Reenviar o código dispara e-mail de verdade (quando RESEND_API_KEY está
  // configurada) — limite baixo pra não virar spam de reenvio.
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @Post("email/send-verification")
  sendEmailVerification(@CurrentUser() user: { id: string }) {
    return this.profileService.sendEmailVerification(user.id);
  }

  // Reforço em cima do limite de tentativas já contado no banco (ver
  // ProfileService.verifyEmail) — aqui é só pra atrasar a tentativa
  // automatizada, não substitui aquele contador.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post("email/verify")
  verifyEmail(@CurrentUser() user: { id: string }, @Body() body: unknown) {
    const input = parseOrBadRequest(VerifyEmailInputSchema, body);
    return this.profileService.verifyEmail(user.id, input.code);
  }
}
