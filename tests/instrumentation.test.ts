import { afterEach, describe, expect, it, vi } from "vitest";

import { register } from "@/instrumentation";
import { EnvironmentValidationError } from "@/modules/common/env";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("kiểm tra cấu hình lúc server khởi động", () => {
  it("bỏ qua ở dev để máy chưa dựng .env vẫn chạy được next dev và Playwright", () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("NODE_ENV", "development");

    expect(() => register()).not.toThrow();
  });

  it("bỏ qua trong lúc next build vì build chưa cần secret Google thật", () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PHASE", "phase-production-build");

    expect(() => register()).not.toThrow();
  });

  it("ném lỗi ngay khi server production thiếu biến môi trường bắt buộc", () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PHASE", undefined);
    vi.stubEnv("GOOGLE_DRIVE_REFRESH_TOKEN", undefined);

    expect(() => register()).toThrow(EnvironmentValidationError);
  });
});
