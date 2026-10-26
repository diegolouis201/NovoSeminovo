import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { ContactsModule } from "../marketing/contacts.module";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { OptionalJwtAuthGuard } from "./optional-jwt-auth.guard";
import { requireStrongSecret } from "./require-strong-secret";

@Module({
  imports: [
    JwtModule.register({
      global: true,
      // Nunca um valor padrão aqui — um segredo conhecido no código-fonte
      // deixaria qualquer pessoa forjar um token de admin pra qualquer
      // usuário. requireStrongSecret derruba o boot da API se a variável
      // de ambiente não estiver configurada (ou for curta demais pra
      // resistir a força bruta).
      secret: requireStrongSecret("JWT_SECRET"),
      signOptions: { expiresIn: "30d" },
    }),
    ContactsModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard, OptionalJwtAuthGuard],
  exports: [JwtAuthGuard, OptionalJwtAuthGuard, AuthService],
})
export class AuthModule {}
