import { describe, expect, it, vi } from "vitest";

/**
 * `tests/public-surface-guard.test.ts` đã khóa **matcher** của proxy (đường nào bị chặn). Test này
 * khóa **thân handler**: từ Đợt 2B, trang `/submissions/[submissionId]` nạp sẵn hồ sơ trên server
 * nên PII (số điện thoại, CCCD, địa chỉ) nằm ngay trong HTML, không còn chỉ trong phản hồi JSON.
 * Nếu ai đó gỡ dòng `cache-control` đi thì proxy trung gian hoặc CDN được phép giữ lại bản HTML đó
 * mà không có test nào kêu — matcher vẫn xanh vì matcher không biết gì về header.
 *
 * `NextAuth(authConfig)` trả về `auth` là hàm bọc; ở đây thay nó bằng hàm trả thẳng handler để gọi
 * được handler với request tự dựng, không cần session JWT thật hay biến môi trường của Google.
 */
vi.mock("next-auth", () => ({
  default: () => ({ auth: (handler: unknown) => handler }),
}));
vi.mock("@/auth.config", () => ({ authConfig: {} }));

type ProxyRequest = { auth: { user?: { email?: string } } | null; url: string; nextUrl: { pathname: string; search: string } };
type ProxyHandler = (request: ProxyRequest) => Response;

async function loadProxy(): Promise<ProxyHandler> {
  const proxyModule = await import("@/proxy");
  return proxyModule.default as unknown as ProxyHandler;
}

function request(email: string | null): ProxyRequest {
  return {
    auth: email === null ? null : { user: { email } },
    url: "http://localhost/submissions/1a2b3c",
    nextUrl: { pathname: "/submissions/1a2b3c", search: "" },
  };
}

describe("proxy Edge — không để trang cán bộ nằm lại trong cache", () => {
  it("gắn `private, no-store` cho phiên đã đăng nhập", async () => {
    const proxy = await loadProxy();
    const response = proxy(request("canbo@example.com"));

    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  /**
   * `private` một mình vẫn cho browser cache lại trên đĩa; `no-store` mới là chỉ thị cấm lưu.
   * Kiểm tra bằng nội dung thay vì so chuỗi nguyên khối để đổi thứ tự chỉ thị không làm đỏ test.
   */
  it("chỉ thị cache luôn chứa no-store, không chỉ private", async () => {
    const proxy = await loadProxy();
    const cacheControl = proxy(request("canbo@example.com")).headers.get("cache-control") ?? "";

    expect(cacheControl).toContain("no-store");
    expect(cacheControl).toContain("private");
    expect(cacheControl).not.toContain("max-age");
  });

  it("phiên chưa đăng nhập bị đá về trang chủ, không lọt qua với header cache", async () => {
    const proxy = await loadProxy();
    const response = proxy(request(null));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/?callbackUrl=%2Fsubmissions%2F1a2b3c");
  });

  /**
   * JWT còn hạn nhưng thiếu email thì `requireActiveUser` phía Node không đối chiếu allowlist được.
   * Edge phải coi đây là chưa đăng nhập chứ không cho đi tiếp.
   */
  it("session không có email cũng bị coi là chưa đăng nhập", async () => {
    const proxy = await loadProxy();

    const response1 = proxy({ auth: { user: {} }, url: "http://localhost/submissions/1", nextUrl: { pathname: "/submissions/1", search: "" } });
    expect(response1.status).toBe(307);
    expect(response1.headers.get("location")).toBe("http://localhost/?callbackUrl=%2Fsubmissions%2F1");
    const response2 = proxy(request(""));
    expect(response2.status).toBe(307);
    expect(response2.headers.get("location")).toBe("http://localhost/?callbackUrl=%2Fsubmissions%2F1a2b3c");
  });
});
