import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

const isProduction = process.env.NODE_ENV === "production";

/**
 * Cấu hình không phụ thuộc Node.js để `proxy.ts` chỉ giải mã session JWT ở Edge.
 * Việc đối chiếu allowlist USERS luôn làm lại ở server Node trong authorization.ts.
 */
export const authConfig = {
  trustHost: true,
  secret: process.env.AUTH_SECRET,
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
  cookies: {
    sessionToken: {
      name: isProduction ? "__Secure-authjs.session-token" : "authjs.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: isProduction,
      },
    },
  },
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_CLIENT_ID,
      clientSecret: process.env.AUTH_GOOGLE_CLIENT_SECRET,
      authorization: { params: { prompt: "select_account", scope: "openid email profile" } },
      checks: ["pkce", "state"],
    }),
  ],
} satisfies NextAuthConfig;
