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
import type { PublicFileSummary, PublicStatus } from "@/modules/public-intake/workflow";

// Chỉ số cột (0-based) trong dòng 49 cột, khớp thứ tự B..AX của PL3_COLUMNS.
const COL = {
  wardCode: 0, // 1
  issueNumber: 1, // 2
  issueDate: 2, // 3
  orgName: 4, // 5
  orgId: 5, // 6
  personName: 6, // 7
  dob: 7, // 8
  gender: 8, // 9
  citizenId: 9, // 10
  ownerType: 11, // 12
  role: 12, // 13
  currentUserName: 13, // O
  currentUserId: 14, // P
  currentUserAddress: 15, // 14
  changeReason: 16, // 15
  parcelId: 17, // 16
  mapSheetOnCertificate: 18, // 17
  parcelOnCertificate: 19, // 18
  field19: 20, // 19
  field20: 21, // 20
  parcelAddress: 22, // 23
  parcelArea: 23, // 24
  landType1: 24, // 25
  landArea1: 25, // 26
  origin1: 26, // 27
  form1: 27, // 28
  term1: 28, // 29
  landType2: 29, // 30
  landType3: 34, // 35
  assetType: 39, // 40
  mixedUseBuilding: 40, // 41
  apartmentBuilding: 41, // 42
  apartmentNumber: 42, // 43
  constructionArea: 43, // 44
  floorArea: 44, // 45
  ownershipForm: 45, // 46
  ownershipTerm: 46, // 47
  grade: 47, // 48
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

function record(
  status: PublicStatus,
  draftValue: IntakeDraft | null,
  fileSummaries: readonly PublicFileSummary[] = [],
): SubmissionRecord {
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
    claimedByDisplayName: "",
    intakeChannel: "SELF_SERVICE" as const,
    assistedByEmail: "",
    assistedByDisplayName: "",
    assistedAt: "",
    claimedAt: "",
    createdAt: "2026-07-23T00:00:00.000Z",
    updatedAt: "2026-07-23T00:00:00.000Z",
    draft: draftValue,
    accessVersion: 1,
    fileSummaries,
    rowIndex: 1,
  };
}

function fileSummary(overrides: Partial<PublicFileSummary> = {}): PublicFileSummary {
  return {
    fileId: "f1",
    ownerId: "own_1",
    documentType: "CERTIFICATE",
    status: "UPLOADED",
    sizeBytes: 1024,
    checksum: "abc",
    createdAt: "2026-07-23T00:00:00.000Z",
    updatedAt: "2026-07-23T00:00:00.000Z",
    driveFileId: "drive_1",
    mimeType: "image/jpeg",
    ...overrides,
  };
}

