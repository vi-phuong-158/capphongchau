import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { UserRole } from "@/modules/common/domain";

const mockUser = {
  email: "officer@phongchau.gov.vn",
  displayName: "Cán bộ Test",
  roles: [UserRole.REVIEW_OFFICER],
  id: "user_1",
};

vi.mock("@/modules/auth/authorization", () => ({
  requireActiveUser: vi.fn().mockImplementation(async () => mockUser),
  AuthorizationError: class AuthorizationError extends Error {
    kind: "ACCESS_DENIED" | "UNAUTHENTICATED";
    constructor(kind: "ACCESS_DENIED" | "UNAUTHENTICATED", message: string) {
      super(message);
      this.kind = kind;
    }
  },
}));

const mockFindById = vi.fn();
const mockFindActiveFile = vi.fn();
const mockListFiles = vi.fn();
const mockAppendAudit = vi.fn();

vi.mock("@/modules/public-intake/repository", () => ({
  getPublicIntakeRepository: vi.fn().mockReturnValue({
    findById: (...args: unknown[]) => mockFindById(...args),
    findActiveFile: (...args: unknown[]) => mockFindActiveFile(...args),
    listFiles: (...args: unknown[]) => mockListFiles(...args),
    appendAudit: (...args: unknown[]) => mockAppendAudit(...args),
  }),
}));

const mockReadOriginal = vi.fn();

vi.mock("@/modules/public-intake/storage", () => ({
  getPublicIntakeStorage: vi.fn().mockReturnValue({
    readOriginal: (...args: unknown[]) => mockReadOriginal(...args),
  }),
  PreviewUnavailableError: class PreviewUnavailableError extends Error {},
}));

const { GET } = await import("@/app/api/submissions/[submissionId]/files/[fileId]/route");

function makeContext() {
  return { params: Promise.resolve({ submissionId: "sub_1", fileId: "file_2" }) };
}

const request = new NextRequest("http://localhost:3000/api/submissions/sub_1/files/file_2");

describe("GET /api/submissions/:id/files/:fileId — chỉ truy vấn đúng một tệp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindById.mockResolvedValue({ submissionId: "sub_1" });
    mockAppendAudit.mockResolvedValue(undefined);
    mockReadOriginal.mockResolvedValue({
      bytes: Buffer.from([1, 2, 3]),
      contentType: "image/jpeg",
    });
  });

  /**
   * Trước Đợt 2B route này gọi `listFiles` rồi `.find(...)` — kéo toàn bộ ảnh của hồ sơ về chỉ để
   * lấy một tệp. Test khóa lại đường mới để không ai vô tình quay về cách cũ.
   */
  it("dùng findActiveFile, không gọi listFiles", async () => {
    mockFindActiveFile.mockResolvedValue({
      fileId: "file_2",
      driveFileId: "drive_2",
      documentType: "CERTIFICATE",
      status: "UPLOADED",
    });

    const response = await GET(request, makeContext());

    expect(response.status).toBe(200);
    expect(mockFindActiveFile).toHaveBeenCalledWith("sub_1", "file_2");
    expect(mockListFiles).not.toHaveBeenCalled();
    expect(mockReadOriginal).toHaveBeenCalledWith("drive_2");
  });

  it("giữ no-store cho ảnh xem trước (ảnh giấy tờ là PII, không được nằm trong cache)", async () => {
    mockFindActiveFile.mockResolvedValue({
      fileId: "file_2",
      driveFileId: "drive_2",
      documentType: "CERTIFICATE",
      status: "UPLOADED",
    });

    const response = await GET(request, makeContext());

    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("404 khi không có tệp còn hiệu lực, không đọc Drive", async () => {
    mockFindActiveFile.mockResolvedValue(null);

    const response = await GET(request, makeContext());

    expect(response.status).toBe(404);
    expect(mockReadOriginal).not.toHaveBeenCalled();
    expect(mockAppendAudit).not.toHaveBeenCalled();
  });
});
