import { beforeEach, describe, expect, it, vi } from "vitest";

import { UserRole } from "@/modules/common/domain";
import type { SubmissionRecord } from "@/modules/public-intake/repository";
import { emptyOwner, type IntakeDraft } from "@/modules/public-intake/types";

const mockFindById = vi.fn();
const mockListFiles = vi.fn();
const mockAppendAudit = vi.fn();

vi.mock("@/modules/public-intake/repository", () => ({
  getPublicIntakeRepository: vi.fn().mockReturnValue({
    findById: (...args: unknown[]) => mockFindById(...args),
    listFiles: (...args: unknown[]) => mockListFiles(...args),
    appendAudit: (...args: unknown[]) => mockAppendAudit(...args),
  }),
}));

const { loadSubmissionDetail } = await import("@/modules/submissions/detail-view");

function makeDraft(fullName: string): IntakeDraft {
  return {
    certificate: { issueNumber: "AD 123456", issueDate: "2020-01-01", registryNumber: "CH001" },
    owners: [{ ...emptyOwner("owner_1"), fullName }],
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
    claimedBy: "officer@phongchau.gov.vn",
    claimedByDisplayName: "Cán bộ Test",
    intakeChannel: "SELF_SERVICE",
    assistedByEmail: "",
    assistedByDisplayName: "",
    assistedAt: "",
    claimedAt: "2026-07-30T08:00:00.000Z",
    createdAt: "2026-07-30T08:00:00.000Z",
    updatedAt: "2026-07-30T08:00:00.000Z",
    draft: makeDraft("Người dân khai"),
    accessVersion: 1,
    fileSummaries: [],
    rowIndex: 1,
    internalNotes: "Ghi chú nội bộ",
    ...overrides,
  };
}

const officer = {
  email: "officer@phongchau.gov.vn",
  roles: [UserRole.REVIEW_OFFICER as string],
};

describe("loadSubmissionDetail — đường đọc dùng chung cho API và server-priming", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListFiles.mockResolvedValue([]);
    mockAppendAudit.mockResolvedValue(undefined);
  });

  it("trả null và KHÔNG ghi audit khi không có hồ sơ", async () => {
    mockFindById.mockResolvedValue(null);

    const result = await loadSubmissionDetail("sub_missing", officer, "req-1");

    expect(result).toBeNull();
    expect(mockAppendAudit).not.toHaveBeenCalled();
    expect(mockListFiles).not.toHaveBeenCalled();
  });

  /**
   * Đây là cam kết chính của Đợt 2B: server-priming không được làm mất dấu vết "ai đã xem hồ sơ
   * nào". Audit nằm trong hàm dùng chung nên cả API và trang server đều ghi.
   */
  it("ghi đúng MỘT dòng audit SUBMISSION_SENSITIVE_DETAIL_VIEWED cho mỗi lần đọc", async () => {
    mockFindById.mockResolvedValue(makeRecord());

    await loadSubmissionDetail("sub_1", officer, "req-2");

    expect(mockAppendAudit).toHaveBeenCalledTimes(1);
    expect(mockAppendAudit).toHaveBeenCalledWith({
      actorEmail: "officer@phongchau.gov.vn",
      action: "SUBMISSION_SENSITIVE_DETAIL_VIEWED",
      entityId: "sub_1",
      requestId: "req-2",
    });
  });

  it("trả lớp dữ liệu đang có hiệu lực: working payload che draft của người dân", async () => {
    mockFindById.mockResolvedValue(
      makeRecord({ workingPayload: makeDraft("Cán bộ đã sửa") }),
    );

    const result = await loadSubmissionDetail("sub_1", officer, "req-3");

    expect(result?.draft?.owners[0]?.fullName).toBe("Cán bộ đã sửa");
    expect(result?.payloadLayer).toBe("WORKING");
    expect(result?.workingPayload?.owners[0]?.fullName).toBe("Cán bộ đã sửa");
  });

  it("giữ ghi chú nội bộ và ánh xạ danh sách ảnh gọn về ba trường màn duyệt cần", async () => {
    mockFindById.mockResolvedValue(makeRecord());
    mockListFiles.mockResolvedValue([
      {
        fileId: "file_1",
        submissionId: "sub_1",
        ownerId: "owner_1",
        documentType: "CITIZEN_ID_FRONT",
        driveFileId: "drive_1",
        mimeType: "image/jpeg",
        sizeBytes: 1024,
        checksum: "abc",
        fileName: "cccd.jpg",
        status: "UPLOADED",
      },
    ]);

    const result = await loadSubmissionDetail("sub_1", officer, "req-4");

    expect(result?.internalNotes).toBe("Ghi chú nội bộ");
    expect(result?.files).toEqual([
      { fileId: "file_1", documentType: "CITIZEN_ID_FRONT", ownerId: "owner_1" },
    ]);
    // Không được để lộ driveFileId hay checksum ra màn duyệt — chỉ ba trường trên.
    expect(Object.keys(result?.files[0] ?? {})).toHaveLength(3);
  });

  it("canResetAccessSecret chỉ bật cho quản trị viên", async () => {
    mockFindById.mockResolvedValue(makeRecord());

    const asOfficer = await loadSubmissionDetail("sub_1", officer, "req-5");
    const asWardAdmin = await loadSubmissionDetail(
      "sub_1",
      { email: "admin@phongchau.gov.vn", roles: [UserRole.WARD_ADMIN as string] },
      "req-6",
    );

    expect(asOfficer?.canResetAccessSecret).toBe(false);
    expect(asWardAdmin?.canResetAccessSecret).toBe(true);
  });
});
