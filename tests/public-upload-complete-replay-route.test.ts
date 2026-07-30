import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  commitPublicFileUpload: vi.fn(),
  findCompletedUploadReplay: vi.fn(),
  verifyUploadedFile: vi.fn(),
  discardIfOrphan: vi.fn(),
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
    findCompletedUploadReplay: (...args: unknown[]) => mocks.findCompletedUploadReplay(...args),
    appendUploadAttempt: vi.fn().mockResolvedValue(undefined),
  }),
}));
vi.mock("@/modules/public-intake/storage", () => ({
  UploadVerificationError: class extends Error {},
  getPublicIntakeStorage: () => ({
    verifyUploadedFile: (...args: unknown[]) => mocks.verifyUploadedFile(...args),
  }),
}));
vi.mock("@/modules/public-intake/upload-commit", () => ({
  discardIfOrphan: (...args: unknown[]) => mocks.discardIfOrphan(...args),
}));

import { POST } from "@/app/api/public/submissions/current/uploads/complete/route";

describe("POST upload complete idempotent replay", () => {
  it("DB đã commit nhưng response mất: replay trả kết quả cũ, KHÔNG gọi Drive và KHÔNG gọi commit", async () => {
    mocks.findCompletedUploadReplay.mockResolvedValue({
      summary: { fileId: "file-adopted", sizeBytes: 4096 },
      replayed: true,
    });

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

    const replay = await POST(request);

    // Route trả đúng kết quả cached
    expect(replay.status).toBe(200);
    await expect(replay.json()).resolves.toEqual({
      ok: true,
      fileId: "file-adopted",
      sizeBytes: 4096,
    });

    // Bất biến: không gọi Drive, không gọi commit, không dọn file
    expect(mocks.verifyUploadedFile).not.toHaveBeenCalled();
    expect(mocks.commitPublicFileUpload).not.toHaveBeenCalled();
    expect(mocks.discardIfOrphan).not.toHaveBeenCalled();
  });

  it("chưa có replay → đi qua Drive → commit bình thường", async () => {
    mocks.findCompletedUploadReplay.mockResolvedValue(null);
    mocks.verifyUploadedFile.mockResolvedValue({
      driveFileId: "drive-new",
      mimeType: "image/jpeg",
      sizeBytes: 2048,
      checksum: "abc",
      fileName: "photo.jpg",
    });
    mocks.commitPublicFileUpload.mockResolvedValue({
      summary: { fileId: "file-new", sizeBytes: 2048 },
      replayed: false,
    });

    const request = new NextRequest("http://localhost/api", {
      method: "POST",
      headers: { "idempotency-key": "11111111-1111-1111-1111-111111111111" },
      body: JSON.stringify({
        driveFileId: "drive-new",
        documentType: "CERTIFICATE",
        ownerId: "",
        replaceFileId: "",
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      fileId: "file-new",
      sizeBytes: 2048,
    });

    // Lần đầu → phải gọi cả Drive và commit
    expect(mocks.verifyUploadedFile).toHaveBeenCalledOnce();
    expect(mocks.commitPublicFileUpload).toHaveBeenCalledOnce();
  });
});
