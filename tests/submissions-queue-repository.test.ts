import { beforeEach, describe, expect, it, vi } from "vitest";

const databaseMock = vi.hoisted(() => ({
  unsafe: vi.fn(),
}));

vi.mock("@/modules/supabase/database", () => ({
  getDatabase: () => databaseMock,
}));

import { PublicIntakeRepository } from "@/modules/public-intake/repository";
import { decodeQueueCursor, encodeQueueCursor } from "@/modules/submissions/queue-pagination";

const ROW_TIME = new Date("2026-07-29T08:00:00.000Z");

function row(submissionId: string) {
  return {
    submission_id: submissionId,
    receipt_code: `PC-${submissionId}`,
    status: "SUBMITTED",
    phone: "0912345678",
    version: 1,
    claimed_by: null,
    claimed_by_display_name: null,
    updated_at: ROW_TIME,
    queue_issue_number: `GCN-${submissionId}`,
    queue_owner_name: `Chủ ${submissionId}`,
  };
}

describe("PublicIntakeRepository.listQueuePage", () => {
  beforeEach(() => {
    databaseMock.unsafe.mockReset();
  });

  it("chỉ trả limit dòng và tạo cursor từ dòng cuối được trả", async () => {
    databaseMock.unsafe.mockResolvedValueOnce([
      row("submission-c"),
      row("submission-b"),
      row("submission-a"),
    ]);
    const repository = new PublicIntakeRepository();

    const result = await repository.listQueuePage({
      status: "SUBMITTED",
      query: "Nguyen%_",
      limit: 2,
    });

    expect(result.items.map((item) => item.submissionId)).toEqual(["submission-c", "submission-b"]);
    expect(decodeQueueCursor(result.nextCursor)).toEqual({
      updatedAt: ROW_TIME.toISOString(),
      submissionId: "submission-b",
    });
    expect(databaseMock.unsafe).toHaveBeenCalledWith(
      expect.stringContaining("order by updated_at desc, submission_id desc"),
      ["SUBMITTED", "%Nguyen!%!_%", null, null, 3, null, false, null, null, null, null],
    );
  });

  it("đưa cả timestamp và submissionId của cursor vào điều kiện keyset", async () => {
    databaseMock.unsafe.mockResolvedValueOnce([]);
    const repository = new PublicIntakeRepository();
    const cursor = encodeQueueCursor({
      updatedAt: ROW_TIME.toISOString(),
      submissionId: "submission-b",
    });

    const result = await repository.listQueuePage({ cursor, limit: 100 });

    expect(result).toEqual({ items: [], nextCursor: null });
    expect(databaseMock.unsafe).toHaveBeenCalledWith(
      expect.stringContaining("updated_at = $3::timestamptz and submission_id < $4"),
      [null, null, ROW_TIME.toISOString(), "submission-b", 101, null, false, null, null, null, null],
    );
  });
});
