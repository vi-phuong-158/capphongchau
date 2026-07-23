import { describe, expect, it } from "vitest";

import {
  buildPl3Content,
  buildSubmissionRows,
  formatExportDate,
  PL3_COLUMNS,
  PL3_DATA_COLUMN_COUNT,
  renderPl3Workbook,
  scannedFileNames,
  WARD_ADMIN_CODE,
} from "@/modules/public-intake/pl3-export";
import type { SubmissionRecord } from "@/modules/public-intake/repository";
import {
  emptyAsset,
  emptyLandUse,
  emptyOwner,
  emptyParcel,
  type IntakeDraft,
  type Owner,
  type Parcel,
} from "@/modules/public-intake/types";
import type { PublicStatus } from "@/modules/public-intake/workflow";

// Chỉ số cột (0-based) trong dòng 49 cột, khớp thứ tự B..AX của PL3_COLUMNS.
const COL = {
  wardCode: 0, // 1
  issueNumber: 1, // 2
  issueDate: 2, // 3
  orgName: 4, // 5
  personName: 6, // 7
  dob: 7, // 8
  gender: 8, // 9
  citizenId: 9, // 10
  ownerType: 11, // 12
  role: 12, // 13
  currentUserName: 13, // O
  field19: 20, // 19
  field20: 21, // 20
  landType1: 24, // 25
  landArea1: 25, // 26
  origin1: 26, // 27
  form1: 27, // 28
  term1: 28, // 29
  landType2: 29, // 30
  landType3: 34, // 35
  assetType: 39, // 40
  scannedFile: 48, // 49
} as const;

function owner(overrides: Partial<Owner> = {}): Owner {
  return {
    ...emptyOwner("own_1"),
    fullName: "Nguyễn Văn A",
    identityNumber: "012345678901",
    dateOfBirth: "1980-05-06",
    gender: "NAM",
    residenceAddress: "Tổ 1, Phong Châu",
    roleOnCertificate: "CA_NHAN",
    ...overrides,
  };
}

function parcel(overrides: Partial<Parcel> = {}): Parcel {
  return {
    ...emptyParcel("par_1", "lu_1"),
    parcelNumber: "12",
    area: "96,1",
    addressOnCertificate: "KDC Phú Cường",
    landUses: [{ ...emptyLandUse("lu_1"), purposeCode: "ODT", area: "96,1" }],
    ...overrides,
  };
}

function draft(overrides: Partial<IntakeDraft> = {}): IntakeDraft {
  return {
    certificate: { issueNumber: "AD 266864", issueDate: "2006-02-20", registryNumber: "H 00055" },
    owners: [owner()],
    parcels: [parcel()],
    assets: [],
    phone: "",
    consentAccepted: true,
    ...overrides,
  };
}

function record(status: PublicStatus, draftValue: IntakeDraft | null): SubmissionRecord {
  return {
    submissionId: "sub_1",
    receiptCode: "PC-KK-2026-0001",
    status,
    phone: "",
    version: 1,
    accessCodeHash: "",
    failedAttempts: 0,
    lockedUntil: "",
    consentVersion: "v1",
    consentedAt: "",
    retentionUntil: "",
    driveFolderId: "",
    officialCaseId: "",
    acceptStep: "",
    claimedBy: "",
    claimedAt: "",
    createdAt: "2026-07-23T00:00:00.000Z",
    updatedAt: "2026-07-23T00:00:00.000Z",
    draft: draftValue,
    accessVersion: 1,
    fileSummaries: [],
    rowIndex: 1,
  };
}

describe("PL3 header và bất biến cột", () => {
  it("có đúng 49 cột dữ liệu", () => {
    expect(PL3_COLUMNS).toHaveLength(PL3_DATA_COLUMN_COUNT);
  });
});

describe("formatExportDate", () => {
  it("đổi ISO sang DD/MM/YYYY", () => {
    expect(formatExportDate("2006-02-20")).toBe("20/02/2006");
  });
  it("giữ nguyên chuỗi không phải ISO", () => {
    expect(formatExportDate("20/02/2006")).toBe("20/02/2006");
    expect(formatExportDate("")).toBe("");
  });
});

describe("scannedFileNames", () => {
  it("sinh tên theo quy ước GCN/GT", () => {
    expect(scannedFileNames("AD 266864")).toBe("AD 266864-GCN.pdf; AD 266864-GT.pdf");
  });
  it("rỗng khi không có số phát hành", () => {
    expect(scannedFileNames("  ")).toBe("");
  });
});

