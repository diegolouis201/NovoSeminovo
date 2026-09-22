import { Body, Controller, Post } from "@nestjs/common";
import { LoginInputSchema, RegisterInputSchema } from "@novoseminovo/shared-types";
import { parseOrBadRequest } from "../common/parse";
import { AuthService } from "./auth.service";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("register")
  register(@Body() body: unknown) {
    const input = parseOrBadRequest(RegisterInputSchema, body);
    return this.authService.register(input);
  }

  @Post("login")
  login(@Body() body: unknown) {
    const input = parseOrBadRequest(LoginInputSchema, body);
    return this.authService.login(input);
  }
}
