/**
 * Đợt 2C — cán bộ tự tải ảnh giấy tờ bổ sung vào hồ sơ. **Test hành vi**, gọi thật hai route
 * handler với repository/storage giả.
 *
 * Bản trước của bộ test này đọc chuỗi mã nguồn (`expect(source).toContain(...)`). Cách đó khóa được
 * "có gọi hàm hay không" nhưng không bắt được đúng những lỗi nguy hiểm nhất của luồng này, và đó là
 * lý do bộ test được viết lại:
 *
 *   - Ghi audit **sau khi** ảnh đã commit: ảnh vào hồ sơ mà nhật ký không biết cán bộ nào thêm.
 *   - Hồ sơ được tiếp nhận chính thức giữa lúc kiểm quyền và lúc ghi.
 *   - Hồ sơ chưa có thư mục Drive (Phase 3 lazy folder) — trước đây truyền thẳng `null`.
 *   - Vượt trần dung lượng tính bằng kích thước **thật** trên Drive, không phải số client khai.
 *
 * Ba nhóm đầu giờ nằm trong một transaction ở `repository.commitOfficerFileUpload`; test này khóa
 * việc **route thực sự đi qua đường đó** và dịch đúng từng lý do từ chối sang mã HTTP. Tính nguyên
 * tử của bản thân transaction cần Postgres thật — xem
 * `tests/officer-file-mutations.integration.test.ts`.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { UserRole } from "@/modules/common/domain";
import type { SubmissionRecord } from "@/modules/public-intake/repository";
import { emptyOwner, type IntakeDraft } from "@/modules/public-intake/types";
import {
  MAX_CERTIFICATE_PHOTOS,
  SUBMISSION_BYTE_BUDGET,
} from "@/modules/public-intake/upload-commit";

const mockUser = {
  email: "officer@phongchau.gov.vn",
  displayName: "Cán bộ Test",
  roles: [UserRole.REVIEW_OFFICER],
  id: "user_1",
};

const mockRequireActiveUser = vi.hoisted(() => vi.fn());
const mockVerifyCsrf = vi.hoisted(() => vi.fn());
const mockFindById = vi.hoisted(() => vi.fn());
const mockListFiles = vi.hoisted(() => vi.fn());
const mockCommitOfficerFileUpload = vi.hoisted(() => vi.fn());
const mockFindCompletedFileUploadReplay = vi.hoisted(() => vi.fn());
const mockAppendAudit = vi.hoisted(() => vi.fn());
const mockAppendFile = vi.hoisted(() => vi.fn());
const mockCreateUploadSession = vi.hoisted(() => vi.fn());
const mockVerifyUploadedFile = vi.hoisted(() => vi.fn());
const mockEnsureFolderReady = vi.hoisted(() => vi.fn());
const mockDiscardIfOrphan = vi.hoisted(() => vi.fn());

/** `vi.mock` được hoist lên đầu tệp, nên các lớp lỗi giả cũng phải hoist theo. */
const errors = vi.hoisted(() => {
  class AuthorizationError extends Error {
    kind: "ACCESS_DENIED" | "UNAUTHENTICATED";
    constructor(kind: "ACCESS_DENIED" | "UNAUTHENTICATED", message: string) {
      super(message);
      this.kind = kind;
    }
  }
  class OfficerFileMutationRejectedError extends Error {
    constructor(
      readonly reason: string,
      message: string,
    ) {
      super(message);
    }
  }
  class SubmissionIdempotencyConflictError extends Error {}
  class UploadVerificationError extends Error {}
  class SubmissionFolderBusyError extends Error {
    readonly retryAfterSeconds = 3;
  }
  class SubmissionFolderUnavailableError extends Error {}
  return {
    AuthorizationError,
    OfficerFileMutationRejectedError,
    SubmissionIdempotencyConflictError,
    UploadVerificationError,
    SubmissionFolderBusyError,
    SubmissionFolderUnavailableError,
  };
});

const {
  OfficerFileMutationRejectedError,
  SubmissionIdempotencyConflictError,
  SubmissionFolderBusyError,
  SubmissionFolderUnavailableError,
} = errors;

