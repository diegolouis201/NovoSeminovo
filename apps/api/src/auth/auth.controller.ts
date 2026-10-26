import { Body, Controller, Post, Req } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request } from "express";
import { ForgotPasswordInputSchema, LoginInputSchema, RegisterInputSchema, ResetPasswordInputSchema } from "@novoseminovo/shared-types";
import { acquisitionFrom } from "../common/acquisition";
import { parseOrBadRequest } from "../common/parse";
import { AuthService } from "./auth.service";
import { PasswordResetService } from "./password-reset.service";

// Bem mais apertado que o limite global (ver app.module.ts) — login e
// registro são os alvos óbvios de força bruta/criação de conta em massa.
const AUTH_THROTTLE = { default: { limit: 8, ttl: 60_000 } };

@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly passwordReset: PasswordResetService,
  ) {}

  @Throttle(AUTH_THROTTLE)
  @Post("register")
  register(@Body() body: unknown, @Req() request: Request) {
    const input = parseOrBadRequest(RegisterInputSchema, body);
    return this.authService.register(input, acquisitionFrom(request));
  }

  @Throttle(AUTH_THROTTLE)
  @Post("login")
  login(@Body() body: unknown) {
    const input = parseOrBadRequest(LoginInputSchema, body);
    return this.authService.login(input);
  }

  // Cada pedido manda um e-mail: limite bem baixo.
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @Post("forgot-password")
  forgotPassword(@Body() body: unknown) {
    return this.passwordReset.request(parseOrBadRequest(ForgotPasswordInputSchema, body).email);
  }

  @Throttle(AUTH_THROTTLE)
  @Post("reset-password")
  resetPassword(@Body() body: unknown) {
    const input = parseOrBadRequest(ResetPasswordInputSchema, body);
    return this.passwordReset.reset(input.token, input.password);
  }
}
