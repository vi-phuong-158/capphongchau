import NextAuth from "next-auth";
import { NextResponse } from "next/server";

import { authConfig } from "@/auth.config";
import { isValidInternalRedirect } from "@/lib/validation";

const { auth } = NextAuth(authConfig);

/**
 * Edge chỉ kiểm tra có session. Google Sheets dùng client Node nên allowlist/role được
 * kiểm tra lại cho từng page/API bởi `requireActiveUser`, tránh JWT cũ vẫn dùng được
 * sau khi quản trị viên khóa tài khoản.
 */
export default auth((request) => {
  if (request.auth?.user?.email) {
    const response = NextResponse.next();
    /*
     * Mọi đường dẫn trong `matcher` bên dưới đều là bề mặt của cán bộ và đều mang PII (số điện
     * thoại, CCCD, địa chỉ hộ dân). Từ khi trang `/submissions/[submissionId]` nạp sẵn hồ sơ trên
     * server, PII nằm ngay trong HTML chứ không còn chỉ trong phản hồi JSON (các route JSON tự gắn
     * `no-store` riêng). Gắn ở đây để không phụ thuộc vào mặc định của Next hay của proxy đứng
     * trước — không có trang nào trong danh sách này được phép nằm lại trong bất kỳ cache nào.
     */
    response.headers.set("cache-control", "private, no-store");
    return response;
  }

  const loginUrl = new URL("/", request.url);
  const currentUrl = new URL(request.url);
  const callbackPath = currentUrl.pathname + currentUrl.search;

  if (isValidInternalRedirect(callbackPath)) {
    loginUrl.searchParams.set("callbackUrl", callbackPath);
  } else {
    loginUrl.searchParams.set("callbackUrl", "/admin/dashboard");
  }

  return NextResponse.redirect(loginUrl);
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
    "/admin/:path*",
    "/ke-khai-ho/:path*",
    "/api/staff/:path*",
  ],
};