vi.mock("@/modules/auth/authorization", () => ({
  requireActiveUser: (...args: unknown[]) => mockRequireActiveUser(...args),
  AuthorizationError: errors.AuthorizationError,
}));

vi.mock("@/modules/auth/csrf", () => ({
  verifyCsrfToken: (...args: unknown[]) => mockVerifyCsrf(...args),
}));

vi.mock("@/modules/common/env", () => ({
  loadServerEnvironment: vi.fn().mockReturnValue({
    AUTH_SECRET: "mock-secret-at-least-32-chars-long-security",
  }),
  loadPublicIntakeEnvironment: vi.fn().mockReturnValue({ MAX_UPLOAD_MB: 30 }),
}));

vi.mock("@/modules/public-intake/repository", () => ({
  getPublicIntakeRepository: vi.fn().mockReturnValue({
    findById: (...args: unknown[]) => mockFindById(...args),
    listFiles: (...args: unknown[]) => mockListFiles(...args),
    commitOfficerFileUpload: (...args: unknown[]) => mockCommitOfficerFileUpload(...args),
    findCompletedFileUploadReplay: (...args: unknown[]) =>
      mockFindCompletedFileUploadReplay(...args),
    appendAudit: (...args: unknown[]) => mockAppendAudit(...args),
    appendFile: (...args: unknown[]) => mockAppendFile(...args),
    isDriveFileAdopted: vi.fn().mockResolvedValue(true),
  }),
  OfficerFileMutationRejectedError: errors.OfficerFileMutationRejectedError,
  SubmissionIdempotencyConflictError: errors.SubmissionIdempotencyConflictError,
}));

vi.mock("@/modules/public-intake/storage", () => ({
  getPublicIntakeStorage: vi.fn().mockReturnValue({
    createUploadSession: (...args: unknown[]) => mockCreateUploadSession(...args),
    verifyUploadedFile: (...args: unknown[]) => mockVerifyUploadedFile(...args),
  }),
  UploadVerificationError: errors.UploadVerificationError,
}));

vi.mock("@/modules/public-intake/submission-folder", () => ({
  ensureSubmissionFolderReady: (...args: unknown[]) => mockEnsureFolderReady(...args),
  SubmissionFolderBusyError: errors.SubmissionFolderBusyError,
  SubmissionFolderUnavailableError: errors.SubmissionFolderUnavailableError,
}));

vi.mock("@/modules/public-intake/upload-commit", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, discardIfOrphan: (...args: unknown[]) => mockDiscardIfOrphan(...args) };
});

const { POST: initiate } =
  await import("@/app/api/submissions/[submissionId]/uploads/initiate/route");
const { POST: complete } =
  await import("@/app/api/submissions/[submissionId]/uploads/complete/route");

function makeDraft(): IntakeDraft {
  return {
    certificate: { issueNumber: "AD 123456", issueDate: "2020-01-01", registryNumber: "CH001" },
    owners: [
      { ...emptyOwner("owner_1"), fullName: "Nguyễn Văn A", ownerType: "CA_NHAN" },
      { ...emptyOwner("owner_org"), fullName: "Công ty X", ownerType: "TO_CHUC" },
    ],
    parcels: [],
    assets: [],
    phone: "0912345678",
    consentAccepted: true,
  };
}

function makeRecord(overrides: Partial<SubmissionRecord> = {}): SubmissionRecord {
  return {
    submissionId: "sub_1",
    receiptCode: "PC-KK-2026-0001",
    status: "UNDER_REVIEW",
    phone: "0912345678",
    version: 3,
    accessCodeHash: "hash",
    failedAttempts: 0,
    lockedUntil: "",
    consentVersion: "v1",
    consentedAt: "2026-07-30T08:00:00.000Z",
    retentionUntil: "",
    driveFolderId: "folder_1",
    officialCaseId: "",
    acceptStep: "",
    claimedBy: mockUser.email,
    claimedByDisplayName: "Cán bộ Test",
    intakeChannel: "SELF_SERVICE",
    assistedByEmail: "",
    assistedByDisplayName: "",
    assistedAt: "",
    claimedAt: "2026-07-30T08:00:00.000Z",
    createdAt: "2026-07-30T08:00:00.000Z",
    updatedAt: "2026-07-30T08:00:00.000Z",
    draft: makeDraft(),
    accessVersion: 1,
    fileSummaries: [],
    rowIndex: 1,
    internalNotes: "",
    ...overrides,
  };
}

