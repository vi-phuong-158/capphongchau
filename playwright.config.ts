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
  use: {
    baseURL: previewBaseURL ?? "http://127.0.0.1:3001",
    trace: "on-first-retry",
  },
  webServer: previewBaseURL
    ? undefined
    : {
        command: "node node_modules/next/dist/bin/next dev -p 3001",
        url: "http://127.0.0.1:3001",
        reuseExistingServer: false,
      },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