describe("PL3 header và bất biến cột", () => {
  it("có đúng 49 cột dữ liệu", () => {
    expect(PL3_COLUMNS).toHaveLength(PL3_DATA_COLUMN_COUNT);
  });

  it("giữ nguyên tên từng cột B–AX từ PL3.xlsx, không tự đổi tên hoặc dịch", () => {
    expect(PL3_COLUMNS.map((column) => column.label)).toEqual([
      "Mã ĐVHC cấp xã",
      "Số phát hành GCN",
      "Ngày cấp GCN",
      "Số vào sổ GCN",
      "Tên tổ chức",
      "Số định danh tổ chức",
      "Họ và tên chủ sử dụng/\nHọ tên người đại diện tổ chức",
      "Ngày, tháng, năm sinh",
      "Giới tính",
      "Số định danh cá nhân/CCCD",
      "Địa chỉ thường trú",
      "Pháp nhân trên GCN",
      "Vai trò pháp nhân trên GCN",
      "Tên người sử dụng hiện tại",
      "Số định danh cá nhân (CCCD)",
      "địa chỉ thường trú (2 cấp)",
      "Lý do thay đổi (thừa kế, tặng cho, chuyển nhượng...)",
      "Mã định danh thửa đất",
      "Số tờ bản đồ ghi trên GCN",
      "Số thứ tự thửa đất ghi trên GCN",
      "Số hiệu tờ trên bản đồ địa chính",
      "Số thứ tự thửa trên bản đồ địa chính",
      "Địa chỉ thửa đất",
      "Diện tích thửa đất",
      "Loại đất",
      "Diện tích",
      "Nguồn gốc sử dụng",
      "Hình thức sử dụng ",
      "Thời hạn sử dụng",
      "Loại đất",
      "Diện tích",
      "Nguồn gốc sử dụng",
      "Hình thức sử dụng ",
      "Thời hạn sử dụng",
      "Loại đất",
      "Diện tích",
      "Nguồn gốc sử dụng",
      "Hình thức sử dụng ",
      "Thời hạn sử dụng",
      "Loại tài sản gắn liền với đất",
      "Khu nhà chung cư, nhà hỗn hợp",
      "Nhà chung cư",
      "Số căn hộ",
      "Diện tích xây dựng",
      "Diện tích sàn",
      "Hình thức sở hữu",
      "Thời hạn sở hữu",
      "Cấp hạng",
      "Tên file quét GCN/CCCD",
    ]);
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
  it("một file mỗi nhóm — không thêm STT, đuôi theo mimeType thật", () => {
    const files = [
      fileSummary({ fileId: "f1", documentType: "CERTIFICATE", mimeType: "image/jpeg" }),
      fileSummary({ fileId: "f2", documentType: "CITIZEN_ID_FRONT", mimeType: "image/png" }),
    ];
    expect(scannedFileNames("AD 266864", files)).toBe("AD 266864-GCN.jpg; AD 266864-GT.png");
  });

  it("nhiều file cùng nhóm (GT gộp cả mặt trước/sau) — đánh STT theo thứ tự", () => {
    const files = [
      fileSummary({ fileId: "f1", documentType: "CITIZEN_ID_FRONT", mimeType: "image/jpeg" }),
      fileSummary({ fileId: "f2", documentType: "CITIZEN_ID_BACK", mimeType: "image/jpeg" }),
    ];
    expect(scannedFileNames("AD 266864", files)).toBe("AD 266864-GT-01.jpg; AD 266864-GT-02.jpg");
  });

  it("bỏ qua file đã REPLACED/DELETED", () => {
    const files = [
      fileSummary({ fileId: "f1", documentType: "CERTIFICATE", status: "REPLACED" }),
      fileSummary({ fileId: "f2", documentType: "CERTIFICATE", mimeType: "image/png" }),
    ];
    expect(scannedFileNames("AD 266864", files)).toBe("AD 266864-GCN.png");
  });

  it("rỗng khi không có số phát hành hoặc không có file", () => {
    expect(scannedFileNames("  ", [fileSummary()])).toBe("");
    expect(scannedFileNames("AD 266864", [])).toBe("");
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
    const [row] = buildSubmissionRows(
      record("ACCEPTED", draft(), [
        fileSummary({ fileId: "f1", documentType: "CERTIFICATE", mimeType: "image/jpeg" }),
      ]),
    ).rows;
    expect(row).toHaveLength(PL3_DATA_COLUMN_COUNT);
    expect(row[COL.wardCode]).toBe(WARD_ADMIN_CODE);
    expect(row[COL.issueDate]).toBe("20/02/2006");
    expect(row[COL.personName]).toBe("Nguyễn Văn A");
    expect(row[COL.gender]).toBe("Nam");
    expect(row[COL.ownerType]).toBe("Cá nhân");
    expect(row[COL.role]).toBe("Cá nhân");
    expect(row[COL.landType1]).toBe("Đất ở tại đô thị");
    expect(row[COL.scannedFile]).toBe("AD 266864-GCN.jpg");
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

  it("tổ chức và người đại diện xuất ở hai nhóm F/G và H–L riêng biệt", () => {
    const [row] = buildSubmissionRows(
      record(
        "ACCEPTED",
        draft({
          owners: [
            owner({
              ownerType: "TO_CHUC",
              organisationName: "HTX Phong Châu",
              organisationIdentityNumber: "0100109106",
              fullName: "Nguyễn Văn Đại Diện",
              identityNumber: "012345678901",
            }),
          ],
        }),
      ),
    ).rows;
    expect(row[COL.orgName]).toBe("HTX Phong Châu");
    expect(row[COL.orgId]).toBe("0100109106");
    expect(row[COL.personName]).toBe("Nguyễn Văn Đại Diện");
    expect(row[COL.dob]).toBe("06/05/1980");
    expect(row[COL.citizenId]).toBe("012345678901");
  });

  it("chỉ ghi tối đa 3 bộ loại đất và cảnh báo rõ nếu payload cũ có dòng thứ tư", () => {
    const built = buildSubmissionRows(
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
    );
    const [row] = built.rows;
    expect(row[COL.landType1]).toBe("Đất ở tại đô thị");
    expect(row[COL.landType2]).toBe("Đất ở tại nông thôn");
    expect(row[COL.landType3]).toBe("Đất trồng cây lâu năm");
    // Không có cột thứ tư — "Đất chuyên trồng lúa" không xuất hiện.
    expect(row).not.toContain("Đất chuyên trồng lúa");
    expect(built.warnings.some((warning) => warning.includes("chỉ có 3 nhóm cột"))).toBe(true);
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

  it("trường 19 tra tự động được và trường 20 giữ giá trị cán bộ nhập", () => {
    const [row] = buildSubmissionRows(
      record(
        "ACCEPTED",
        draft({
          parcels: [
            parcel({
              oldWard: "PHU_HO",
              mapSheetNumber: "5",
              cadastralParcelNumber: "12-A",
            }),
          ],
        }),
      ),
    ).rows;
    expect(row[COL.field19]).toBe("5");
    expect(row[COL.field20]).toBe("12-A");
  });

  it("đối chiếu chính xác toàn bộ cột B–AX, gồm ghi đè tự động và AO–AW", () => {
    const fullOwner = owner({
      ownerType: "TO_CHUC",
      organisationName: "Công ty Phong Châu",
      organisationIdentityNumber: "0100109106",
      fullName: "Nguyễn Văn Đại Diện",
      identityNumber: "012345678901",
      dateOfBirth: "1980-05-06",
      gender: "NAM",
      residenceAddress: "Phường Phong Châu",
      roleOnCertificate: "NGUOI_DAI_DIEN",
      hasDistinctCurrentUser: true,
      currentUserName: "Trần Thị Hiện Tại",
      currentUserCitizenId: "109876543210",
      currentUserAddress: "Tổ 2, Phong Châu",
      changeReason: "CHUYEN_NHUONG",
    });
    const fullParcel = parcel({
      parcelIdCode: "07954.1.2",
      mapSheetNumber: "5",
      parcelNumber: "12",
      oldWard: "PHU_HO",
      cadastralMapSheetNumber: "105",
      cadastralMapSheetOverrideReason: "Theo bản đồ địa chính đã đối chiếu",
      cadastralParcelNumber: "12-A",
      addressOnCertificate: "Khu 1, Phong Châu",
      area: "150",
      landUses: [
        {
          ...emptyLandUse("lu1"),
          purposeCode: "ODT",
          area: "80",
          originCode: "NHAN_CHUYEN_QUYEN",
          formCode: "SU_DUNG_RIENG",
          termCode: "SU_DUNG_ON_DINH_LAU_DAI",
        },
        {
          ...emptyLandUse("lu2"),
          purposeCode: "ONT",
          area: "40",
          originCode: "NHA_NUOC_CONG_NHAN",
          formCode: "SU_DUNG_CHUNG",
          termCode: "SU_DUNG_CO_THOI_HAN",
        },
        {
          ...emptyLandUse("lu3"),
          purposeCode: "CLN",
          area: "30",
          originCode: "THUA_KE_TANG_CHO",
          formCode: "SU_DUNG_RIENG_VA_CHUNG",
          termCode: "SU_DUNG_ON_DINH_LAU_DAI",
        },
      ],
    });
    const fullAsset = {
      ...emptyAsset("asset1", fullParcel.id),
      assetType: "NHA_O",
      mixedUseBuildingName: "Khu hỗn hợp A",
      apartmentBuildingName: "Tòa CT1",
      apartmentNumber: "A-1203",
      constructionArea: "90",
      floorArea: "180",
      ownershipForm: "Sở hữu riêng",
      ownershipTerm: "Lâu dài",
      grade: "Cấp II",
    };
    const [row] = buildSubmissionRows(
      record(
        "ACCEPTED",
        draft({
          owners: [fullOwner],
          parcels: [fullParcel],
          assets: [fullAsset],
          wardAdministrativeCodeOverride: "07999",
          wardAdministrativeCodeOverrideReason: "Theo quyết định điều chỉnh mã hành chính",
          scannedFileNamesOverride: "GCN-doi-chieu.pdf; CCCD-doi-chieu.pdf",
          scannedFileNamesOverrideReason: "Theo danh mục hồ sơ bàn giao đã xác nhận",
        }),
      ),
    ).rows;

    expect(row).toEqual([
      "07999",
      "AD 266864",
      "20/02/2006",
      "H 00055",
      "Công ty Phong Châu",
      "0100109106",
      "Nguyễn Văn Đại Diện",
      "06/05/1980",
      "Nam",
      "012345678901",
      "Phường Phong Châu",
      "Tổ chức",
      "Người đại diện",
      "Trần Thị Hiện Tại",
      "109876543210",
      "Tổ 2, Phong Châu",
      "Chuyển nhượng",
      "07954.1.2",
      "5",
      "12",
      "105",
      "12-A",
      "Khu 1, Phong Châu",
      "150",
      "Đất ở tại đô thị",
      "80",
      "Nhận chuyển quyền sử dụng đất",
      "Sử dụng riêng",
      "Sử dụng ổn định lâu dài",
      "Đất ở tại nông thôn",
      "40",
      "Nhà nước công nhận quyền sử dụng đất",
      "Sử dụng chung",
      "Sử dụng có thời hạn (ghi rõ đến ngày trên GCN)",
      "Đất trồng cây lâu năm",
      "30",
      "Thừa kế, tặng cho quyền sử dụng đất",
      "Sử dụng riêng và sử dụng chung",
      "Sử dụng ổn định lâu dài",
      "Nhà ở",
      "Khu hỗn hợp A",
      "Tòa CT1",
      "A-1203",
      "90",
      "180",
      "Sở hữu riêng",
      "Lâu dài",
      "Cấp II",
      "GCN-doi-chieu.pdf; CCCD-doi-chieu.pdf",
    ]);
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
