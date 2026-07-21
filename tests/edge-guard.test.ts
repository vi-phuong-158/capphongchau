import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ORIGIN_AUTH_HEADER,
  isTrustedEdgeRequest,
  trustedEdgeRequired,
} from "@/modules/public-intake/edge-guard";

const SECRET = "o".repeat(32);

function headers(values: Record<string, string> = {}): Headers {
  return new Headers(values);
}

describe("chốt chặn đi vòng qua Cloudflare", () => {
  it("cho qua khi header bí mật khớp", () => {
    expect(isTrustedEdgeRequest(headers({ [ORIGIN_AUTH_HEADER]: SECRET }), SECRET, true)).toBe(
      true,
    );
  });

  it("từ chối khi gọi thẳng deployment: không có header nào cả", () => {
    expect(isTrustedEdgeRequest(headers(), SECRET, true)).toBe(false);
  });

  it("từ chối header sai giá trị và header sai độ dài", () => {
    expect(
      isTrustedEdgeRequest(headers({ [ORIGIN_AUTH_HEADER]: "x".repeat(32) }), SECRET, true),
    ).toBe(false);
    expect(isTrustedEdgeRequest(headers({ [ORIGIN_AUTH_HEADER]: "o" }), SECRET, true)).toBe(false);
    expect(
      isTrustedEdgeRequest(headers({ [ORIGIN_AUTH_HEADER]: `${SECRET}o` }), SECRET, true),
    ).toBe(false);
  });

  it("không đòi header khi chưa triển khai sau Cloudflare (dev local)", () => {
    expect(isTrustedEdgeRequest(headers(), SECRET, false)).toBe(true);
  });

  it("nhận cả Headers của server component lẫn request.headers của route", () => {
    const request = new Request("http://localhost/api/public/submissions", {
      headers: { [ORIGIN_AUTH_HEADER]: SECRET },
    });
    expect(isTrustedEdgeRequest(request.headers, SECRET, true)).toBe(true);
  });
});

describe("trustedEdgeRequired", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalBypass = process.env.PUBLIC_INTAKE_SKIP_EDGE_GUARD_UNSAFE;

  afterEach(() => {
    vi.stubEnv("NODE_ENV", originalNodeEnv ?? "test");
    if (originalBypass === undefined) {
      delete process.env.PUBLIC_INTAKE_SKIP_EDGE_GUARD_UNSAFE;
    } else {
      vi.stubEnv("PUBLIC_INTAKE_SKIP_EDGE_GUARD_UNSAFE", originalBypass);
    }
  });

  it("đòi header khi đã triển khai production và không có cờ bỏ qua", () => {
    vi.stubEnv("NODE_ENV", "production");
    delete process.env.PUBLIC_INTAKE_SKIP_EDGE_GUARD_UNSAFE;
    expect(trustedEdgeRequired()).toBe(true);
  });

  it("cờ bỏ qua chỉ có tác dụng khi đúng chuỗi 'true', không phải giá trị truthy bất kỳ", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PUBLIC_INTAKE_SKIP_EDGE_GUARD_UNSAFE", "1");
    expect(trustedEdgeRequired()).toBe(true);
    vi.stubEnv("PUBLIC_INTAKE_SKIP_EDGE_GUARD_UNSAFE", "TRUE");
    expect(trustedEdgeRequired()).toBe(true);
  });

  it("cờ bỏ qua đúng giá trị 'true' thì tắt được chốt chặn ngay cả ở production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PUBLIC_INTAKE_SKIP_EDGE_GUARD_UNSAFE", "true");
    expect(trustedEdgeRequired()).toBe(false);
  });
});
