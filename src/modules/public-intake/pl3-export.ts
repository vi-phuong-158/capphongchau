/**
 * Xuất PL3 — biểu mẫu đích cuối cùng (`Tai lieu/PL3.xlsx`, 49 trường).
 *
 * Cấu trúc đã chốt (xem `PLAN2.md` §4, Phụ lục và ảnh render template):
 * - **Mỗi dòng = một (GCN × thửa × người).** Một phiếu kê khai đúng một GCN; nổ dòng theo
 *   `parcels × owners`. Dòng 9/10 của file mẫu là cùng GCN, cùng thửa, hai dòng cho chồng và vợ.
 * - Cột **A = STT** chạy toàn file; **B..AX = 49 cột dữ liệu** (gồm hai cột O, P không đánh số).
 * - Giá trị ghi **bằng chữ**, lấy đúng `label` từ danh mục trong `reference.ts`/`types.ts` — không
 *   tự dịch nhãn, không đoán. Mã lạ (không có trong danh mục) ghi nguyên văn kèm cảnh báo.
 *
 * Module này **thuần** (không I/O) để test được không cần Google. `renderPl3Workbook` gói exceljs
 * riêng ở cuối.
 */
import ExcelJS from "exceljs";

import { buildOriginalFileNames } from "./file-naming";
import { lookupNewMapSheet, OLD_WARDS, type OldWard } from "./map-sheet-reference";
import {
  ASSET_TYPE_OPTIONS,
  CERTIFICATE_ROLE_OPTIONS,
  CHANGE_REASON_OPTIONS,
  LAND_ORIGIN_OPTIONS,
  LAND_PURPOSE_CAN_DOI_CHIEU,
  LAND_PURPOSE_GHI_THEO_BIA,
  LAND_PURPOSE_OPTIONS,
  LAND_USE_FORM_OPTIONS,
  LAND_USE_TERM_OPTIONS,
  normalizeCertificateRole,
  WARD_ADMIN_CODE,
  type ReferenceOption,
} from "./reference";
import type { SubmissionRecord } from "./repository";
import {
  isOrganisationOwner,
  OWNER_TYPE_LABELS,
  type LandUse,
  type Owner,
  type Parcel,
} from "./types";
import type { PublicFileSummary, PublicStatus } from "./workflow";

export { WARD_ADMIN_CODE } from "./reference";

/**
 * Chỉ hồ sơ đã tiếp nhận mới vào báo cáo chính thức (PLAN2 §7). Các trạng thái đang xử lý xuất
 * riêng thành danh sách tồn đọng; DRAFT/EXPIRED/REJECTED/NO_ACTION_REQUIRED không xuất.
 */
export const OFFICIAL_EXPORT_STATUSES: readonly PublicStatus[] = ["ACCEPTED"];
export const BACKLOG_EXPORT_STATUSES: readonly PublicStatus[] = [
  "SUBMITTED",
  "RESUBMITTED",
  "UNDER_REVIEW",
  "NEEDS_SUPPLEMENT",
  "ACCEPTING",
];

