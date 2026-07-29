import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findStoredMutation: vi.fn(),
  listFiles: vi.fn(),
  isDriveFileAdopted: vi.fn(),
  verifyUploadedFile: vi.fn(),
  discardFile: vi.fn(),
}));

vi.mock("@/modules/common/env", () => ({
  loadPublicIntakeEnvironment: vi.fn().mockReturnValue({ MAX_UPLOAD_MB: 30 }),
}));
vi.mock("@/modules/public-intake/creation-idempotency", () => ({
  isValidPublicIdempotencyKey: vi.fn().mockReturnValue(true),
}));
vi.mock("@/modules/public-intake/route-context", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/public-intake/route-context")>();
  return {
    ...actual,
    isEditable: vi.fn().mockReturnValue(true),
    resolvePublicRequest: vi.fn().mockResolvedValue({
      requestId: "req-replay",
      record: {
        submissionId: "submission-1",
        status: "DRAFT",
        driveFolderId: "folder-1",
        draft: { owners: [{ id: "owner-1", ownerType: "CA_NHAN" }] },
      },
    }),
  };
});
vi.mock("@/modules/public-intake/repository", () => ({
  SubmissionIdempotencyConflictError: class extends Error {},
  getPublicIntakeRepository: vi.fn().mockReturnValue({
    findStoredMutation: (...args: unknown[]) => mocks.findStoredMutation(...args),
    listFiles: (...args: unknown[]) => mocks.listFiles(...args),
    isDriveFileAdopted: (...args: unknown[]) => mocks.isDriveFileAdopted(...args),
  }),
}));
vi.mock("@/modules/public-intake/storage", () => ({
  UploadVerificationError: class extends Error {},
  getPublicIntakeStorage: vi.fn().mockReturnValue({
    verifyUploadedFile: (...args: unknown[]) => mocks.verifyUploadedFile(...args),
    discardFile: (...args: unknown[]) => mocks.discardFile(...args),
  }),
}));
vi.mock("@/modules/public-intake/upload-metrics", () => ({
  clientUploadTelemetrySchema: { safeParse: vi.fn().mockReturnValue({ success: false }) },
  buildFileNormalizationMetadata: vi.fn(),
  buildUploadAttemptMetric: vi.fn(),
}));

const { POST } = await import(
  "@/app/api/public/submissions/current/uploads/complete/route"
);

describe("POST upload complete idempotent replay", () => {
  it("DB đã commit nhưng response mất: retry trả cùng result, không validate/xóa/chèn lại", async () => {
    const request = new NextRequest("http://localhost/api/public/submissions/current/uploads/complete", {
      method: "POST",
      headers: { "idempotency-key": "11111111-1111-4111-8111-111111111111" },
      body: JSON.stringify({
        driveFileId: "drive-adopted",
        documentType: "CITIZEN_ID_FRONT",
        ownerId: "owner-1",
      }),
    });

    const crypto = await import("node:crypto");
    const mutationHash = crypto
      .createHash("sha256")
      .update(
        JSON.stringify({
          submissionId: "submission-1",
          driveFileId: "drive-adopted",
          documentType: "CITIZEN_ID_FRONT",
          ownerId: "owner-1",
          replaceFileId: "",
        }),
      )
      .digest("hex");
    mocks.findStoredMutation.mockResolvedValue({
      kind: "PUBLIC_UPLOAD_COMPLETE",
      mutationHash,
      response: { fileId: "file-adopted", sizeBytes: 4096 },
    });

    const replay = await POST(request);
    expect(replay.status).toBe(200);
    await expect(replay.json()).resolves.toEqual({
      ok: true,
      fileId: "file-adopted",
      sizeBytes: 4096,
    });
    expect(mocks.listFiles).not.toHaveBeenCalled();
    expect(mocks.verifyUploadedFile).not.toHaveBeenCalled();
    expect(mocks.discardFile).not.toHaveBeenCalled();
  });
});