describe("buildSubmissionRows — nổ dòng và ánh xạ nhãn", () => {
  it("nổ dòng theo (thửa × người)", () => {
    const built = buildSubmissionRows(
      record("ACCEPTED", draft({ owners: [owner({ id: "o1" }), owner({ id: "o2" })] })),
    );
    expect(built.rows).toHaveLength(2);
    const two = buildSubmissionRows(
      record(
        "ACCEPTED",
        draft({
          owners: [owner({ id: "o1" }), owner({ id: "o2" })],
          parcels: [parcel({ id: "p1" }), parcel({ id: "p2" })],
        }),
      ),
    );
    expect(two.rows).toHaveLength(4);
  });

  it("mỗi dòng đúng 49 cột với hằng số và nhãn từ danh mục", () => {
    const [row] = buildSubmissionRows(record("ACCEPTED", draft())).rows;
    expect(row).toHaveLength(PL3_DATA_COLUMN_COUNT);
    expect(row[COL.wardCode]).toBe(WARD_ADMIN_CODE);
    expect(row[COL.issueDate]).toBe("20/02/2006");
    expect(row[COL.personName]).toBe("Nguyễn Văn A");
    expect(row[COL.gender]).toBe("Nam");
    expect(row[COL.ownerType]).toBe("Cá nhân");
    expect(row[COL.role]).toBe("Cá nhân");
    expect(row[COL.landType1]).toBe("Đất ở tại đô thị");
    expect(row[COL.scannedFile]).toBe("AD 266864-GCN.pdf; AD 266864-GT.pdf");
  });

  it("dịch nhãn nguồn gốc / hình thức / thời hạn / tài sản từ mã", () => {
    const built = buildSubmissionRows(
      record(
        "ACCEPTED",
        draft({
          parcels: [
            parcel({
              landUses: [
                {
                  ...emptyLandUse("lu_1"),
                  purposeCode: "ODT",
                  originCode: "NHAN_CHUYEN_QUYEN",
                  formCode: "SU_DUNG_RIENG",
                  termCode: "SU_DUNG_ON_DINH_LAU_DAI",
                },
              ],
            }),
          ],
          assets: [{ ...emptyAsset("as_1"), assetType: "NHA_O" }],
        }),
      ),
    );
    const [row] = built.rows;
    expect(row[COL.origin1]).toBe("Nhận chuyển quyền sử dụng đất");
    expect(row[COL.form1]).toBe("Sử dụng riêng");
    expect(row[COL.term1]).toBe("Sử dụng ổn định lâu dài");
    expect(row[COL.assetType]).toBe("Nhà ở");
    expect(built.warnings).toHaveLength(0);
  });

  it("vai trò Đồng sử dụng: pháp nhân + vai trò lấy đúng nhãn PL3", () => {
    const [row] = buildSubmissionRows(
      record(
        "ACCEPTED",
        draft({ owners: [owner({ ownerType: "DONG_SU_DUNG", roleOnCertificate: "VO" })] }),
      ),
    ).rows;
    expect(row[COL.ownerType]).toBe("Đồng sử dụng");
    expect(row[COL.role]).toBe("Vợ");
  });

  it("mã vai trò cũ được quy sang nhãn PL3 gần nhất", () => {
    const [row] = buildSubmissionRows(
      record("ACCEPTED", draft({ owners: [owner({ roleOnCertificate: "CHU_SU_DUNG" })] })),
    ).rows;
    expect(row[COL.role]).toBe("Cá nhân");
  });

  it("chủ thể tổ chức: tên ở cột 5, bỏ trống họ tên/ngày sinh/CCCD cá nhân", () => {
    const [row] = buildSubmissionRows(
      record(
        "ACCEPTED",
        draft({
          owners: [
            owner({
              ownerType: "TO_CHUC",
              fullName: "HTX Phong Châu",
              identityNumber: "0100109106",
            }),
          ],
        }),
      ),
    ).rows;
    expect(row[COL.orgName]).toBe("HTX Phong Châu");
    expect(row[COL.personName]).toBe("");
    expect(row[COL.dob]).toBe("");
    expect(row[COL.citizenId]).toBe("");
  });

  it("chỉ ghi tối đa 3 bộ loại đất, bỏ dòng thứ tư", () => {
    const [row] = buildSubmissionRows(
      record(
        "ACCEPTED",
        draft({
          parcels: [
            parcel({
              landUses: [
                { ...emptyLandUse("1"), purposeCode: "ODT" },
                { ...emptyLandUse("2"), purposeCode: "ONT" },
                { ...emptyLandUse("3"), purposeCode: "CLN" },
                { ...emptyLandUse("4"), purposeCode: "LUC" },
              ],
            }),
          ],
        }),
      ),
    ).rows;
    expect(row[COL.landType1]).toBe("Đất ở tại đô thị");
    expect(row[COL.landType2]).toBe("Đất ở tại nông thôn");
    expect(row[COL.landType3]).toBe("Đất trồng cây lâu năm");
    // Không có cột thứ tư — "Đất chuyên trồng lúa" không xuất hiện.
    expect(row).not.toContain("Đất chuyên trồng lúa");
  });

  it("người sử dụng hiện tại chỉ ghi khi bật hasDistinctCurrentUser", () => {
    const off = buildSubmissionRows(record("ACCEPTED", draft())).rows[0];
    expect(off[COL.currentUserName]).toBe("");
    const on = buildSubmissionRows(
      record(
        "ACCEPTED",
        draft({ owners: [owner({ hasDistinctCurrentUser: true, currentUserName: "Trần Thị B" })] }),
      ),
    ).rows[0];
    expect(on[COL.currentUserName]).toBe("Trần Thị B");
  });

  it("trường 19 tra được với xã cũ hợp lệ, trường 20 luôn trống", () => {
    const [row] = buildSubmissionRows(
      record("ACCEPTED", draft({ parcels: [parcel({ oldWard: "PHU_HO", mapSheetNumber: "5" })] })),
    ).rows;
    expect(row[COL.field19]).toBe("5");
    expect(row[COL.field20]).toBe("");
  });

  it("tờ bản đồ mập mờ để trống trường 19 và đẩy cảnh báo", () => {
    const built = buildSubmissionRows(
      record(
        "ACCEPTED",
        draft({ parcels: [parcel({ oldWard: "PHONG_CHAU_CU", mapSheetNumber: "7" })] }),
      ),
    );
    expect(built.rows[0][COL.field19]).toBe("");
    expect(built.warnings.some((w) => w.includes("mập mờ"))).toBe(true);
  });

  it("mã lạ ghi nguyên văn và cảnh báo, không đoán", () => {
    const built = buildSubmissionRows(
      record(
        "ACCEPTED",
        draft({ parcels: [parcel({ landUses: [{ ...emptyLandUse("1"), purposeCode: "XYZ" }] })] }),
      ),
    );
    expect(built.rows[0][COL.landType1]).toBe("XYZ");
    expect(built.warnings.some((w) => w.includes("XYZ"))).toBe(true);
  });

  it('loại đất "ghi theo bìa" xuất thẳng chữ tự do người dân nhập', () => {
    const built = buildSubmissionRows(
      record(
        "ACCEPTED",
        draft({
          parcels: [
            parcel({
              landUses: [
                {
                  ...emptyLandUse("1"),
                  purposeCode: "GHI_THEO_BIA",
                  purposeFreeText: "Đất thổ cư",
                },
              ],
            }),
          ],
        }),
      ),
    );
    expect(built.rows[0][COL.landType1]).toBe("Đất thổ cư");
  });

  it('loại đất "không chắc" để trống kèm cảnh báo cho cán bộ đối chiếu', () => {
    const built = buildSubmissionRows(
      record(
        "ACCEPTED",
        draft({
          parcels: [parcel({ landUses: [{ ...emptyLandUse("1"), purposeCode: "CAN_DOI_CHIEU" }] })],
        }),
      ),
    );
    expect(built.rows[0][COL.landType1]).toBe("");
    expect(built.warnings.some((w) => w.includes("đối chiếu"))).toBe(true);
  });

  it("thiếu thửa hoặc chủ sử dụng: không sinh dòng, có cảnh báo", () => {
    expect(buildSubmissionRows(record("ACCEPTED", draft({ parcels: [] }))).rows).toHaveLength(0);
    expect(buildSubmissionRows(record("ACCEPTED", null)).warnings.length).toBeGreaterThan(0);
  });
});

describe("buildPl3Content — phân báo cáo chính thức và tồn đọng", () => {
  it("ACCEPTED vào chính thức, SUBMITTED vào tồn đọng, DRAFT bỏ qua", () => {
    const content = buildPl3Content([
      record("ACCEPTED", draft()),
      record("SUBMITTED", draft()),
      record("DRAFT", draft()),
    ]);
    expect(content.officialSubmissionCount).toBe(1);
    expect(content.backlogSubmissionCount).toBe(1);
    expect(content.official.rows).toHaveLength(1);
    expect(content.backlog.rows).toHaveLength(1);
  });
});

describe("renderPl3Workbook", () => {
  it("kết xuất được buffer XLSX không rỗng", async () => {
    const content = buildPl3Content([record("ACCEPTED", draft())]);
    const bytes = await renderPl3Workbook(content);
    expect(bytes.byteLength).toBeGreaterThan(0);
    // Chữ ký ZIP của định dạng OOXML (PK\x03\x04).
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
  });
});
