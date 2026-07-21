import { describe, expect, it } from "vitest";

import { createCsrfToken, verifyCsrfToken } from "@/modules/auth/csrf";

describe("CSRF token", () => {
  const secret = "a".repeat(32);
  const email = "anmphongandn@gmail.com";
  const createdAt = new Date("2026-07-21T00:00:00.000Z");

  it("xác nhận token cho đúng tài khoản trong thời hạn", () => {
    const token = createCsrfToken(secret, email, createdAt);
    expect(verifyCsrfToken(secret, email, token, new Date("2026-07-21T00:09:59.000Z"))).toBe(true);
  });

  it("từ chối token đã sửa, hết hạn hoặc dùng cho tài khoản khác", () => {
    const token = createCsrfToken(secret, email, createdAt);
    expect(verifyCsrfToken(secret, "other@example.com", token, createdAt)).toBe(false);
    expect(verifyCsrfToken(secret, email, `${token}x`, createdAt)).toBe(false);
    expect(verifyCsrfToken(secret, email, token, new Date("2026-07-21T00:10:01.000Z"))).toBe(false);
  });
});
