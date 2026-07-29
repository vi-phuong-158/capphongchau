import { describe, expect, it } from "vitest";

import {
  OFFICIAL_ACCEPTANCE_FILE_MOVE_CONCURRENCY,
  chunkOfficialAcceptanceFiles,
  settleOfficialAcceptanceMoveChunk,
} from "@/modules/submissions/acceptance-file-move";

describe("Phase 5A official acceptance file moves", () => {
  it("chia đúng nhóm hai phần tử, giữ nguyên thứ tự và không cho phép vượt giới hạn Drive", () => {
    const files = ["f1", "f2", "f3", "f4", "f5"];
    expect(chunkOfficialAcceptanceFiles(files)).toEqual([["f1", "f2"], ["f3", "f4"], ["f5"]]);
    expect(OFFICIAL_ACCEPTANCE_FILE_MOVE_CONCURRENCY).toBe(2);
    expect(() => chunkOfficialAcceptanceFiles(files, 3)).toThrow("Kích thước nhóm chuyển tệp");
  });

  it("không vượt concurrency 2 và giữ thành công khi peer cùng nhóm lỗi", async () => {
    const moved: string[] = [];
    let active = 0;
    let peak = 0;
    const result = await settleOfficialAcceptanceMoveChunk(["first", "second"], async (file) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      active -= 1;
      if (file === "second") throw new Error("simulated Drive outage");
      moved.push(file);
    });
    expect(peak).toBe(2);
    expect(moved).toEqual(["first"]);
    expect(result.succeeded).toEqual(["first"]);
    expect(result.failure).toBeInstanceOf(Error);
  });

  it("mười file tạo năm nhóm checkpoint, theo thứ tự không đổi", async () => {
    const checkpoints: string[][] = [];
    const files = Array.from({ length: 10 }, (_, index) => `file-${index + 1}`);
    for (const chunk of chunkOfficialAcceptanceFiles(files)) {
      const result = await settleOfficialAcceptanceMoveChunk(chunk, async () => undefined);
      checkpoints.push([...result.succeeded]);
      expect(result.failure).toBeNull();
    }
    expect(checkpoints).toEqual([
      ["file-1", "file-2"], ["file-3", "file-4"], ["file-5", "file-6"],
      ["file-7", "file-8"], ["file-9", "file-10"],
    ]);
  });
});
