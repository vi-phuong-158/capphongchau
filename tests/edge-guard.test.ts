import { describe, expect, it } from "vitest";

import { ORIGIN_AUTH_HEADER, isTrustedEdgeRequest } from "@/modules/public-intake/edge-guard";

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
