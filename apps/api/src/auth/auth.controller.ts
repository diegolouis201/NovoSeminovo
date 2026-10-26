import { Body, Controller, Post, Req } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request } from "express";
import { LoginInputSchema, RegisterInputSchema } from "@novoseminovo/shared-types";
import { acquisitionFrom } from "../common/acquisition";
import { parseOrBadRequest } from "../common/parse";
import { AuthService } from "./auth.service";

// Bem mais apertado que o limite global (ver app.module.ts) — login e
// registro são os alvos óbvios de força bruta/criação de conta em massa.
const AUTH_THROTTLE = { default: { limit: 8, ttl: 60_000 } };

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

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
}