function storedFile(overrides: Record<string, unknown> = {}) {
  return {
    fileId: "file_old",
    submissionId: "sub_1",
    ownerId: "",
    documentType: "CERTIFICATE",
    driveFileId: "drive_old",
    mimeType: "image/jpeg",
    sizeBytes: 1_000,
    checksum: "abc",
    fileName: "OFFICER-CERTIFICATE-1.jpg",
    status: "UPLOADED",
    ...overrides,
  };
}

function initiateRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost:3000/api/submissions/sub_1/uploads/initiate", {
    method: "POST",
    headers: { "content-type": "application/json", "x-csrf-token": "token" },
    body: JSON.stringify(body),
  });
}

function completeRequest(
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
): NextRequest {
  return new NextRequest("http://localhost:3000/api/submissions/sub_1/uploads/complete", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-csrf-token": "token",
      "idempotency-key": "key-1",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

const context = { params: Promise.resolve({ submissionId: "sub_1" }) };
const CERTIFICATE_BODY = { driveFileId: "drive_new", documentType: "CERTIFICATE" };

async function payload(response: Response): Promise<Record<string, never>> {
  return (await response.json()) as Record<string, never>;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireActiveUser.mockResolvedValue(mockUser);
  mockVerifyCsrf.mockReturnValue(true);
  mockFindById.mockResolvedValue(makeRecord());
  mockListFiles.mockResolvedValue([]);
  mockEnsureFolderReady.mockResolvedValue("folder_1");
  mockCreateUploadSession.mockResolvedValue({ uploadUrl: "https://drive.example/session" });
  mockVerifyUploadedFile.mockResolvedValue({
    driveFileId: "drive_new",
    mimeType: "image/jpeg",
    sizeBytes: 2_048,
    checksum: "checksum-new",
    fileName: "OFFICER-CERTIFICATE-2.jpg",
  });
  mockCommitOfficerFileUpload.mockResolvedValue({
    summary: { fileId: "file_new" },
    replayed: false,
  });
  mockFindCompletedFileUploadReplay.mockResolvedValue(null);
  mockDiscardIfOrphan.mockResolvedValue(undefined);
});

describe("cửa quyền của đường tải ảnh cán bộ", () => {
  it("initiate từ chối khi thiếu/hỏng CSRF, không tạo phiên Drive nào", async () => {
    mockVerifyCsrf.mockReturnValue(false);

    const response = await initiate(
      initiateRequest({ documentType: "CERTIFICATE", mimeType: "image/jpeg", sizeBytes: 1000 }),
      context,
    );

    expect(response.status).toBe(403);
    expect(mockCreateUploadSession).not.toHaveBeenCalled();
  });

  it("complete từ chối khi thiếu/hỏng CSRF, không xác minh và không ghi gì", async () => {
    mockVerifyCsrf.mockReturnValue(false);

    const response = await complete(completeRequest(CERTIFICATE_BODY), context);

    expect(response.status).toBe(403);
    expect(mockVerifyUploadedFile).not.toHaveBeenCalled();
    expect(mockCommitOfficerFileUpload).not.toHaveBeenCalled();
  });

  it("initiate chặn cán bộ không đang giữ hồ sơ (mayStaffEdit)", async () => {
    mockFindById.mockResolvedValue(makeRecord({ claimedBy: "nguoikhac@phongchau.gov.vn" }));

    const response = await initiate(
      initiateRequest({ documentType: "CERTIFICATE", mimeType: "image/jpeg", sizeBytes: 1000 }),
      context,
    );

    expect(response.status).toBe(403);
    expect(mockCreateUploadSession).not.toHaveBeenCalled();
  });

  it("initiate chặn hồ sơ đã tiếp nhận chính thức", async () => {
    mockFindById.mockResolvedValue(makeRecord({ status: "ACCEPTED" }));

    const response = await initiate(
      initiateRequest({ documentType: "CERTIFICATE", mimeType: "image/jpeg", sizeBytes: 1000 }),
      context,
    );

    expect(response.status).toBe(403);
  });

  it("complete không tự kiểm quyền ở route mà để transaction kiểm lại sau khi khóa hồ sơ", async () => {
    /*
     * Kiểm ở route rồi mở transaction sau là một khoảng trống: trong khoảng đó hồ sơ có thể đã được
     * tiếp nhận. Ở đây route KHÔNG chặn, transaction từ chối bằng `FORBIDDEN` — và lượt ghi bị
     * rollback nguyên vẹn, tệp mồ côi được dọn.
     */
    mockCommitOfficerFileUpload.mockRejectedValue(
      new OfficerFileMutationRejectedError("FORBIDDEN", "Hồ sơ không còn do bạn nhận xử lý."),
    );

    const response = await complete(completeRequest(CERTIFICATE_BODY), context);

    expect(response.status).toBe(403);
    expect(mockDiscardIfOrphan).toHaveBeenCalledWith(
      expect.anything(),
      { driveFolderId: "folder_1" },
      "drive_new",
    );
  });
});

describe("hồ sơ chưa có thư mục Drive (Phase 3 lazy folder)", () => {
  it("initiate tạo thư mục qua ensureSubmissionFolderReady và dùng đúng ID trả về", async () => {
    mockFindById.mockResolvedValue(makeRecord({ driveFolderId: null }));
    mockEnsureFolderReady.mockResolvedValue("folder_lazy");

    const response = await initiate(
      initiateRequest({ documentType: "CERTIFICATE", mimeType: "image/jpeg", sizeBytes: 1000 }),
      context,
    );

    expect(response.status).toBe(200);
    expect(mockEnsureFolderReady).toHaveBeenCalledWith(
      expect.objectContaining({ submissionId: "sub_1", driveFolderId: null }),
    );
    expect(mockCreateUploadSession).toHaveBeenCalledWith(
      expect.objectContaining({ folderId: "folder_lazy" }),
    );
  });

  it("initiate trả 503 kèm Retry-After khi thư mục đang được người khác tạo", async () => {
    mockEnsureFolderReady.mockRejectedValue(new SubmissionFolderBusyError());

    const response = await initiate(
      initiateRequest({ documentType: "CERTIFICATE", mimeType: "image/jpeg", sizeBytes: 1000 }),
      context,
    );

    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("3");
    expect(mockCreateUploadSession).not.toHaveBeenCalled();
  });

  it("complete trả 503 kèm Retry-After và KHÔNG xác minh/ghi khi thư mục chưa sẵn sàng", async () => {
    mockEnsureFolderReady.mockRejectedValue(new SubmissionFolderUnavailableError());

    const response = await complete(completeRequest(CERTIFICATE_BODY), context);

    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("2");
    expect(mockVerifyUploadedFile).not.toHaveBeenCalled();
    expect(mockCommitOfficerFileUpload).not.toHaveBeenCalled();
    // Chưa xác nhận được thư mục của hồ sơ thì tuyệt đối không dọn tệp nào.
    expect(mockDiscardIfOrphan).not.toHaveBeenCalled();
  });

  it("complete xác minh tệp với thư mục do ensureSubmissionFolderReady trả về", async () => {
    mockFindById.mockResolvedValue(makeRecord({ driveFolderId: null }));
    mockEnsureFolderReady.mockResolvedValue("folder_lazy");

    await complete(completeRequest(CERTIFICATE_BODY), context);

    expect(mockVerifyUploadedFile).toHaveBeenCalledWith(
      expect.objectContaining({ expectedFolderId: "folder_lazy" }),
    );
  });
});

describe("mọi quyết định ghi nằm trong một transaction", () => {
  it("replay đã commit trả trước mọi đọc hồ sơ và thao tác Drive", async () => {
    mockFindCompletedFileUploadReplay.mockResolvedValue({
      summary: { fileId: "file_replayed" },
      replayed: true,
    });

    const response = await complete(completeRequest(CERTIFICATE_BODY), context);

    expect(response.status).toBe(200);
    expect(await payload(response)).toMatchObject({ ok: true, fileId: "file_replayed" });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mockFindCompletedFileUploadReplay).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "OFFICER_UPLOAD_COMPLETE" }),
    );
    expect(mockFindById).not.toHaveBeenCalled();
    expect(mockEnsureFolderReady).not.toHaveBeenCalled();
    expect(mockVerifyUploadedFile).not.toHaveBeenCalled();
    expect(mockCommitOfficerFileUpload).not.toHaveBeenCalled();
    expect(mockDiscardIfOrphan).not.toHaveBeenCalled();
  });

  it("early replay conflict trả 409 mà không chạm hoặc dọn tệp Drive chưa xác minh", async () => {
    mockFindCompletedFileUploadReplay.mockRejectedValue(new SubmissionIdempotencyConflictError());

    const response = await complete(completeRequest(CERTIFICATE_BODY), context);

    expect(response.status).toBe(409);
    expect(mockFindById).not.toHaveBeenCalled();
    expect(mockVerifyUploadedFile).not.toHaveBeenCalled();
    expect(mockCommitOfficerFileUpload).not.toHaveBeenCalled();
    expect(mockDiscardIfOrphan).not.toHaveBeenCalled();
  });

  it("replay JSON hỏng trả lỗi nội bộ an toàn mà không chạm Drive", async () => {
    mockFindCompletedFileUploadReplay.mockRejectedValue(
      new Error('response_json hỏng: {"driveFileId":"không-được-lộ"}'),
    );

    const response = await complete(completeRequest(CERTIFICATE_BODY), context);
    const body = JSON.stringify(await payload(response));

    expect(response.status).toBe(500);
    expect(body).not.toContain("driveFileId");
    expect(body).not.toContain("không-được-lộ");
    expect(mockFindById).not.toHaveBeenCalled();
    expect(mockVerifyUploadedFile).not.toHaveBeenCalled();
    expect(mockCommitOfficerFileUpload).not.toHaveBeenCalled();
    expect(mockDiscardIfOrphan).not.toHaveBeenCalled();
  });

  it("complete gọi đúng commitOfficerFileUpload và KHÔNG ghi audit thành lượt riêng", async () => {
    const response = await complete(
      completeRequest({ ...CERTIFICATE_BODY, replaceFileId: "file_old" }),
      context,
    );

    expect(response.status).toBe(200);
    expect(await payload(response)).toMatchObject({ ok: true, fileId: "file_new" });
    expect(mockCommitOfficerFileUpload).toHaveBeenCalledTimes(1);
    // Đây là điểm chính: audit không còn là một lượt ghi rời sau khi ảnh đã commit.
    expect(mockAppendAudit).not.toHaveBeenCalled();
    expect(mockAppendFile).not.toHaveBeenCalled();
  });

  it("truyền kích thước THẬT trên Drive vào transaction, không phải số client khai", async () => {
    mockVerifyUploadedFile.mockResolvedValue({
      driveFileId: "drive_new",
      mimeType: "image/jpeg",
      sizeBytes: 9_999_999,
      checksum: "checksum-new",
      fileName: "OFFICER-CERTIFICATE-2.jpg",
    });

    await complete(completeRequest(CERTIFICATE_BODY), context);

    expect(mockCommitOfficerFileUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        file: expect.objectContaining({ sizeBytes: 9_999_999, checksum: "checksum-new" }),
      }),
    );
  });

  it("khóa chống gửi trùng mang tiền tố riêng của đường cán bộ", async () => {
    await complete(completeRequest(CERTIFICATE_BODY), context);

    expect(mockCommitOfficerFileUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: "OFFICER_UPLOAD_COMPLETE:sub_1:key-1",
        actorEmail: mockUser.email,
      }),
    );
  });

  it("thiếu idempotency-key thì từ chối ngay, không xác minh gì", async () => {
    const request = new NextRequest(
      "http://localhost:3000/api/submissions/sub_1/uploads/complete",
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": "token" },
        body: JSON.stringify(CERTIFICATE_BODY),
      },
    );

    const response = await complete(request, context);

    expect(response.status).toBe(400);
    expect(mockVerifyUploadedFile).not.toHaveBeenCalled();
  });

  it("khóa trùng nhưng nội dung khác → 409, tệp mồ côi được dọn", async () => {
    mockCommitOfficerFileUpload.mockRejectedValue(new SubmissionIdempotencyConflictError());

    const response = await complete(completeRequest(CERTIFICATE_BODY), context);

    expect(response.status).toBe(409);
    expect(mockDiscardIfOrphan).toHaveBeenCalledTimes(1);
  });

  it("lỗi hạ tầng khi ghi vẫn dọn tệp mồ côi rồi trả 500", async () => {
    mockCommitOfficerFileUpload.mockRejectedValue(new Error("mất kết nối cơ sở dữ liệu"));

    const response = await complete(completeRequest(CERTIFICATE_BODY), context);

    expect(response.status).toBe(500);
    expect(mockDiscardIfOrphan).toHaveBeenCalledTimes(1);
  });
});

