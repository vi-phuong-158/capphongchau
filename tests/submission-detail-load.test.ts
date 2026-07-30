import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SubmissionRecord } from "@/modules/public-intake/repository";
import { emptyOwner, type IntakeDraft } from "@/modules/public-intake/types";

/**
 * `loadStaffSubmissionDetail` (`src/modules/submissions/detail.ts`) là **đường đọc duy nhất** của
 * màn duyệt hồ sơ: cả `GET /api/submissions/:id` và trang server `/submissions/[submissionId]` gọi
 * nó. Bộ test này khóa bốn cam kết của đường đó — dấu vết audit, lớp dữ liệu hiệu lực, ghi chú nội
 * bộ, và việc **hai lượt đọc chạy song song** (tối ưu hiệu năng của Phase 2, rất dễ bị một lần sửa
 * "cho dễ đọc" biến trở lại thành nối tiếp).
 *
 * Bản trước của bộ test này nhắm vào `detail-view.ts` — một service thứ hai cùng chức năng, đọc nối
 * tiếp. Service đó đã bị gỡ; giữ hai đường đọc song song là cách chắc chắn để chúng lệch nhau.
 */

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

const { loadStaffSubmissionDetail } = await import("@/modules/submissions/detail");

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

const READ_INPUT = {
  submissionId: "sub_1",
  actorEmail: "officer@phongchau.gov.vn",
  canResetAccessSecret: false,
  auditDetailView: true,
} as const;

describe("loadStaffSubmissionDetail — đường đọc dùng chung cho API và server-priming", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListFiles.mockResolvedValue([]);
    mockAppendAudit.mockResolvedValue(undefined);
  });

  it("trả null và KHÔNG ghi audit khi không có hồ sơ", async () => {
    mockFindById.mockResolvedValue(null);

    const result = await loadStaffSubmissionDetail({
      ...READ_INPUT,
      submissionId: "sub_missing",
      requestId: "req-1",
    });

    expect(result).toBeNull();
    expect(mockAppendAudit).not.toHaveBeenCalled();
  });

  /**
   * Đây là cam kết chính của Đợt 2B: server-priming không được làm mất dấu vết "ai đã xem hồ sơ
   * nào". Audit nằm trong hàm dùng chung nên cả API và trang server đều ghi.
   */
  it("ghi đúng MỘT dòng audit SUBMISSION_SENSITIVE_DETAIL_VIEWED cho mỗi lần đọc", async () => {
    mockFindById.mockResolvedValue(makeRecord());

    await loadStaffSubmissionDetail({ ...READ_INPUT, requestId: "req-2" });

    expect(mockAppendAudit).toHaveBeenCalledTimes(1);
    expect(mockAppendAudit).toHaveBeenCalledWith({
      actorEmail: "officer@phongchau.gov.vn",
      action: "SUBMISSION_SENSITIVE_DETAIL_VIEWED",
      entityId: "sub_1",
      requestId: "req-2",
    });
  });

  it("không ghi audit khi bên gọi không yêu cầu (đường chẩn đoán/benchmark)", async () => {
    mockFindById.mockResolvedValue(makeRecord());

    await loadStaffSubmissionDetail({ ...READ_INPUT, auditDetailView: false });

    expect(mockAppendAudit).not.toHaveBeenCalled();
  });

  it("trả lớp dữ liệu đang có hiệu lực: working payload che draft của người dân", async () => {
    mockFindById.mockResolvedValue(makeRecord({ workingPayload: makeDraft("Cán bộ đã sửa") }));

    const result = await loadStaffSubmissionDetail({ ...READ_INPUT, requestId: "req-3" });

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

    const result = await loadStaffSubmissionDetail({ ...READ_INPUT, requestId: "req-4" });

    expect(result?.internalNotes).toBe("Ghi chú nội bộ");
    expect(result?.files).toEqual([
      { fileId: "file_1", documentType: "CITIZEN_ID_FRONT", ownerId: "owner_1" },
    ]);
    // Không được để lộ driveFileId hay checksum ra màn duyệt — chỉ ba trường trên.
    expect(Object.keys(result?.files[0] ?? {})).toHaveLength(3);
  });

  it("canResetAccessSecret do bên gọi quyết định theo vai trò", async () => {
    mockFindById.mockResolvedValue(makeRecord());

    const asOfficer = await loadStaffSubmissionDetail({ ...READ_INPUT });
    const asWardAdmin = await loadStaffSubmissionDetail({
      ...READ_INPUT,
      canResetAccessSecret: true,
    });

    expect(asOfficer?.canResetAccessSecret).toBe(false);
    expect(asWardAdmin?.canResetAccessSecret).toBe(true);
  });

  /**
   * Hiệu năng: `findById` và `listFiles` không phụ thuộc nhau, nên phải chạy **song song**. Nối
   * tiếp chúng cộng thêm một vòng mạng vào mọi lần mở hồ sơ — đúng phần Phase 2 đã tối ưu, và
   * typecheck/lint không thấy gì khi ai đó đổi lại thành `await` nối tiếp.
   */
  it("đọc hồ sơ và danh sách ảnh song song, không nối tiếp", async () => {
    let filesRequestedAt = -1;
    let recordResolvedAt = -1;
    let tick = 0;
    mockFindById.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      recordResolvedAt = ++tick;
      return makeRecord();
    });
    mockListFiles.mockImplementation(async () => {
      filesRequestedAt = ++tick;
      return [];
    });

    await loadStaffSubmissionDetail({ ...READ_INPUT });

    expect(filesRequestedAt).toBeGreaterThan(0);
    expect(recordResolvedAt).toBeGreaterThan(filesRequestedAt);
  });
});