/** 49 cột dữ liệu theo đúng thứ tự B..AX. `field` là STT trường PL3 (O, P không đánh số → null). */
export const PL3_COLUMNS: readonly { readonly field: number | null; readonly label: string }[] = [
  { field: 1, label: "Mã ĐVHC cấp xã" },
  { field: 2, label: "Số phát hành GCN" },
  { field: 3, label: "Ngày cấp GCN" },
  { field: 4, label: "Số vào sổ GCN" },
  { field: 5, label: "Tên tổ chức" },
  { field: 6, label: "Số định danh tổ chức" },
  { field: 7, label: "Họ và tên chủ sử dụng/\nHọ tên người đại diện tổ chức" },
  { field: 8, label: "Ngày, tháng, năm sinh" },
  { field: 9, label: "Giới tính" },
  { field: 10, label: "Số định danh cá nhân/CCCD" },
  { field: 11, label: "Địa chỉ thường trú" },
  { field: 12, label: "Pháp nhân trên GCN" },
  { field: 13, label: "Vai trò pháp nhân trên GCN" },
  { field: null, label: "Tên người sử dụng hiện tại" },
  { field: null, label: "Số định danh cá nhân (CCCD)" },
  { field: 14, label: "địa chỉ thường trú (2 cấp)" },
  { field: 15, label: "Lý do thay đổi (thừa kế, tặng cho, chuyển nhượng...)" },
  { field: 16, label: "Mã định danh thửa đất" },
  { field: 17, label: "Số tờ bản đồ ghi trên GCN" },
  { field: 18, label: "Số thứ tự thửa đất ghi trên GCN" },
  { field: 19, label: "Số hiệu tờ trên bản đồ địa chính" },
  { field: 20, label: "Số thứ tự thửa trên bản đồ địa chính" },
  { field: 23, label: "Địa chỉ thửa đất" },
  { field: 24, label: "Diện tích thửa đất" },
  { field: 25, label: "Loại đất" },
  { field: 26, label: "Diện tích" },
  { field: 27, label: "Nguồn gốc sử dụng" },
  { field: 28, label: "Hình thức sử dụng " },
  { field: 29, label: "Thời hạn sử dụng" },
  { field: 30, label: "Loại đất" },
  { field: 31, label: "Diện tích" },
  { field: 32, label: "Nguồn gốc sử dụng" },
  { field: 33, label: "Hình thức sử dụng " },
  { field: 34, label: "Thời hạn sử dụng" },
  { field: 35, label: "Loại đất" },
  { field: 36, label: "Diện tích" },
  { field: 37, label: "Nguồn gốc sử dụng" },
  { field: 38, label: "Hình thức sử dụng " },
  { field: 39, label: "Thời hạn sử dụng" },
  { field: 40, label: "Loại tài sản gắn liền với đất" },
  { field: 41, label: "Khu nhà chung cư, nhà hỗn hợp" },
  { field: 42, label: "Nhà chung cư" },
  { field: 43, label: "Số căn hộ" },
  { field: 44, label: "Diện tích xây dựng" },
  { field: 45, label: "Diện tích sàn" },
  { field: 46, label: "Hình thức sở hữu" },
  { field: 47, label: "Thời hạn sở hữu" },
  { field: 48, label: "Cấp hạng" },
  { field: 49, label: "Tên file quét GCN/CCCD" },
];

/** Số cột dữ liệu (không kể STT). Kiểm bất biến để mapping và header không lệch nhau. */
export const PL3_DATA_COLUMN_COUNT = 49;

export interface Pl3BuildResult {
  /** Mỗi phần tử là một dòng 49 giá trị (không kèm STT). */
  readonly rows: string[][];
  /** Cảnh báo dữ liệu (mã lạ, tra tờ bản đồ mập mờ…) để cán bộ rà lại — không chặn xuất. */
  readonly warnings: string[];
}

/** Tra `label` theo mã; mã rỗng → "", mã lạ → ghi nguyên văn và đẩy một cảnh báo. */
function labelOf(
  options: readonly ReferenceOption[],
  code: string,
  context: string,
  warnings: string[],
): string {
  const trimmed = code.trim();
  if (!trimmed) return "";
  const match = options.find((option) => option.code === trimmed);
  if (match) return match.label;
  warnings.push(`${context}: mã "${trimmed}" không có trong danh mục — ghi nguyên văn.`);
  return trimmed;
}

function genderLabel(gender: string): string {
  if (gender === "NAM") return "Nam";
  if (gender === "NU") return "Nữ";
  return "";
}

/** ISO `YYYY-MM-DD` → `DD/MM/YYYY`. Giá trị khác định dạng giữ nguyên (PL3 mẫu trộn hai kiểu). */
export function formatExportDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return value.trim();
  const [, year, month, day] = match;
  return `${day}/${month}/${year}`;
}

function isOldWard(value: string): value is OldWard {
  return (OLD_WARDS as readonly string[]).includes(value);
}

/** Trường 19 — tự suy ra, trừ khi cán bộ đã ghi đè kèm lý do trong bản làm việc. */
function field19(parcel: Parcel, context: string, warnings: string[]): string {
  const override = parcel.cadastralMapSheetNumber?.trim() ?? "";
  if (override) {
    warnings.push(`${context}: trường 19 dùng giá trị cán bộ ghi đè (đã lưu lý do trong audit).`);
    return override;
  }
  const ward = parcel.oldWard.trim();
  const sheet = parcel.mapSheetNumber.trim();
  if (!isOldWard(ward) || !sheet) return "";
  const result = lookupNewMapSheet(ward, sheet);
  if (result.status === "RESOLVED") return result.newSheet;
  if (result.status === "AMBIGUOUS") {
    warnings.push(
      `${context}: tờ bản đồ ${sheet} mập mờ (thiếu tỷ lệ) — cán bộ xác định trường 19.`,
    );
  } else {
    warnings.push(`${context}: không tra được tờ bản đồ ${sheet} — cán bộ xác định trường 19.`);
  }
  return "";
}

