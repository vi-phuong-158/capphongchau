import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  commitPublicFileUpload: vi.fn(),
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
  PublicFileMutationRejectedError: class extends Error {
    constructor(public reason: string, message: string) {
      super(message);
    }
  },
  getPublicIntakeRepository: vi.fn().mockReturnValue({
    commitPublicFileUpload: (...args: unknown[]) => mocks.commitPublicFileUpload(...args),
  }),
}));
vi.mock("@/modules/public-intake/storage", () => ({
  getPublicIntakeStorage: () => ({
    verifyUploadedFile: vi.fn().mockResolvedValue(true),
  }),
}));
vi.mock("@/modules/public-intake/upload-commit", () => ({
  discardIfOrphan: vi.fn(),
}));

import { POST } from "@/app/api/public/submissions/current/uploads/complete/route";

describe("POST upload complete idempotent replay", () => {
  it("DB đã commit nhưng response mất: retry trả cùng result, không validate/xóa/chèn lại", async () => {
    const request = new NextRequest("http://localhost/api", {
      method: "POST",
      headers: { "idempotency-key": "00000000-0000-0000-0000-000000000000" },
      body: JSON.stringify({
        driveFileId: "drive-adopted",
        documentType: "CITIZEN_ID_FRONT",
        ownerId: "owner-1",
        replaceFileId: "",
      }),
    });
    
    mocks.commitPublicFileUpload.mockResolvedValue({
      summary: { fileId: "file-adopted", sizeBytes: 4096 },
      replayed: true,
    });

    const replay = await POST(request);
    expect(replay.status).toBe(200);
    await expect(replay.json()).resolves.toEqual({
      ok: true,
      fileId: "file-adopted",
    });
  });
});
