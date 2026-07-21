import NextAuth from "next-auth";

import { authConfig } from "@/auth.config";
import { recordDeniedSignIn, resolveActiveUser } from "@/modules/auth/authorization";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    async signIn({ user }) {
      const email = user.email?.trim().toLowerCase();
      if (!email) {
        return false;
      }

      try {
        const activeUser = await resolveActiveUser(email);
        if (activeUser) {
          return true;
        }
      } catch {
        // Không để lỗi Google/Sheets vô tình cấp quyền. Không log email hay lỗi provider.
      }

      await recordDeniedSignIn(email);
      return false;
    },
  },
});
