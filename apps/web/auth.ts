import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import type { AuthUser, LoginResponse } from "@novoseminovo/shared-types";

// A sessão é gerenciada aqui (cookie do NextAuth), mas quem valida a senha e
// possui os dados do usuário é sempre apps/api — o site nunca fala com o
// banco diretamente, pelo mesmo motivo de lib/api.ts.
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/entrar" },
  // Necessário fora da Vercel (self-host): sem isso o Auth.js rejeita o
  // host da requisição por segurança. Ver https://errors.authjs.dev#untrustedhost
  trustHost: true,
  providers: [
    Credentials({
      credentials: {
        email: { label: "E-mail", type: "email" },
        password: { label: "Senha", type: "password" },
      },
      authorize: async (credentials) => {
        const email = credentials?.email;
        const password = credentials?.password;
        if (typeof email !== "string" || typeof password !== "string") return null;

        const res = await fetch(`${API_URL}/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        if (!res.ok) return null;

        const { user, accessToken } = (await res.json()) as LoginResponse;
        return { ...user, accessToken };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        const authUser = user as AuthUser & { accessToken: string };
        token.id = authUser.id;
        token.role = authUser.role;
        token.accessToken = authUser.accessToken;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as AuthUser["role"];
        session.accessToken = token.accessToken as string;
      }
      return session;
    },
  },
});