describe("mỗi lý do từ chối được dịch sang đúng mã HTTP", () => {
  const cases = [
    ["NOT_FOUND", 404],
    ["FORBIDDEN", 403],
    ["OWNER_INVALID", 400],
    ["REPLACE_TARGET_INVALID", 409],
    ["SLOT_CONFLICT", 409],
    ["CERTIFICATE_LIMIT", 409],
    ["BYTE_BUDGET", 400],
  ] as const;

  it.each(cases)("%s → HTTP %i, kèm dọn tệp mồ côi", async (reason, status) => {
    mockCommitOfficerFileUpload.mockRejectedValue(
      new OfficerFileMutationRejectedError(reason, `từ chối: ${reason}`),
    );

    const response = await complete(completeRequest(CERTIFICATE_BODY), context);

    expect(response.status).toBe(status);
    expect(mockDiscardIfOrphan).toHaveBeenCalledTimes(1);
  });
});

describe("initiate vẫn chặn sớm những gì kiểm được trước khi mở phiên Drive", () => {
  it("chặn ảnh không phải định dạng ảnh", async () => {
    const response = await initiate(
      initiateRequest({
        documentType: "CERTIFICATE",
        mimeType: "application/pdf",
        fileName: "gcn.pdf",
        sizeBytes: 1000,
      }),
      context,
    );

    expect(response.status).toBe(400);
    expect(mockCreateUploadSession).not.toHaveBeenCalled();
  });

  it("chặn ảnh vượt MAX_UPLOAD_MB", async () => {
    const response = await initiate(
      initiateRequest({
        documentType: "CERTIFICATE",
        mimeType: "image/jpeg",
        sizeBytes: 31 * 1024 * 1024,
      }),
      context,
    );

    expect(response.status).toBe(400);
  });

  it("chặn khi hồ sơ đã đủ trần ảnh Giấy chứng nhận", async () => {
    mockListFiles.mockResolvedValue(
      Array.from({ length: MAX_CERTIFICATE_PHOTOS }, (_, index) =>
        storedFile({ fileId: `file_${index}` }),
      ),
    );

    const response = await initiate(
      initiateRequest({ documentType: "CERTIFICATE", mimeType: "image/jpeg", sizeBytes: 1000 }),
      context,
    );

    expect(response.status).toBe(409);
  });

  it("chặn khi tổng dung lượng vượt ngân sách của hồ sơ", async () => {
    mockListFiles.mockResolvedValue([storedFile({ sizeBytes: SUBMISSION_BYTE_BUDGET - 100 })]);

    const response = await initiate(
      initiateRequest({ documentType: "CERTIFICATE", mimeType: "image/jpeg", sizeBytes: 1000 }),
      context,
    );

    expect(response.status).toBe(400);
  });

  it("trừ đúng ảnh bị thay khỏi ngân sách", async () => {
    mockListFiles.mockResolvedValue([
      storedFile({ fileId: "file_old", sizeBytes: SUBMISSION_BYTE_BUDGET - 100 }),
    ]);

    const response = await initiate(
      initiateRequest({
        documentType: "CERTIFICATE",
        mimeType: "image/jpeg",
        sizeBytes: 1000,
        replaceFileId: "file_old",
      }),
      context,
    );

    expect(response.status).toBe(200);
  });

  it("chặn ảnh CCCD trùng chỗ khi không kèm replaceFileId", async () => {
    mockListFiles.mockResolvedValue([
      storedFile({
        fileId: "file_cccd",
        documentType: "CITIZEN_ID_FRONT",
        ownerId: "owner_1",
      }),
    ]);

    const response = await initiate(
      initiateRequest({
        documentType: "CITIZEN_ID_FRONT",
        ownerId: "owner_1",
        mimeType: "image/jpeg",
        sizeBytes: 1000,
      }),
      context,
    );

    expect(response.status).toBe(409);
  });

  it("chặn ảnh CCCD gán cho chủ là tổ chức", async () => {
    const response = await initiate(
      initiateRequest({
        documentType: "CITIZEN_ID_FRONT",
        ownerId: "owner_org",
        mimeType: "image/jpeg",
        sizeBytes: 1000,
      }),
      context,
    );

    expect(response.status).toBe(400);
  });

  /**
   * Chủ do cán bộ thêm ở Bàn làm việc chỉ tồn tại ở `working_payload`. Đọc `draft_json` là ảnh CCCD
   * của chủ vừa thêm không gắn được vào ai.
   */
  it("nhận chủ sử dụng chỉ có trong working payload", async () => {
    const working = makeDraft();
    working.owners = [
      { ...emptyOwner("owner_new"), fullName: "Chủ cán bộ vừa thêm", ownerType: "CA_NHAN" },
    ];
    mockFindById.mockResolvedValue(makeRecord({ workingPayload: working }));

    const response = await initiate(
      initiateRequest({
        documentType: "CITIZEN_ID_FRONT",
        ownerId: "owner_new",
        mimeType: "image/jpeg",
        sizeBytes: 1000,
      }),
      context,
    );

    expect(response.status).toBe(200);
  });

  it("tên tệp trong kho do máy chủ đặt, không mang mảnh nào của tên client", async () => {
    await initiate(
      initiateRequest({
        documentType: "CERTIFICATE",
        mimeType: "image/jpeg",
        fileName: "CCCD-025080001234-Nguyen Van A.jpg",
        sizeBytes: 1000,
      }),
      context,
    );

    const fileName = (mockCreateUploadSession.mock.calls[0]?.[0] as { fileName: string }).fileName;
    expect(fileName).toMatch(/^OFFICER-CERTIFICATE-\d+-[0-9a-f]{8}\.jpg$/);
    expect(fileName).not.toContain("025080001234");
    expect(fileName).not.toContain("Nguyen");
  });

  it("mọi phản hồi đều no-store — hồ sơ và ảnh giấy tờ là PII", async () => {
    const ok = await initiate(
      initiateRequest({ documentType: "CERTIFICATE", mimeType: "image/jpeg", sizeBytes: 1000 }),
      context,
    );
    const committed = await complete(completeRequest(CERTIFICATE_BODY), context);

    expect(ok.headers.get("cache-control")).toBe("no-store");
    expect(committed.headers.get("cache-control")).toBe("no-store");
  });

  it("không trả Drive ID hay URL phiên ra response của complete", async () => {
    const response = await complete(completeRequest(CERTIFICATE_BODY), context);
    const body = JSON.stringify(await payload(response));

    expect(body).not.toContain("drive_new");
    expect(body).not.toContain("folder_1");
  });
});