/**
 * Tên file quét (trường 49) — liệt kê đúng tên file thật đã được đổi trên Drive lúc tiếp nhận
 * chính thức (`acceptance-saga.ts`, dùng chung `buildOriginalFileNames`). Chỉ tính file còn hiệu
 * lực (`UPLOADED`); không có file hoặc chưa có số phát hành → trả rỗng.
 */
export function scannedFileNames(
  issueNumber: string,
  fileSummaries: readonly PublicFileSummary[] | string | unknown,
): string {
  let list: readonly PublicFileSummary[] = [];
  if (Array.isArray(fileSummaries)) {
    list = fileSummaries;
  } else if (typeof fileSummaries === "string") {
    try {
      const parsed = JSON.parse(fileSummaries);
      if (Array.isArray(parsed)) list = parsed;
    } catch {
      list = [];
    }
  }

  const uploaded = list.filter(
    (file): file is PublicFileSummary & { mimeType: string } =>
      Boolean(file) && file.status === "UPLOADED" && Boolean(file.mimeType),
  );
  return buildOriginalFileNames(issueNumber, uploaded).filter(Boolean).join("; ");
}

/**
 * Trường loại đất — trả nhãn danh mục, hoặc xử lý hai lối thoát ngoài danh mục:
 * `GHI_THEO_BIA` ghi thẳng chữ tự do người dân nhập; `CAN_DOI_CHIEU` để trống kèm cảnh báo.
 */
function landPurposeLabel(use: LandUse, context: string, warnings: string[]): string {
  if (use.purposeCode === LAND_PURPOSE_GHI_THEO_BIA) {
    const freeText = use.purposeFreeText.trim();
    if (!freeText) {
      warnings.push(`${context}: chọn "ghi theo bìa" nhưng bỏ trống nội dung — cán bộ bổ sung.`);
    }
    return freeText;
  }
  if (use.purposeCode === LAND_PURPOSE_CAN_DOI_CHIEU) {
    warnings.push(`${context}: người dân không chắc loại đất — cán bộ đối chiếu.`);
    return "";
  }
  return labelOf(LAND_PURPOSE_OPTIONS, use.purposeCode, context, warnings);
}

/** Ba bộ cột loại đất (25–29, 30–34, 35–39). Thửa thừa dòng thứ tư đã bị chặn lúc khai. */
function landUseCells(parcel: Parcel, context: string, warnings: string[]): string[] {
  const cells: string[] = [];
  if (parcel.landUses.length > 3) {
    warnings.push(
      `${context}: có ${parcel.landUses.length} mục đích sử dụng; PL3 chỉ có 3 nhóm cột. Cần sửa bản làm việc trước khi nộp.`,
    );
  }
  for (let index = 0; index < 3; index += 1) {
    const use = parcel.landUses[index];
    if (!use) {
      cells.push("", "", "", "", "");
      continue;
    }
    cells.push(
      landPurposeLabel(use, `${context} loại đất ${index + 1}`, warnings),
      use.area.trim(),
      labelOf(LAND_ORIGIN_OPTIONS, use.originCode, `${context} nguồn gốc ${index + 1}`, warnings),
      labelOf(LAND_USE_FORM_OPTIONS, use.formCode, `${context} hình thức ${index + 1}`, warnings),
      labelOf(LAND_USE_TERM_OPTIONS, use.termCode, `${context} thời hạn ${index + 1}`, warnings),
    );
  }
  return cells;
}

function joined(values: readonly string[]): string {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).join("; ");
}

/** Cột AO–AW. Tài sản legacy chưa có `parcelId` được giữ cho mọi thửa để không mất dữ liệu. */
function assetCells(record: SubmissionRecord, parcel: Parcel, warnings: string[]): string[] {
  const assets = (record.draft?.assets ?? []).filter(
    (asset) => !asset.parcelId || asset.parcelId === parcel.id,
  );
  return [
    joined(
      assets.map((asset) =>
        asset.assetType.trim()
          ? labelOf(ASSET_TYPE_OPTIONS, asset.assetType, "Tài sản", warnings)
          : "",
      ),
    ),
    joined(assets.map((asset) => asset.mixedUseBuildingName ?? "")),
    joined(assets.map((asset) => asset.apartmentBuildingName ?? "")),
    joined(assets.map((asset) => asset.apartmentNumber ?? "")),
    joined(assets.map((asset) => asset.constructionArea ?? "")),
    joined(assets.map((asset) => asset.floorArea ?? "")),
    joined(assets.map((asset) => asset.ownershipForm ?? "")),
    joined(assets.map((asset) => asset.ownershipTerm ?? "")),
    joined(assets.map((asset) => asset.grade ?? "")),
  ];
}

