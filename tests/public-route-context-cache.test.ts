import { describe, expect, it } from "vitest";

import { publicError, publicPrivateJson } from "@/modules/public-intake/route-context";

describe("public private API responses", () => {
  it("publicPrivateJson đặt private, no-store và các header tương thích proxy cũ", () => {
    const response = publicPrivateJson({ ok: true });

    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("pragma")).toBe("no-cache");
    expect(response.headers.get("expires")).toBe("0");
  });

  it("publicError giữ error contract và không cho cache", async () => {
    const response = publicError("ACCESS_DENIED", "Yêu cầu không hợp lệ.", "req-cache");

    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("pragma")).toBe("no-cache");
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "ACCESS_DENIED",
        message: "Yêu cầu không hợp lệ.",
        requestId: "req-cache",
        details: null,
      },
    });
  });
});
