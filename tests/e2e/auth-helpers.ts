/**
 * Đăng nhập cho test E2E mà KHÔNG đi qua Google OAuth thật.
 *
 * next-auth v5 (JWT strategy) chỉ cần một cookie phiên hợp lệ — bản thân cookie là JWT được mã
 * hóa bằng `AUTH_SECRET`. `@auth/core/jwt`.`encode()` là API chính thức để tạo JWT đó, cùng thuật
 * toán server dùng để giải mã (`A256CBC-HS512`). Test dùng đúng hàm này để mô phỏng một phiên đăng
 * nhập thật, thay vì tự động hóa màn hình chọn tài khoản Google — thứ Playwright không kiểm soát
 * được (thuộc domain accounts.google.com, ngoài tầm test) và các tài khoản test thật cũng không
 * nên có mật khẩu lưu trong CI.
 *
 * Vẫn kiểm đúng đường thật: cookie tạo ra ở đây đi qua nguyên vẹn `requireActiveUser` ở server —
 * nếu email không có trong `public.users` hoặc bị khóa, request vẫn bị từ chối như một phiên thật.
 * Trái với việc mock `requireActiveUser` (như `tests/assisted-submissions-route.test.ts`), test E2E
 * không mock gì — kiểm toàn bộ chuỗi thật từ cookie tới cơ sở dữ liệu.
 *
 * Yêu cầu: `AUTH_SECRET` phải là secret THẬT của môi trường preview đang test — biến này đã là bí
 * mật máy chủ, chỉ người có quyền truy cập preview mới chạy được các test dùng helper này.
 */
import { encode } from "@auth/core/jwt";
import type { BrowserContext } from "@playwright/test";

const SESSION_COOKIE_NAME = "authjs.session-token";
const SESSION_SECURE_COOKIE_NAME = "__Secure-authjs.session-token";
const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60; // khớp `session.maxAge` ở auth.config.ts

function cookieDomain(baseURL: string): string {
  return new URL(baseURL).hostname;
}

/**
 * `true` khi preview chạy qua HTTPS thật (Vercel preview/production luôn vậy) — quyết định tên
 * cookie đúng như `auth.config.ts` (`isProduction ? "__Secure-..." : "..."`, dựa trên
 * `NODE_ENV === "production"`, và Vercel build cả preview lẫn production với NODE_ENV=production).
 * Ghi đè bằng `E2E_SESSION_COOKIE_SECURE=false` chỉ khi test nhắm vào `next dev` cục bộ qua HTTP.
 */
function isSecureCookie(baseURL: string): boolean {
  if (process.env.E2E_SESSION_COOKIE_SECURE === "false") return false;
  if (process.env.E2E_SESSION_COOKIE_SECURE === "true") return true;
  return new URL(baseURL).protocol === "https:";
}

/**
 * Gắn cookie phiên đăng nhập hợp lệ cho `email` vào `context`. Mọi trang mở từ context này sau đó
 * coi như đã đăng nhập — `requireActiveUser` vẫn tự đối chiếu email với bảng `users` như bình
 * thường, nên tài khoản không tồn tại hoặc bị khóa vẫn bị từ chối đúng cách.
 */
export async function signInAs(
  context: BrowserContext,
  email: string,
  baseURL: string,
): Promise<void> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error(
      "Thiếu AUTH_SECRET — cần secret THẬT của môi trường preview để mã hóa cookie phiên test.",
    );
  }

  const secure = isSecureCookie(baseURL);
  const cookieName = secure ? SESSION_SECURE_COOKIE_NAME : SESSION_COOKIE_NAME;
  const issuedAt = Math.floor(Date.now() / 1000);

  const token = await encode({
    secret,
    salt: cookieName,
    maxAge: SESSION_MAX_AGE_SECONDS,
    token: {
      email,
      name: email,
      sub: email,
      iat: issuedAt,
      exp: issuedAt + SESSION_MAX_AGE_SECONDS,
      jti: crypto.randomUUID(),
    },
  });

  await context.addCookies([
    {
      name: cookieName,
      value: token,
      domain: cookieDomain(baseURL),
      path: "/",
      httpOnly: true,
      secure,
      sameSite: "Lax",
    },
  ]);
}