/** Dựng một dòng 49 cột cho một cặp (thửa, người). */
function buildRow(
  record: SubmissionRecord,
  parcel: Parcel,
  owner: Owner,
  parcelContext: string,
  warnings: string[],
): string[] {
  const certificate = record.draft?.certificate ?? {
    issueNumber: "",
    issueDate: "",
    registryNumber: "",
  };
  const org = isOrganisationOwner(owner.ownerType);
  const hasSeparateOrganisationFields = Boolean(
    owner.organisationName?.trim() || owner.organisationIdentityNumber?.trim(),
  );
  const organisationName = org
    ? (owner.organisationName?.trim() ?? "") ||
      (!hasSeparateOrganisationFields ? owner.fullName.trim() : "")
    : "";
  const organisationIdentityNumber = org
    ? (owner.organisationIdentityNumber?.trim() ?? "") ||
      (!hasSeparateOrganisationFields ? owner.identityNumber.trim() : "")
    : "";
  const personName = org && !hasSeparateOrganisationFields ? "" : owner.fullName.trim();
  const personIdentity = org && !hasSeparateOrganisationFields ? "" : owner.identityNumber.trim();
  const roleCode = normalizeCertificateRole(owner.roleOnCertificate);
  const roleLabel = roleCode
    ? labelOf(CERTIFICATE_ROLE_OPTIONS, roleCode, `${parcelContext} vai trò`, warnings)
    : "";

  return [
    record.draft?.wardAdministrativeCodeOverride?.trim() || WARD_ADMIN_CODE, // B / trường 1
    certificate.issueNumber.trim(), // 2
    formatExportDate(certificate.issueDate), // 3
    certificate.registryNumber.trim(), // 4
    organisationName, // F / trường 5
    organisationIdentityNumber, // G / trường 6
    personName, // H / trường 7
    formatExportDate(owner.dateOfBirth), // I / trường 8
    genderLabel(owner.gender), // J / trường 9
    personIdentity, // K / trường 10
    owner.residenceAddress.trim(), // 11 địa chỉ thường trú
    OWNER_TYPE_LABELS[owner.ownerType] ?? owner.ownerType, // 12 pháp nhân
    roleLabel, // 13 vai trò
    owner.hasDistinctCurrentUser ? owner.currentUserName.trim() : "", // O tên người SD hiện tại
    owner.hasDistinctCurrentUser ? owner.currentUserCitizenId.trim() : "", // P số định danh
    owner.hasDistinctCurrentUser ? owner.currentUserAddress.trim() : "", // 14 địa chỉ 2 cấp
    owner.hasDistinctCurrentUser
      ? labelOf(
          CHANGE_REASON_OPTIONS,
          owner.changeReason,
          `${parcelContext} lý do thay đổi`,
          warnings,
        )
      : "", // 15 lý do thay đổi
    parcel.parcelIdCode.trim(), // 16 mã định danh thửa
    parcel.mapSheetNumber.trim(), // 17 số tờ trên GCN
    parcel.parcelNumber.trim(), // 18 số thứ tự thửa trên GCN
    field19(parcel, parcelContext, warnings), // 19
    parcel.cadastralParcelNumber?.trim() ?? "", // W / trường 20
    parcel.addressOnCertificate.trim(), // 23 địa chỉ thửa
    parcel.area.trim(), // 24 diện tích thửa
    ...landUseCells(parcel, parcelContext, warnings), // 25–39
    ...assetCells(record, parcel, warnings), // AO–AW / trường 40–48
    record.draft?.scannedFileNamesOverride?.trim() ||
      scannedFileNames(certificate.issueNumber, record.fileSummaries), // AX / trường 49
  ];
}

/** Dựng toàn bộ dòng PL3 cho một hồ sơ (nổ theo thửa × người). */
export function buildSubmissionRows(record: SubmissionRecord): Pl3BuildResult {
  const warnings: string[] = [];
  const draft = record.draft;
  const parcels = draft?.parcels?.length ? draft.parcels : [];
  const owners = draft?.owners?.length ? draft.owners : [];
  const label = record.receiptCode || record.submissionId;

  if (parcels.length === 0 || owners.length === 0) {
    warnings.push(`Hồ sơ ${label}: thiếu thửa đất hoặc chủ sử dụng — không sinh được dòng nào.`);
    return { rows: [], warnings };
  }

  const rows: string[][] = [];
  parcels.forEach((parcel, parcelIndex) => {
    const parcelContext = `Hồ sơ ${label} thửa ${parcelIndex + 1}`;
    owners.forEach((owner) => {
      const row = buildRow(record, parcel, owner, parcelContext, warnings);
      if (row.length !== PL3_DATA_COLUMN_COUNT) {
        throw new Error(`Dòng PL3 phải có ${PL3_DATA_COLUMN_COUNT} cột, đang có ${row.length}.`);
      }
      rows.push(row);
    });
  });
  return { rows, warnings };
}

