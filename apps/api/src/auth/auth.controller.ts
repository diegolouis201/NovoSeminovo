import { Body, Controller, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { LoginInputSchema, RegisterInputSchema } from "@novoseminovo/shared-types";
import { acquisitionFrom } from "../common/acquisition";
import { parseOrBadRequest } from "../common/parse";
import { AuthService } from "./auth.service";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("register")
  register(@Body() body: unknown, @Req() request: Request) {
    const input = parseOrBadRequest(RegisterInputSchema, body);
    return this.authService.register(input, acquisitionFrom(request));
  }

  @Post("login")
  login(@Body() body: unknown) {
    const input = parseOrBadRequest(LoginInputSchema, body);
    return this.authService.login(input);
  }
}
