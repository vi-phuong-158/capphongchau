/**
 * Đợt 2C (bổ sung) — cán bộ gán lại chủ sử dụng cho một ảnh CCCD. **Test hành vi**, gọi thật route
 * `PATCH /api/submissions/:id/files/:fileId` với repository giả.
 *
 * Vì sao có chức năng này: cán bộ tải ảnh CCCD của chủ 2 vào ô mặt trước của chủ 1. "Thay ảnh"
 * không áp dụng được (chủ 1 chưa có ảnh nào để thay) và "gỡ ảnh" chỉ để lại ô trống — ảnh của chủ 2
 * biến mất dù ảnh đã đúng, chỉ sai nhãn. Route này sửa đúng cái nhãn đó.
 *
 * Bốn giới hạn được khóa:
 *   1. **Chỉ ảnh CCCD.** Ảnh Giấy chứng nhận không gắn với một chủ sử dụng cụ thể.
 *   2. **Không âm thầm đẩy ảnh ở ô đích xuống lịch sử.** Khác `appendFile` lúc thay ảnh: đó là "tôi
 *      vừa chụp ảnh mới cho đúng người", còn đây là "tôi gán nhãn sai" — nếu ô đích đã có ảnh thì
 *      trả 409 để cán bộ xử lý ảnh đang chiếm chỗ trước.
 *   3. **Idempotent tự nhiên.** Gán lại đúng chủ đang có là no-op thành công, không ghi audit lần
 *      hai.
 *   4. **Quyền + trạng thái + cập nhật + audit trong một transaction,** kiểm lại sau khi khóa hồ sơ.
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
const mockCommitReassign = vi.hoisted(() => vi.fn());
const mockAppendAudit = vi.hoisted(() => vi.fn());
const mockListFiles = vi.hoisted(() => vi.fn());
const mockFindById = vi.hoisted(() => vi.fn());
const mockMarkFileDeleted = vi.hoisted(() => vi.fn());
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
  class FileOwnerReassignConflictError extends Error {
    constructor() {
      super("Chủ sử dụng đích đã có ảnh cho mặt CCCD này.");
    }
  }
  class PreviewUnavailableError extends Error {}
  return {
    AuthorizationError,
    OfficerFileMutationRejectedError,
    FileOwnerReassignConflictError,
    PreviewUnavailableError,
  };
});

const { OfficerFileMutationRejectedError, FileOwnerReassignConflictError } = errors;

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
    commitOfficerFileOwnerReassign: (...args: unknown[]) => mockCommitReassign(...args),
    commitOfficerFileDelete: vi.fn(),
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

const { PATCH } = await import("@/app/api/submissions/[submissionId]/files/[fileId]/route");

function request(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost:3000/api/submissions/sub_1/files/file_1", {
    method: "PATCH",
    headers: { "content-type": "application/json", "x-csrf-token": "token", ...headers },
    body: JSON.stringify(body),
  });
}

const context = { params: Promise.resolve({ submissionId: "sub_1", fileId: "file_1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireActiveUser.mockResolvedValue(mockUser);
  mockVerifyCsrf.mockReturnValue(true);
  mockCommitReassign.mockResolvedValue("REASSIGNED");
});

describe("gán lại chủ sử dụng đi qua đúng một transaction", () => {
  it("gán lại thành công và KHÔNG ghi audit thành lượt riêng", async () => {
    const response = await PATCH(request({ ownerId: "owner_2" }), context);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ fileId: "file_1", ownerId: "owner_2" });
    expect(mockCommitReassign).toHaveBeenCalledWith({
      submissionId: "sub_1",
      fileId: "file_1",
      newOwnerId: "owner_2",
      actorEmail: mockUser.email,
      requestId: expect.any(String),
    });
    // Audit rời nhau là chỗ ảnh có thể đã đổi chủ mà nhật ký không biết ai đổi.
    expect(mockAppendAudit).not.toHaveBeenCalled();
  });

  it("gán lại đúng chủ đang có là no-op thành công (idempotent)", async () => {
    mockCommitReassign.mockResolvedValue("NOOP");

    const response = await PATCH(request({ ownerId: "owner_1" }), context);

    expect(response.status).toBe(200);
    expect(mockAppendAudit).not.toHaveBeenCalled();
  });

  it("không bao giờ gỡ hay xóa ảnh nào trong lúc gán lại", async () => {
    await PATCH(request({ ownerId: "owner_2" }), context);

    expect(mockMarkFileDeleted).not.toHaveBeenCalled();
    expect(mockDiscardFile).not.toHaveBeenCalled();
  });
});

describe("validation và cửa quyền", () => {
  it("thiếu ownerId thì từ chối trước khi ghi gì", async () => {
    const response = await PATCH(request({}), context);

    expect(response.status).toBe(400);
    expect(mockCommitReassign).not.toHaveBeenCalled();
  });

  it("ownerId rỗng cũng bị từ chối", async () => {
    const response = await PATCH(request({ ownerId: "   " }), context);

    expect(response.status).toBe(400);
    expect(mockCommitReassign).not.toHaveBeenCalled();
  });

  it("CSRF hỏng thì từ chối trước khi ghi gì", async () => {
    mockVerifyCsrf.mockReturnValue(false);

    const response = await PATCH(request({ ownerId: "owner_2" }), context);

    expect(response.status).toBe(403);
    expect(mockCommitReassign).not.toHaveBeenCalled();
  });

  it("hồ sơ đổi tay hoặc đã tiếp nhận giữa hai bước → 403 từ transaction", async () => {
    mockCommitReassign.mockRejectedValue(
      new OfficerFileMutationRejectedError("FORBIDDEN", "Hồ sơ không còn do bạn nhận xử lý."),
    );

    const response = await PATCH(request({ ownerId: "owner_2" }), context);

    expect(response.status).toBe(403);
  });
});

describe("mỗi lý do từ chối dịch sang đúng mã HTTP", () => {
  const cases = [
    ["NOT_FOUND", 404],
    ["FILE_NOT_FOUND", 404],
    // Ảnh Giấy chứng nhận không gắn với một chủ sử dụng cụ thể.
    ["DOCUMENT_TYPE_INVALID", 400],
    ["FILE_INACTIVE", 409],
    // Chủ đích không tồn tại trong lớp dữ liệu hiệu lực, hoặc là tổ chức (không có CCCD).
    ["OWNER_INVALID", 400],
  ] as const;

  it.each(cases)("%s → HTTP %i", async (reason, status) => {
    mockCommitReassign.mockRejectedValue(
      new OfficerFileMutationRejectedError(reason, `từ chối: ${reason}`),
    );

    const response = await PATCH(request({ ownerId: "owner_2" }), context);

    expect(response.status).toBe(status);
  });

  /**
   * Ô đích đã có ảnh cùng mặt: trả 409 để cán bộ xử lý ảnh đang chiếm chỗ trước, thay vì âm thầm
   * đẩy một ảnh có thể đang đúng xuống lịch sử.
   */
  it("ô đích đã có ảnh cùng mặt CCCD → 409, không ghi đè", async () => {
    mockCommitReassign.mockRejectedValue(new FileOwnerReassignConflictError());

    const response = await PATCH(request({ ownerId: "owner_2" }), context);

    expect(response.status).toBe(409);
    expect(mockAppendAudit).not.toHaveBeenCalled();
  });
});

describe("phản hồi an toàn", () => {
  it("mọi phản hồi đều no-store", async () => {
    const ok = await PATCH(request({ ownerId: "owner_2" }), context);
    mockCommitReassign.mockRejectedValue(new FileOwnerReassignConflictError());
    const conflict = await PATCH(request({ ownerId: "owner_2" }), context);

    expect(ok.headers.get("cache-control")).toBe("no-store");
    expect(conflict.headers.get("cache-control")).toBe("no-store");
  });

  it("lỗi hạ tầng trả 500 với thông điệp an toàn", async () => {
    mockCommitReassign.mockRejectedValue(new Error("deadlock detected on public_files"));

    const response = await PATCH(request({ ownerId: "owner_2" }), context);
    const body = JSON.stringify(await response.json());

    expect(response.status).toBe(500);
    expect(body).not.toContain("deadlock");
  });
});
