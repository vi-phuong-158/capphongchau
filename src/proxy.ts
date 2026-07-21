import NextAuth from "next-auth";
import { NextResponse } from "next/server";

import { authConfig } from "@/auth.config";

const { auth } = NextAuth(authConfig);

/**
 * Edge chỉ kiểm tra có session. Google Sheets dùng client Node nên allowlist/role được
 * kiểm tra lại cho từng page/API bởi `requireActiveUser`, tránh JWT cũ vẫn dùng được
 * sau khi quản trị viên khóa tài khoản.
 */
export default auth((request) => {
  if (request.auth?.user?.email) {
    return NextResponse.next();
  }

  return NextResponse.redirect(new URL("/", request.url));
});

export const config = { matcher: ["/profile/:path*", "/users/:path*", "/submissions/:path*"] };
