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
import type { PublicStatus } from "./workflow";

/** Mã ĐVHC cấp xã Phường Phong Châu (trường 1) — hằng số, giữ số 0 đứng đầu. */
export const WARD_ADMIN_CODE = "07954";

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
  { field: 7, label: "Họ và tên chủ sử dụng / người đại diện tổ chức" },
  { field: 8, label: "Ngày, tháng, năm sinh" },
  { field: 9, label: "Giới tính" },
  { field: 10, label: "Số định danh cá nhân / CCCD" },
  { field: 11, label: "Địa chỉ thường trú" },
  { field: 12, label: "Pháp nhân trên GCN" },
  { field: 13, label: "Vai trò pháp nhân trên GCN" },
  { field: null, label: "Tên người sử dụng hiện tại" },
  { field: null, label: "Số định danh người sử dụng hiện tại" },
  { field: 14, label: "Địa chỉ thường trú (2 cấp)" },
  { field: 15, label: "Lý do thay đổi" },
  { field: 16, label: "Mã định danh thửa đất" },
  { field: 17, label: "Số tờ bản đồ ghi trên GCN" },
  { field: 18, label: "Số thứ tự thửa ghi trên GCN" },
  { field: 19, label: "Số hiệu tờ trên bản đồ địa chính" },
  { field: 20, label: "Số thứ tự thửa trên bản đồ địa chính" },
  { field: 23, label: "Địa chỉ thửa đất" },
  { field: 24, label: "Diện tích thửa đất" },
  { field: 25, label: "Loại đất 1" },
  { field: 26, label: "Diện tích (loại đất 1)" },
  { field: 27, label: "Nguồn gốc sử dụng (loại đất 1)" },
  { field: 28, label: "Hình thức sử dụng (loại đất 1)" },
  { field: 29, label: "Thời hạn sử dụng (loại đất 1)" },
  { field: 30, label: "Loại đất 2" },
  { field: 31, label: "Diện tích (loại đất 2)" },
  { field: 32, label: "Nguồn gốc sử dụng (loại đất 2)" },
  { field: 33, label: "Hình thức sử dụng (loại đất 2)" },
  { field: 34, label: "Thời hạn sử dụng (loại đất 2)" },
  { field: 35, label: "Loại đất 3" },
  { field: 36, label: "Diện tích (loại đất 3)" },
  { field: 37, label: "Nguồn gốc sử dụng (loại đất 3)" },
  { field: 38, label: "Hình thức sử dụng (loại đất 3)" },
  { field: 39, label: "Thời hạn sử dụng (loại đất 3)" },
  { field: 40, label: "Loại tài sản gắn liền với đất" },
  { field: 41, label: "Khu chung cư / nhà hỗn hợp" },
  { field: 42, label: "Số căn hộ" },
  { field: 43, label: "Diện tích xây dựng" },
  { field: 44, label: "Diện tích sàn" },
  { field: 45, label: "Hình thức sở hữu" },
  { field: 46, label: "Thời hạn sở hữu" },
  { field: 47, label: "Hạng nhà" },
  { field: 48, label: "Cấp nhà" },
  { field: 49, label: "Tên file quét GCN / CCCD" },
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

