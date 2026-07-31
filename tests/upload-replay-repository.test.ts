import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => vi.fn());

vi.mock("@/modules/supabase/database", () => ({
  getDatabase: () => database,
}));

import {
  PublicIntakeRepository,
  StoredUploadReplayInvalidError,
  parseStoredUploadReplaySummary,
} from "@/modules/public-intake/repository";

const validSummary = {
  fileId: "file-1",
  ownerId: "",
  documentType: "CERTIFICATE",
  status: "UPLOADED",
  sizeBytes: 4096,
  checksum: "sha256",
  createdAt: "2026-07-31T08:00:00.000Z",
  updatedAt: "2026-07-31T08:00:00.000Z",
  driveFileId: null,
  mimeType: "image/jpeg",
};

describe("parseStoredUploadReplaySummary", () => {
  it("parse đúng hợp đồng file summary và chuẩn hóa trường nullable", () => {
    expect(parseStoredUploadReplaySummary(validSummary)).toEqual({
      ...validSummary,
      driveFileId: undefined,
    });
  });

  it.each([
    [{ ...validSummary, fileId: "" }],
    [{ ...validSummary, documentType: "OTHER" }],
    [{ ...validSummary, status: "OTHER" }],
    [{ ...validSummary, sizeBytes: "4096" }],
    [{ ...validSummary, sizeBytes: -1 }],
    [{ ...validSummary, checksum: null }],
  ])("từ chối response_json hỏng mà không ép kiểu mù", (value) => {
    expect(() => parseStoredUploadReplaySummary(value)).toThrow(StoredUploadReplayInvalidError);
  });
});

describe("PublicIntakeRepository.findCompletedFileUploadReplay", () => {
  beforeEach(() => {
    database.mockReset();
  });

  it("lọc đồng thời idempotency_key và kind, rồi validate response_json", async () => {
    database.mockResolvedValue([
      {
        mutation_hash: "mutation-1",
        response_json: validSummary,
      },
    ]);
    const repository = new PublicIntakeRepository();

    const result = await repository.findCompletedFileUploadReplay({
      idempotencyKey: "OFFICER_UPLOAD_COMPLETE:submission:key",
      mutationHash: "mutation-1",
      kind: "OFFICER_UPLOAD_COMPLETE",
    });

    expect(result?.summary.fileId).toBe("file-1");
    const [strings, ...values] = database.mock.calls[0] as [TemplateStringsArray, ...unknown[]];
    expect(strings.join("?")).toContain("idempotency_key = ?");
    expect(strings.join("?")).toContain("kind = ?");
    expect(values).toEqual(["OFFICER_UPLOAD_COMPLETE:submission:key", "OFFICER_UPLOAD_COMPLETE"]);
  });

  it("không đọc replay officer cho đường public dù dữ liệu mô phỏng dùng cùng key", async () => {
    database.mockImplementation(
      async (_strings: TemplateStringsArray, _key: string, kind: string) =>
        kind === "OFFICER_UPLOAD_COMPLETE"
          ? [{ mutation_hash: "mutation-1", response_json: validSummary }]
          : [],
    );
    const repository = new PublicIntakeRepository();

    await expect(
      repository.findCompletedFileUploadReplay({
        idempotencyKey: "shared-key",
        mutationHash: "mutation-1",
        kind: "PUBLIC_UPLOAD_COMPLETE",
      }),
    ).resolves.toBeNull();
    await expect(
      repository.findCompletedFileUploadReplay({
        idempotencyKey: "shared-key",
        mutationHash: "mutation-1",
        kind: "OFFICER_UPLOAD_COMPLETE",
      }),
    ).resolves.toMatchObject({ summary: { fileId: "file-1" } });
  });
});
