import type { AuthUser } from "@novoseminovo/shared-types";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: AuthUser["role"];
    } & DefaultSession["user"];
    // JWT emitido por POST /auth/login — reenviado como Bearer token nas
    // chamadas autenticadas a apps/api (ver lib/api.ts).
    accessToken: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: AuthUser["role"];
    accessToken?: string;
  }
}