export interface Pl3ExportContent {
  readonly official: Pl3BuildResult;
  readonly backlog: Pl3BuildResult;
  readonly officialSubmissionCount: number;
  readonly backlogSubmissionCount: number;
  readonly truncated?: boolean;
}

export interface Pl3Accumulator {
  addChunk(records: readonly SubmissionRecord[]): void;
  getContent(truncated?: boolean): Pl3ExportContent;
}

/** Tạo accumulator để gom dữ liệu theo từng lô khi stream xuất PL3. */
export function createPl3Accumulator(): Pl3Accumulator {
  const officialRows: string[][] = [];
  const officialWarnings: string[] = [];
  let officialSubmissionCount = 0;

  const backlogRows: string[][] = [];
  const backlogWarnings: string[] = [];
  let backlogSubmissionCount = 0;

  return {
    addChunk(records: readonly SubmissionRecord[]) {
      for (const record of records) {
        if (OFFICIAL_EXPORT_STATUSES.includes(record.status)) {
          officialSubmissionCount++;
          const built = buildSubmissionRows(record);
          officialRows.push(...built.rows);
          officialWarnings.push(...built.warnings);
        } else if (BACKLOG_EXPORT_STATUSES.includes(record.status)) {
          backlogSubmissionCount++;
          const built = buildSubmissionRows(record);
          backlogRows.push(...built.rows);
          backlogWarnings.push(...built.warnings);
        }
      }
    },
    getContent(truncated = false): Pl3ExportContent {
      return {
        official: { rows: officialRows, warnings: officialWarnings },
        backlog: { rows: backlogRows, warnings: backlogWarnings },
        officialSubmissionCount,
        backlogSubmissionCount,
        truncated,
      };
    },
  };
}

/** Phân hồ sơ thành báo cáo chính thức (đã tiếp nhận) và danh sách tồn đọng. */
export function buildPl3Content(records: readonly SubmissionRecord[]): Pl3ExportContent {
  const acc = createPl3Accumulator();
  acc.addChunk(records);
  return acc.getContent();
}

function writeSheet(worksheet: ExcelJS.Worksheet, result: Pl3BuildResult): void {
  worksheet.addRow(["STT", ...PL3_COLUMNS.map((column) => column.label)]);
  worksheet.addRow([
    "",
    ...PL3_COLUMNS.map((column) => (column.field === null ? "" : String(column.field))),
  ]);
  worksheet.views = [{ state: "frozen", ySplit: 2 }];
  worksheet.getRow(1).font = { bold: true };
  result.rows.forEach((row, index) => {
    worksheet.addRow([index + 1, ...row]);
  });
}

function writeWarningSheet(
  worksheet: ExcelJS.Worksheet,
  officialWarnings: readonly string[],
  backlogWarnings: readonly string[],
  truncated?: boolean,
): void {
  worksheet.addRow(["Nguồn", "Nội dung cảnh báo"]);
  worksheet.views = [{ state: "frozen", ySplit: 1 }];
  worksheet.getRow(1).font = { bold: true };

  if (truncated) {
    worksheet.addRow([
      "Hệ thống",
      "Bản kết xuất vượt quá giới hạn 20.000 hồ sơ. Dữ liệu đã bị giới hạn (truncated).",
    ]);
  }

  officialWarnings.forEach((warning) => {
    worksheet.addRow(["Chính thức (PL3)", warning]);
  });
  backlogWarnings.forEach((warning) => {
    worksheet.addRow(["Tồn đọng (Ton dong)", warning]);
  });
}

/**
 * Kết xuất workbook PL3: sheet `PL3` (đã tiếp nhận) + sheet `Ton dong` (đang xử lý) + sheet `Canh bao`.
 * Trả về buffer XLSX để upload Drive và/hoặc tải về.
 */
export async function renderPl3Workbook(content: Pl3ExportContent): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "land-ocr-180";
  writeSheet(workbook.addWorksheet("PL3"), content.official);
  writeSheet(workbook.addWorksheet("Ton dong"), content.backlog);

  const totalWarnings = content.official.warnings.length + content.backlog.warnings.length;
  if (totalWarnings > 0 || content.truncated) {
    writeWarningSheet(
      workbook.addWorksheet("Canh bao"),
      content.official.warnings,
      content.backlog.warnings,
      content.truncated,
    );
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer);
}
