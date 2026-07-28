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

// Next.js đọc `matcher` lúc build nên bắt buộc là literal tĩnh — không tách hằng số ra nơi khác
// được. Bề mặt công khai `/ke-khai` và `/api/public/*` phải nằm ngoài danh sách này; cả hai chiều
// được khóa bằng test trong `tests/public-surface-guard.test.ts` (PLAN_NL §10.1).
//
// `/ke-khai-ho` là chế độ cán bộ hỗ trợ kê khai — chỉ khác `/ke-khai` ở chỗ **bắt buộc đăng
// nhập**. Đây là lớp chặn thứ nhất; `requireActiveUser` trong trang và trong route vẫn kiểm lại
// vai trò, vì JWT cũ có thể còn hạn sau khi quản trị viên khóa tài khoản.
export const config = {
  matcher: [
    "/profile/:path*",
    "/users/:path*",
    "/submissions/:path*",
    "/ke-khai-ho/:path*",
    "/api/staff/:path*",
  ],
};
