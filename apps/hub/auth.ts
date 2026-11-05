import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import type { HubAccess, LoginResponse } from "@novoseminovo/shared-types";
import { readSecret } from "@/lib/secret-file";
import { API_URL } from "@/lib/api";

// Login do Hub: a senha é conferida pela API (mesma conta do site) e, em
// seguida, o perfil do Hub (GET /hub/me). Quem não é da equipe não entra.
// Chave própria (HUB_AUTH_SECRET), separada da do site.
export const { handlers, auth, signIn, signOut } = NextAuth(() => ({
  secret: readSecret("HUB_AUTH_SECRET"),
  session: { strategy: "jwt", maxAge: 12 * 60 * 60 },
  pages: { signIn: "/entrar" },
  trustHost: true,
  providers: [
    Credentials({
      credentials: { email: { label: "E-mail", type: "email" }, password: { label: "Senha", type: "password" } },
      authorize: async (credentials) => {
        const email = credentials?.email;
        const password = credentials?.password;
        if (typeof email !== "string" || typeof password !== "string" || email.length > 200 || password.length > 200) return null;
        const res = await fetch(`${API_URL}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
        if (!res.ok) return null;
        const { user, accessToken } = (await res.json()) as LoginResponse;
        const me = await fetch(`${API_URL}/hub/me`, { headers: { Authorization: `Bearer ${accessToken}` } });
        if (!me.ok) return null;
        const access = (await me.json()) as HubAccess;
        return { id: user.id, name: user.name, email: user.email, accessToken, profile: access.profile };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        const u = user as { id: string; accessToken: string; profile: string };
        token.id = u.id;
        token.accessToken = u.accessToken;
        token.profile = u.profile;
      }
      return token;
    },
    session({ session, token }) {
      (session as unknown as { accessToken: string }).accessToken = token.accessToken as string;
      if (session.user) (session.user as { id?: string }).id = token.id as string;
      return session;
    },
  },
}));
