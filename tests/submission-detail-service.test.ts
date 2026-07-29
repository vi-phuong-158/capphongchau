import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFindById = vi.hoisted(() => vi.fn());
const mockListFiles = vi.hoisted(() => vi.fn());
const mockAppendAudit = vi.hoisted(() => vi.fn());

vi.mock("@/modules/public-intake/repository", () => ({
  getPublicIntakeRepository: () => ({
    findById: mockFindById,
    listFiles: mockListFiles,
    appendAudit: mockAppendAudit,
  }),
}));

vi.mock("@/modules/public-intake/payload-layers", () => ({
  effectivePayload: (record: { draft: unknown }) => record.draft,
  payloadLayerOf: () => "WORKING",
}));

import { loadStaffSubmissionDetail } from "@/modules/submissions/detail";

const record = {
  submissionId: "sub_1",
  receiptCode: "PC-001",
  status: "UNDER_REVIEW",
  phone: "0912345678",
  version: 2,
  claimedBy: "reviewer@phongchau.gov.vn",
  claimedByDisplayName: "Cán bộ duyệt",
  intakeChannel: "SELF_SERVICE",
  assistedByDisplayName: "",
  claimedAt: "2026-07-29T08:00:00.000Z",
  createdAt: "2026-07-29T07:00:00.000Z",
  updatedAt: "2026-07-29T08:00:00.000Z",
  officialCaseId: "",
  acceptStep: "",
  draft: { certificate: {}, owners: [], parcels: [], assets: [], phone: "", consentAccepted: true },
};

describe("loadStaffSubmissionDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindById.mockResolvedValue(record);
    mockListFiles.mockResolvedValue([
      {
        fileId: "file_1",
        documentType: "CERTIFICATE",
        ownerId: "",
      },
    ]);
    mockAppendAudit.mockResolvedValue(undefined);
  });

  it("loads the record and active file list once, then audits the server-rendered view", async () => {
    const detail = await loadStaffSubmissionDetail({
      submissionId: "sub_1",
      actorEmail: "reviewer@phongchau.gov.vn",
      canResetAccessSecret: false,
      auditDetailView: true,
    });

    expect(detail).toMatchObject({
      submissionId: "sub_1",
      files: [{ fileId: "file_1", documentType: "CERTIFICATE", ownerId: "" }],
      canResetAccessSecret: false,
    });
    expect(mockFindById).toHaveBeenCalledWith("sub_1");
    expect(mockListFiles).toHaveBeenCalledWith("sub_1");
    expect(mockAppendAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "SUBMISSION_SENSITIVE_DETAIL_VIEWED",
        entityId: "sub_1",
      }),
    );
  });

  it("does not audit a missing submission", async () => {
    mockFindById.mockResolvedValue(null);

    await expect(
      loadStaffSubmissionDetail({
        submissionId: "missing",
        actorEmail: "reviewer@phongchau.gov.vn",
        canResetAccessSecret: false,
        auditDetailView: true,
      }),
    ).resolves.toBeNull();
    expect(mockAppendAudit).not.toHaveBeenCalled();
  });
});
