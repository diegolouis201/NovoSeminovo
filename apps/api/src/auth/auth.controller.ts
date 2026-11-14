import { Body, Controller, Post, Req, Optional } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request } from "express";
import { ForgotPasswordInputSchema, LoginInputSchema, RegisterInputSchema, ResetPasswordInputSchema } from "@novoseminovo/shared-types";
import { acquisitionFrom } from "../common/acquisition";
import { metaContextFrom } from "../meta/meta-conversions";
import { MetaConversionsService } from "../meta/meta-conversions.service";
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
    @Optional() private readonly meta?: MetaConversionsService,
  ) {}

  @Throttle(AUTH_THROTTLE)
  @Post("register")
  async register(@Body() body: unknown, @Req() request: Request) {
    const input = parseOrBadRequest(RegisterInputSchema, body);
    const user = await this.authService.register(input, acquisitionFrom(request));
    // Conversão para a Meta (só com aceite dos cookies; não espera a resposta).
    void this.meta?.track("CompleteRegistration", metaContextFrom(request), { userId: user.id, email: input.email, phone: input.phone }, "conta");
    return user;
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
