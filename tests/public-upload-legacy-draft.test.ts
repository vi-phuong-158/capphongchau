import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createUploadSession: vi.fn(),
  discardFile: vi.fn(),
  listFiles: vi.fn(),
  findStoredMutation: vi.fn(),
  isDriveFileAdopted: vi.fn(),
  isFileInFolder: vi.fn(),
  resolvePublicRequest: vi.fn(),
}));

vi.mock("@/modules/common/env", () => ({
  loadPublicIntakeEnvironment: () => ({ MAX_UPLOAD_MB: 30 }),
}));

vi.mock("@/modules/public-intake/repository", () => ({
  getPublicIntakeRepository: () => ({
    listFiles: mocks.listFiles,
    findStoredMutation: mocks.findStoredMutation,
    isDriveFileAdopted: mocks.isDriveFileAdopted,
  }),
}));

vi.mock("@/modules/public-intake/route-context", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/public-intake/route-context")>()),
  isEditable: () => true,
  resolvePublicRequest: mocks.resolvePublicRequest,
}));

vi.mock("@/modules/public-intake/storage", () => ({
  getPublicIntakeStorage: () => ({
    createUploadSession: mocks.createUploadSession,
    discardFile: mocks.discardFile,
    isFileInFolder: mocks.isFileInFolder,
  }),
  UploadVerificationError: class UploadVerificationError extends Error {},
}));

import { POST as completeUpload } from "@/app/api/public/submissions/current/uploads/complete/route";
import { POST as initiateUpload } from "@/app/api/public/submissions/current/uploads/initiate/route";

const malformedRecord = {
  submissionId: "submission-test",
  driveFolderId: "drive-folder-test",
  status: "DRAFT",
  draft: {},
  fileSummaries: [],
} as never;

function initiateRequest(): Request {
  return new Request("https://example.test/api/public/submissions/current/uploads/initiate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      documentType: "CITIZEN_ID_FRONT",
      ownerId: "owner-test",
      fileName: "cccd.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 1024,
    }),
  });
}

function completeRequest(): Request {
  return new Request("https://example.test/api/public/submissions/current/uploads/complete", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": "00000000-0000-4000-8000-000000000000",
    },
    body: JSON.stringify({
      driveFileId: "drive-file-test",
      documentType: "CITIZEN_ID_FRONT",
      ownerId: "owner-test",
    }),
  });
}

describe("public upload với nháp legacy thiếu owners", () => {
  beforeEach(() => {
    mocks.createUploadSession.mockReset();
    mocks.discardFile.mockReset();
    mocks.discardFile.mockResolvedValue(undefined);
    mocks.listFiles.mockReset();
    mocks.listFiles.mockResolvedValue([]);
    mocks.findStoredMutation.mockReset();
    mocks.findStoredMutation.mockResolvedValue(null);
    mocks.isDriveFileAdopted.mockReset();
    mocks.isDriveFileAdopted.mockResolvedValue(false);
    mocks.isFileInFolder.mockReset();
    // Tệp nằm đúng thư mục của hộ dân đang gọi — điều kiện cần để được phép dọn.
    mocks.isFileInFolder.mockResolvedValue(true);
    mocks.resolvePublicRequest.mockReset();
    mocks.resolvePublicRequest.mockResolvedValue({
      record: malformedRecord,
      requestId: "request-test",
    });
  });

  it("không trả 500 hoặc tạo phiên Drive khi initiate gặp nháp sai shape", async () => {
    const response = await initiateUpload(initiateRequest());
    const body = (await response.json()) as { error: { code: string; message: string } };

    expect(response.status).toBe(409);
    expect(body.error.code).toBe("INVALID_STATE");
    expect(body.error.message).toContain("Tải lại trang");
    expect(mocks.createUploadSession).not.toHaveBeenCalled();
  });

  it("dọn file vừa tải và không xác minh Drive khi complete gặp nháp sai shape", async () => {
    const response = await completeUpload(completeRequest());
    const body = (await response.json()) as { error: { code: string; message: string } };

    expect(response.status).toBe(409);
    expect(body.error.code).toBe("INVALID_STATE");
    expect(mocks.discardFile).toHaveBeenCalledWith("drive-file-test");
  });

  it("KHÔNG dọn khi tệp không nằm trong thư mục Drive của hộ dân đang gọi", async () => {
    // `driveFileId` ở nhánh này là dữ liệu client chưa qua xác minh. Trỏ sang thư mục hộ khác
    // thì tuyệt đối không được xóa, kể cả khi chưa hồ sơ nào nhận tệp đó.
    mocks.isFileInFolder.mockResolvedValue(false);

    const response = await completeUpload(completeRequest());

    expect(response.status).toBe(409);
    expect(mocks.discardFile).not.toHaveBeenCalled();
  });

  it("KHÔNG dọn khi không hỏi được Drive về thư mục cha", async () => {
    mocks.isFileInFolder.mockRejectedValue(new Error("drive unreachable"));

    const response = await completeUpload(completeRequest());

    expect(response.status).toBe(409);
    expect(mocks.discardFile).not.toHaveBeenCalled();
  });
});
