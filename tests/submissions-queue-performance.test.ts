import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  decodeQueueCursor,
  encodeQueueCursor,
  InvalidQueueCursorError,
} from "@/modules/submissions/queue-pagination";

function read(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
}

const route = read("../src/app/api/submissions/route.ts");
const repository = read("../src/modules/public-intake/repository.ts");
const queue = read("../src/components/submissions-queue.tsx");
const migration = read("../supabase/migrations/202607290004_queue_search_performance.sql");

describe("Cursor hàng chờ", () => {
  it("round-trip đúng cả timestamp và submissionId", () => {
    const cursor = {
      updatedAt: "2026-07-29T08:00:00.000Z",
      submissionId: "submission-b",
    };

    expect(decodeQueueCursor(encodeQueueCursor(cursor))).toEqual(cursor);
  });

  it("giữ submissionId làm khóa phụ khi nhiều hồ sơ có cùng updated_at", () => {
    const first = encodeQueueCursor({
      updatedAt: "2026-07-29T08:00:00.000Z",
      submissionId: "submission-b",
    });
    const second = encodeQueueCursor({
      updatedAt: "2026-07-29T08:00:00.000Z",
      submissionId: "submission-a",
    });

    expect(first).not.toBe(second);
    expect(decodeQueueCursor(first)?.submissionId).toBe("submission-b");
    expect(decodeQueueCursor(second)?.submissionId).toBe("submission-a");
  });

  it.each([
    "không-phải-base64url!",
    Buffer.from("{}").toString("base64url"),
    Buffer.from(
      JSON.stringify({ updatedAt: "không-phải-ngày", submissionId: "submission-a" }),
    ).toString("base64url"),
    Buffer.from(
      JSON.stringify({
        updatedAt: "2026-07-29T08:00:00.000Z",
        submissionId: "submission-a",
        extra: true,
      }),
    ).toString("base64url"),
  ])("từ chối cursor hỏng: %s", (cursor) => {
    expect(() => decodeQueueCursor(cursor)).toThrow(InvalidQueueCursorError);
  });
});

describe("Đường tải hàng chờ không còn đọc toàn bảng", () => {
  it("route chỉ gọi listQueuePage và vẫn che số điện thoại", () => {
    expect(route).toContain("repository.listQueuePage");
    expect(route).not.toContain("repository.list()");
    expect(route).not.toContain("repository.listSummaries()");
    expect(route).toContain("maskPhone(summary.phone)");
  });

  it("repository lọc, tìm, sắp xếp và keyset hoàn toàn trong SQL", () => {
    const block = repository.slice(
      repository.indexOf("async listQueuePage"),
      repository.indexOf("async listSummaries"),
    );

    expect(block).toContain("status = $1");
    expect(block).toContain("queue_issue_number ilike $2");
    expect(block).toContain("queue_owner_name ilike $2");
    expect(block).toContain("updated_at = $3::timestamptz and submission_id < $4");
    expect(block).toContain("order by updated_at desc, submission_id desc");
    expect(block).toContain("pageLimit + 1");
  });

  it("migration có generated columns và index cho trang/tìm kiếm", () => {
    expect(migration).toContain("generated always as");
    expect(migration).toContain("public_submissions_queue_page_idx");
    expect(migration).toContain("public_submissions_queue_all_page_idx");
    expect(migration).toContain("extensions.gin_trgm_ops");
  });

  it("UI debounce 350 ms, không tìm với một ký tự và giữ bảng cũ khi tải", () => {
    expect(queue).toContain("const SEARCH_DEBOUNCE_MS = 350");
    expect(queue).toContain("normalizedQuery.length >= 2");
    expect(queue).toContain('state !== "error" && items.length > 0');
    expect(queue).toContain("AbortController");
  });
});
