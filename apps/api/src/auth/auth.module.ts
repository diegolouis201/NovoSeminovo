import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { ContactsModule } from "../marketing/contacts.module";
import { EmailModule } from "../email/email.module";
import { PasswordResetService } from "./password-reset.service";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { OptionalJwtAuthGuard } from "./optional-jwt-auth.guard";
import { currentSecret } from "./secret-file";

@Module({
  imports: [
    JwtModule.register({
      global: true,
      // Nunca um valor padrão aqui — um segredo conhecido no código-fonte
      // deixaria qualquer pessoa forjar um token de admin pra qualquer
      // usuário. A chave vem do ARQUIVO do servidor (ver secret-file.ts),
      // relida a cada minuto; a primeira leitura já no boot derruba a API
      // se o arquivo faltar ou a chave for fraca.
      secret: currentSecret("JWT_SECRET"),
      secretOrKeyProvider: () => currentSecret("JWT_SECRET"),
      signOptions: { expiresIn: "30d" },
    }),
    ContactsModule,
    EmailModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, PasswordResetService, JwtAuthGuard, OptionalJwtAuthGuard],
  exports: [JwtAuthGuard, OptionalJwtAuthGuard, AuthService, PasswordResetService],
})
export class AuthModule {}
