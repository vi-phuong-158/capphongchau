import { defineConfig, devices } from "@playwright/test";

/**
 * Hai chế độ chạy, phân biệt bằng một biến duy nhất:
 *
 *   - `E2E_BASE_URL` không đặt → mặc định cũ, tự dựng `next dev` cục bộ ở cổng 3001. Chỉ chạy
 *     được `tests/e2e/home.spec.ts` (smoke test không cần credential); mọi test trong
 *     `public-intake-v2.spec.ts` tự `test.skip` vì thiếu `E2E_PUBLIC_INTAKE_READY` và các biến
 *     tài khoản cán bộ.
 *   - `E2E_BASE_URL` đặt (ví dụ `https://land-ocr-180-preview.vercel.app`) → trỏ thẳng vào preview
 *     deployment thật, KHÔNG tự dựng server cục bộ (`webServer` bị bỏ qua). Đây là chế độ
 *     `npm run test:e2e:preview` dùng. Domain phải đã có Cloudflare đứng trước — cổng công khai
 *     đòi header `X-Origin-Auth` mà chỉ Cloudflare gắn được, xem `edge-guard.ts`.
 */
const previewBaseURL = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  reporter: "list",
  // Các route công khai import googleapis + postgres; Turbopack biên dịch route đó LẦN ĐẦU khi
  // request đầu tiên chạm tới, không phải lúc server báo "Ready". Nhiều worker cùng chờ một lượt
  // biên dịch nguội đó dễ vượt 30s mặc định — không phải lỗi app, chỉ là thời gian chờ quá ngắn.
  timeout: 90_000,
  use: {
    // BẮT BUỘC dùng "localhost", không phải "127.0.0.1" — phát hiện qua chạy E2E thật với upload
    // thật: `initiate` route đăng ký origin của phiên resumable Drive bằng
    // `new URL(request.url).origin`, và Next.js dev server chuẩn hóa origin đó thành
    // "http://localhost:3001" bất kể trình duyệt gọi vào bằng "127.0.0.1" hay "localhost". Nếu
    // `baseURL` ở đây dùng "127.0.0.1", trình duyệt điều hướng tới "127.0.0.1:3001" nhưng phiên
    // Drive lại đăng ký origin "localhost:3001" — hai chuỗi khác nhau dù cùng một máy — Google từ
    // chối PUT ảnh bằng lỗi CORS ("Access-Control-Allow-Origin ... không khớp origin đã gọi").
    // Không xảy ra trên Vercel preview/production vì ở đó chỉ có một domain HTTPS duy nhất.
    baseURL: previewBaseURL ?? "http://localhost:3001",
    trace: "on-first-retry",
  },
  webServer: previewBaseURL
    ? undefined
    : {
        command: "node node_modules/next/dist/bin/next dev -p 3001",
        url: "http://localhost:3001",
        reuseExistingServer: false,
      },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
