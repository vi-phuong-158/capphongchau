import { loadServerEnvironment } from "@/modules/common/env";

/**
 * Kiểm tra cấu hình ngay khi server khởi động, để sai/thiếu biến môi trường làm hỏng
 * deploy thay vì hỏng request đầu tiên chạm Google API giữa lúc cán bộ đang nộp hồ sơ.
 *
 * Bỏ qua ở dev và lúc build vì hai môi trường đó chưa cần secret Google thật:
 * `next build` local và Playwright (chạy `next dev`) phải chạy được trên máy chưa dựng `.env`.
 */
export function register(): void {
  const isNodeServer = process.env.NEXT_RUNTIME === "nodejs";
  const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";

  if (!isNodeServer || isBuildPhase || process.env.NODE_ENV !== "production") {
    return;
  }

  loadServerEnvironment();
}
