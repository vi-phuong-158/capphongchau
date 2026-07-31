/**
 * Đợt 2C (bổ sung) — cán bộ gỡ ảnh Giấy chứng nhận khỏi hồ sơ. **Test hành vi**, gọi thật route
 * `DELETE /api/submissions/:id/files/:fileId` với repository giả.
 *
 * Bất biến quan trọng nhất ở đây **không đối xứng**, giống Phase 5 nhưng vì lý do khác:
 *
 *   - giữ lại một ảnh đáng gỡ → cán bộ bấm lại, mất vài giây;
 *   - xóa thật một ảnh giấy tờ → bằng chứng của hộ dân mất vĩnh viễn, và không ai biết cho tới lúc
 *     cần tra lại.
 *
 * Nên "xóa" ở đây **chỉ được là xóa mềm**: đổi `status` sang `DELETED`, tệp nằm nguyên trên Drive.
 *
 * Ba giới hạn còn lại cũng được khóa vì đều dễ bị nới ra cho "tiện":
 *   1. **Chỉ ảnh `CERTIFICATE`.** `completionChecks.checkFiles` chặn tiếp nhận khi một chủ sử dụng
 *      thiếu CCCD mặt trước/mặt sau, nên mở cửa gỡ CCCD chỉ tạo ra trạng thái không tiếp nhận được.
 *   2. **Cùng cửa quyền với upload** (`mayStaffEdit`), không rộng hơn — và **kiểm lại trong
 *      transaction** sau khi đã khóa hồ sơ, vì giữa lúc kiểm ở route và lúc ghi, hồ sơ có thể đã
 *      được tiếp nhận chính thức hoặc chuyển cho cán bộ khác.
 *   3. **Audit cùng transaction với việc đổi trạng thái ảnh.** Ghi audit sau khi transaction đã
 *      commit là mở đường cho "ảnh đã bị gỡ mà nhật ký không biết ai gỡ".
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { UserRole } from "@/modules/common/domain";

const mockUser = {
  email: "officer@phongchau.gov.vn",
  displayName: "Cán bộ Test",
  roles: [UserRole.REVIEW_OFFICER],
  id: "user_1",
};

const mockRequireActiveUser = vi.hoisted(() => vi.fn());
const mockVerifyCsrf = vi.hoisted(() => vi.fn());
const mockCommitDelete = vi.hoisted(() => vi.fn());
const mockAppendAudit = vi.hoisted(() => vi.fn());
const mockMarkFileDeleted = vi.hoisted(() => vi.fn());
const mockListFiles = vi.hoisted(() => vi.fn());
const mockFindById = vi.hoisted(() => vi.fn());
const mockDiscardFile = vi.hoisted(() => vi.fn());

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
  class FileOwnerReassignConflictError extends Error {}
  class PreviewUnavailableError extends Error {}
  return {
    AuthorizationError,
    OfficerFileMutationRejectedError,
    FileOwnerReassignConflictError,
    PreviewUnavailableError,
  };
});

const { OfficerFileMutationRejectedError } = errors;

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
}));

vi.mock("@/modules/public-intake/repository", () => ({
  getPublicIntakeRepository: vi.fn().mockReturnValue({
    commitOfficerFileDelete: (...args: unknown[]) => mockCommitDelete(...args),
    commitOfficerFileOwnerReassign: vi.fn(),
    appendAudit: (...args: unknown[]) => mockAppendAudit(...args),
    markFileDeleted: (...args: unknown[]) => mockMarkFileDeleted(...args),
    listFiles: (...args: unknown[]) => mockListFiles(...args),
    findById: (...args: unknown[]) => mockFindById(...args),
    findActiveFile: vi.fn(),
  }),
  OfficerFileMutationRejectedError: errors.OfficerFileMutationRejectedError,
  FileOwnerReassignConflictError: errors.FileOwnerReassignConflictError,
}));

vi.mock("@/modules/public-intake/storage", () => ({
  getPublicIntakeStorage: vi.fn().mockReturnValue({
    readPreview: vi.fn(),
    discardFile: (...args: unknown[]) => mockDiscardFile(...args),
  }),
  PreviewUnavailableError: errors.PreviewUnavailableError,
}));

const { DELETE } = await import("@/app/api/submissions/[submissionId]/files/[fileId]/route");

function request(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost:3000/api/submissions/sub_1/files/file_1", {
    method: "DELETE",
    headers: { "x-csrf-token": "token", ...headers },
  });
}

const context = { params: Promise.resolve({ submissionId: "sub_1", fileId: "file_1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireActiveUser.mockResolvedValue(mockUser);
  mockVerifyCsrf.mockReturnValue(true);
  mockCommitDelete.mockResolvedValue({ alreadyDeleted: false });
});

describe("gỡ ảnh là xóa MỀM, không bao giờ chạm Drive", () => {
  it("gỡ thành công mà không gọi bất kỳ đường xóa tệp thật nào", async () => {
    const response = await DELETE(request(), context);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ fileId: "file_1", status: "DELETED" });
    expect(mockDiscardFile).not.toHaveBeenCalled();
  });

  it("đi qua đúng một đường ghi transaction, không tự ghép markFileDeleted + appendAudit", async () => {
    await DELETE(request(), context);

    expect(mockCommitDelete).toHaveBeenCalledWith({
      submissionId: "sub_1",
      fileId: "file_1",
      actorEmail: mockUser.email,
      requestId: expect.any(String),
    });
    // Hai lượt ghi rời nhau là chỗ audit có thể lỗi sau khi ảnh đã bị gỡ.
    expect(mockMarkFileDeleted).not.toHaveBeenCalled();
    expect(mockAppendAudit).not.toHaveBeenCalled();
  });

  it("gọi lại khi ảnh đã DELETED vẫn trả 200 (idempotent), không ghi thêm", async () => {
    mockCommitDelete.mockResolvedValue({ alreadyDeleted: true });

    const response = await DELETE(request(), context);

    expect(response.status).toBe(200);
    expect(mockCommitDelete).toHaveBeenCalledTimes(1);
  });
});

describe("cửa quyền", () => {
  it("CSRF hỏng thì từ chối trước khi ghi gì", async () => {
    mockVerifyCsrf.mockReturnValue(false);

    const response = await DELETE(request(), context);

    expect(response.status).toBe(403);
    expect(mockCommitDelete).not.toHaveBeenCalled();
  });

  it("hồ sơ đổi tay hoặc đã tiếp nhận giữa lúc mở trang và lúc bấm → 403 từ transaction", async () => {
    mockCommitDelete.mockRejectedValue(
      new OfficerFileMutationRejectedError("FORBIDDEN", "Hồ sơ không còn do bạn nhận xử lý."),
    );

    const response = await DELETE(request(), context);

    expect(response.status).toBe(403);
  });

  it("lỗi phân quyền của phiên đăng nhập trả đúng 401/403", async () => {
    mockRequireActiveUser.mockRejectedValue(
      new errors.AuthorizationError("UNAUTHENTICATED", "Chưa đăng nhập."),
    );

    const response = await DELETE(request(), context);

    expect(response.status).toBe(401);
    expect(mockCommitDelete).not.toHaveBeenCalled();
  });
});

describe("mỗi lý do từ chối dịch sang đúng mã HTTP", () => {
  const cases = [
    ["NOT_FOUND", 404],
    ["FILE_NOT_FOUND", 404],
    // Chỉ ảnh Giấy chứng nhận gỡ được — ảnh CCCD dùng chức năng thay ảnh.
    ["DOCUMENT_TYPE_INVALID", 400],
    // Ảnh `REPLACED` đã ra khỏi bộ ảnh hiệu lực bằng luồng thay ảnh.
    ["FILE_INACTIVE", 409],
  ] as const;

  it.each(cases)("%s → HTTP %i", async (reason, status) => {
    mockCommitDelete.mockRejectedValue(
      new OfficerFileMutationRejectedError(reason, `từ chối: ${reason}`),
    );

    const response = await DELETE(request(), context);

    expect(response.status).toBe(status);
  });
});

describe("phản hồi an toàn", () => {
  it("mọi phản hồi đều no-store — hồ sơ là PII", async () => {
    const ok = await DELETE(request(), context);
    mockCommitDelete.mockRejectedValue(
      new OfficerFileMutationRejectedError("FILE_NOT_FOUND", "Không tìm thấy ảnh cần gỡ."),
    );
    const failed = await DELETE(request(), context);

    expect(ok.headers.get("cache-control")).toBe("no-store");
    expect(failed.headers.get("cache-control")).toBe("no-store");
  });

  it("lỗi hạ tầng trả 500 với thông điệp an toàn, không lộ chi tiết nội bộ", async () => {
    mockCommitDelete.mockRejectedValue(new Error("relation public_files does not exist"));

    const response = await DELETE(request(), context);
    const body = JSON.stringify(await response.json());

    expect(response.status).toBe(500);
    expect(body).not.toContain("public_files");
  });
});
