import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { turnstileHostname, verifyTurnstileToken } from "@/modules/public-intake/turnstile";

const BASE = {
  action: "create" as const,
  secretKey: "turnstile-secret",
  expectedHostname: "kekhai.example.vn",
};

function siteverifyResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("xác minh Turnstile", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("chấp nhận token hợp lệ đúng hành động và đúng hostname", async () => {
    fetchMock.mockResolvedValue(
      siteverifyResponse({ success: true, action: "create", hostname: BASE.expectedHostname }),
    );

    await expect(verifyTurnstileToken({ ...BASE, token: "valid-token" })).resolves.toEqual({
      ok: true,
      duplicate: false,
    });
  });

  it("không gọi siteverify khi token rỗng", async () => {
    await expect(verifyTurnstileToken({ ...BASE, token: "  " })).resolves.toEqual({
      ok: false,
      duplicate: false,
    });
    await expect(verifyTurnstileToken({ ...BASE, token: null })).resolves.toEqual({
      ok: false,
      duplicate: false,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("từ chối token của hành động khác", async () => {
    fetchMock.mockResolvedValue(
      siteverifyResponse({ success: true, action: "submit", hostname: BASE.expectedHostname }),
    );

    await expect(verifyTurnstileToken({ ...BASE, token: "token" })).resolves.toEqual({
      ok: false,
      duplicate: false,
    });
  });

  it("từ chối token giải trên site khác", async () => {
    fetchMock.mockResolvedValue(
      siteverifyResponse({ success: true, action: "create", hostname: "ke-khai-gia-mao.example" }),
    );

    await expect(verifyTurnstileToken({ ...BASE, token: "token" })).resolves.toEqual({
      ok: false,
      duplicate: false,
    });
  });

  it("phân biệt token đã dùng để luồng retry còn đường replay", async () => {
    fetchMock.mockResolvedValue(
      siteverifyResponse({ success: false, "error-codes": ["timeout-or-duplicate"] }),
    );

    await expect(verifyTurnstileToken({ ...BASE, token: "token" })).resolves.toEqual({
      ok: false,
      duplicate: true,
    });
  });

  it("token giả không được coi là đã dùng", async () => {
    fetchMock.mockResolvedValue(
      siteverifyResponse({ success: false, "error-codes": ["invalid-input-response"] }),
    );

    await expect(verifyTurnstileToken({ ...BASE, token: "token" })).resolves.toEqual({
      ok: false,
      duplicate: false,
    });
  });

  it("fail-closed khi siteverify lỗi mạng hoặc timeout", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));
    await expect(verifyTurnstileToken({ ...BASE, token: "token" })).resolves.toEqual({
      ok: false,
      duplicate: false,
    });

    fetchMock.mockRejectedValue(
      Object.assign(new Error("The operation was aborted"), { name: "TimeoutError" }),
    );
    await expect(verifyTurnstileToken({ ...BASE, token: "token" })).resolves.toEqual({
      ok: false,
      duplicate: false,
    });
  });

  it("fail-closed khi siteverify trả HTTP lỗi hoặc body không đọc được", async () => {
    fetchMock.mockResolvedValue(siteverifyResponse({}, 503));
    await expect(verifyTurnstileToken({ ...BASE, token: "token" })).resolves.toEqual({
      ok: false,
      duplicate: false,
    });

    fetchMock.mockResolvedValue(new Response("khong-phai-json", { status: 200 }));
    await expect(verifyTurnstileToken({ ...BASE, token: "token" })).resolves.toEqual({
      ok: false,
      duplicate: false,
    });
  });

  it("không đưa token vào thân request dưới dạng có thể log nhầm sang nơi khác", async () => {
    fetchMock.mockResolvedValue(
      siteverifyResponse({ success: true, action: "create", hostname: BASE.expectedHostname }),
    );

    await verifyTurnstileToken({ ...BASE, token: "secret-token" });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify");
    expect(String(url)).not.toContain("secret-token");
    expect(init.body).toContain("response=secret-token");
  });

  it("khóa sandbox vẫn qua dù siteverify không trả action và báo hostname example.com", async () => {
    // Đây đúng là phản hồi thật của Cloudflare cho khóa test (đã kiểm bằng curl 2026-07-22):
    // không có trường `action`, `hostname` cố định. Kiểm nghiêm ngặt sẽ chặn luôn cả môi trường
    // dev — chính là lỗi khiến quy trình chạy local ghi trong tài liệu không dùng được.
    fetchMock.mockResolvedValue(
      siteverifyResponse({
        success: true,
        hostname: "example.com",
        "error-codes": [],
        metadata: { result_with_testing_key: true },
      }),
    );

    await expect(
      verifyTurnstileToken({
        ...BASE,
        secretKey: "1x0000000000000000000000000000000AA",
        token: "XXXX.DUMMY.TOKEN.XXXX",
      }),
    ).resolves.toEqual({ ok: true, duplicate: false });
  });

  it("khóa thật vẫn bị kiểm nghiêm ngặt: cùng phản hồi đó nhưng secret thật thì bị từ chối", async () => {
    fetchMock.mockResolvedValue(
      siteverifyResponse({ success: true, hostname: "example.com", "error-codes": [] }),
    );

    await expect(verifyTurnstileToken({ ...BASE, token: "token" })).resolves.toEqual({
      ok: false,
      duplicate: false,
    });
  });

  it("lấy hostname mong đợi từ APP_BASE_URL", () => {
    expect(turnstileHostname("https://kekhai.example.vn")).toBe("kekhai.example.vn");
    expect(turnstileHostname("http://localhost:3000")).toBe("localhost");
  });
});
