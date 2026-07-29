import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * Hai bất biến của bề mặt công khai, cùng canh một chỗ vì hỏng cái nào cũng mở toang cổng:
 *
 * 1. Mọi route dưới `/api/public` phải qua chốt chặn Cloudflare — trực tiếp hoặc qua
 *    `resolvePublicRequest`. Route mới quên gắn là bỏ qua WAF/rate limiting (PLAN_NL §10.2).
 * 2. Matcher của `proxy.ts` phải chặn đúng đường cán bộ và **không** chạm đường công khai —
 *    sai một chiều thì người dân bị đá về trang đăng nhập, sai chiều kia thì mở nhầm route
 *    nội bộ (PLAN_NL §10.1).
 */

const publicApiRoot = fileURLToPath(new URL("../src/app/api/public", import.meta.url));
const proxySource = fileURLToPath(new URL("../src/proxy.ts", import.meta.url));

/**
 * Next.js đòi `matcher` là literal tĩnh nên không import được hằng số dùng chung; đọc thẳng từ
 * mã nguồn để test soi đúng giá trị đang chạy chứ không phải một bản sao dễ lệch.
 */
function proxyMatcher(): string[] {
  const source = readFileSync(proxySource, "utf8");
  // Khớp cả dạng một dòng lẫn dạng nhiều dòng do Prettier xuống hàng khi danh sách dài — nội dung
  // matcher mới là thứ cần khóa, không phải cách trình bày.
  const declaration = /export const config = \{\s*matcher:\s*\[([\s\S]*?)\]/.exec(source);
  if (!declaration) {
    throw new Error("Không đọc được matcher trong src/proxy.ts — kiểm tra lại khai báo config.");
  }
  return [...declaration[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]);
}

function routeFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return routeFiles(path);
    return entry.name === "route.ts" ? [path] : [];
  });
}

/** Matcher của Next.js dùng cú pháp `:path*`; đổi sang RegExp để kiểm tra được cả hai chiều. */
function matcherToRegExp(pattern: string): RegExp {
  return new RegExp(`^${pattern.replace("/:path*", "(?:/.*)?")}$`);
}

function isProxied(pathname: string): boolean {
  return proxyMatcher().some((pattern) => matcherToRegExp(pattern).test(pathname));
}

describe("bề mặt công khai", () => {
  it("mọi route /api/public đều đi qua chốt chặn lớp biên", () => {
    const files = routeFiles(publicApiRoot);
    expect(files.length).toBeGreaterThan(0);

    const unguarded = files.filter((file) => {
      const source = readFileSync(file, "utf8");
      return !source.includes("isTrustedEdgeRequest") && !source.includes("resolvePublicRequest");
    });

    expect(unguarded).toEqual([]);
  });

  it("proxy Edge vẫn chặn đường cán bộ", () => {
    expect(isProxied("/profile")).toBe(true);
    expect(isProxied("/users")).toBe(true);
    expect(isProxied("/submissions")).toBe(true);
    expect(isProxied("/submissions/abc/files/def")).toBe(true);
  });

  it("proxy Edge không chạm đường công khai của người dân", () => {
    expect(isProxied("/ke-khai")).toBe(false);
    expect(isProxied("/api/public/submissions")).toBe(false);
    expect(isProxied("/api/public/submissions/current/submit")).toBe(false);
  });

  /**
   * Chế độ cán bộ hỗ trợ kê khai nằm ở `/ke-khai-ho`, chỉ khác `/ke-khai` một gạch nối. Đặt sai
   * matcher là mở toang đường tạo hồ sơ mang nhãn `OFFICER_ASSISTED` cho bất kỳ ai.
   */
  it("proxy Edge chặn chế độ cán bộ hỗ trợ kê khai", () => {
    expect(isProxied("/ke-khai-ho")).toBe(true);
    expect(isProxied("/api/staff/assisted-submissions")).toBe(true);
  });

  it("chặn `/ke-khai-ho` KHÔNG kéo theo `/ke-khai` của người dân", () => {
    expect(isProxied("/ke-khai")).toBe(false);
  });

  it("route cán bộ hỗ trợ vẫn tự kiểm quyền, không chỉ dựa vào proxy Edge", () => {
    // JWT cũ còn hạn sau khi quản trị viên khóa tài khoản, nên Edge thấy "có session" là chưa đủ.
    const source = readFileSync(
      fileURLToPath(new URL("../src/app/api/staff/assisted-submissions/route.ts", import.meta.url)),
      "utf8",
    );
    expect(source).toContain("requireActiveUser");
    expect(source).toContain("verifyCsrfToken");
  });

  it("client không có đường nào tự khai hồ sơ là do cán bộ nhập hộ", () => {
    const source = readFileSync(
      fileURLToPath(new URL("../src/app/api/public/submissions/route.ts", import.meta.url)),
      "utf8",
    );
    // Cổng công khai gán cứng SELF_SERVICE và không đọc `channel` từ body.
    expect(source).toContain('channel: "SELF_SERVICE"');
    expect(source).not.toContain("body.channel");
    expect(source).not.toContain("body.assistedBy");
  });
});