/** Trường 19 — số hiệu tờ trên bản đồ địa chính. Mập mờ / không tra được → "" + cảnh báo. */
function field19(parcel: Parcel, context: string, warnings: string[]): string {
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

/** Tên file quét theo quy ước PL3 (trường 49): `{số phát hành}-GCN.pdf; {số phát hành}-GT.pdf`. */
export function scannedFileNames(issueNumber: string): string {
  const base = issueNumber.trim();
  if (!base) return "";
  return `${base}-GCN.pdf; ${base}-GT.pdf`;
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

/** Trường 40 — gộp nhãn loại tài sản của cả phiếu (mô hình không gắn tài sản theo từng thửa). */
function assetTypeCell(record: SubmissionRecord, warnings: string[]): string {
  const assets = record.draft?.assets ?? [];
  const labels = assets
    .map((asset) => asset.assetType.trim())
    .filter((code) => code.length > 0)
    .map((code) => labelOf(ASSET_TYPE_OPTIONS, code, "Tài sản", warnings));
  return Array.from(new Set(labels)).join("; ");
}

/** Dựng một dòng 49 cột cho một cặp (thửa, người). */
function buildRow(
  record: SubmissionRecord,
  parcel: Parcel,
  owner: Owner,
  parcelContext: string,
  assetCell: string,
  warnings: string[],
): string[] {
  const certificate = record.draft?.certificate ?? {
    issueNumber: "",
    issueDate: "",
    registryNumber: "",
  };
  const org = isOrganisationOwner(owner.ownerType);
  const roleCode = normalizeCertificateRole(owner.roleOnCertificate);
  const roleLabel = roleCode
    ? labelOf(CERTIFICATE_ROLE_OPTIONS, roleCode, `${parcelContext} vai trò`, warnings)
    : "";

  return [
    WARD_ADMIN_CODE, // 1
    certificate.issueNumber.trim(), // 2
    formatExportDate(certificate.issueDate), // 3
    certificate.registryNumber.trim(), // 4
    org ? owner.fullName.trim() : "", // 5 tên tổ chức
    org ? owner.identityNumber.trim() : "", // 6 số định danh tổ chức
    org ? "" : owner.fullName.trim(), // 7 họ tên chủ sử dụng
    org ? "" : formatExportDate(owner.dateOfBirth), // 8 ngày sinh
    org ? "" : genderLabel(owner.gender), // 9 giới tính
    org ? "" : owner.identityNumber.trim(), // 10 CCCD
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
    "", // 20 số thứ tự thửa trên BĐ địa chính — không có nguồn
    parcel.addressOnCertificate.trim(), // 23 địa chỉ thửa
    parcel.area.trim(), // 24 diện tích thửa
    ...landUseCells(parcel, parcelContext, warnings), // 25–39
    assetCell, // 40 loại tài sản
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "", // 41–48 nhà ở / chung cư — chưa thu
    scannedFileNames(certificate.issueNumber), // 49 tên file quét
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

  const assetCell = assetTypeCell(record, warnings);
  const rows: string[][] = [];
  parcels.forEach((parcel, parcelIndex) => {
    const parcelContext = `Hồ sơ ${label} thửa ${parcelIndex + 1}`;
    owners.forEach((owner) => {
      const row = buildRow(record, parcel, owner, parcelContext, assetCell, warnings);
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
}

function collect(
  records: readonly SubmissionRecord[],
  statuses: readonly PublicStatus[],
): {
  result: Pl3BuildResult;
  submissionCount: number;
} {
  const selected = records.filter((record) => statuses.includes(record.status));
  const rows: string[][] = [];
  const warnings: string[] = [];
  for (const record of selected) {
    const built = buildSubmissionRows(record);
    rows.push(...built.rows);
    warnings.push(...built.warnings);
  }
  return { result: { rows, warnings }, submissionCount: selected.length };
}

/** Phân hồ sơ thành báo cáo chính thức (đã tiếp nhận) và danh sách tồn đọng. */
export function buildPl3Content(records: readonly SubmissionRecord[]): Pl3ExportContent {
  const official = collect(records, OFFICIAL_EXPORT_STATUSES);
  const backlog = collect(records, BACKLOG_EXPORT_STATUSES);
  return {
    official: official.result,
    backlog: backlog.result,
    officialSubmissionCount: official.submissionCount,
    backlogSubmissionCount: backlog.submissionCount,
  };
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

/**
 * Kết xuất workbook PL3: sheet `PL3` (đã tiếp nhận) + sheet `Ton dong` (đang xử lý). Trả về buffer
 * XLSX để upload Drive và/hoặc tải về.
 */
export async function renderPl3Workbook(content: Pl3ExportContent): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "land-ocr-180";
  writeSheet(workbook.addWorksheet("PL3"), content.official);
  writeSheet(workbook.addWorksheet("Ton dong"), content.backlog);
  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer);
}
