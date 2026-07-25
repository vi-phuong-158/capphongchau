import type { IntakeDraft } from "@/modules/public-intake/types";
import type { SubmissionRecord } from "@/modules/public-intake/repository";
import { OLD_WARD_OPTIONS } from "@/modules/public-intake/reference";
import { CITIZEN_ID_PATTERN, isValidDate } from "@/modules/public-intake/validation";

export interface CompletionCheck {
  code: string;
  label: string;
  severity: "BLOCKING" | "WARNING";
  message: string;
}

const OLD_WARD_CODES = new Set(OLD_WARD_OPTIONS.map((w) => w.code));

export function completionChecks(
  record: SubmissionRecord,
  payload: IntakeDraft | null,
): CompletionCheck[] {
  const checks: CompletionCheck[] = [];

  if (!payload) {
    checks.push({
      code: "NO_PAYLOAD",
      label: "Thiếu dữ liệu kê khai",
      severity: "BLOCKING",
      message: "Hồ sơ chưa có dữ liệu kê khai.",
    });
    return checks;
  }

  // 1. Certificate checks
  const cert = payload.certificate;
  if (!cert.issueNumber.trim()) {
    checks.push({
      code: "CERT_ISSUE_NUMBER_MISSING",
      label: "Thiếu số phát hành GCN",
      severity: "BLOCKING",
      message: "Chưa nhập số phát hành Giấy chứng nhận.",
    });
  }
  if (!cert.issueDate.trim() || !isValidDate(cert.issueDate)) {
    checks.push({
      code: "CERT_ISSUE_DATE_INVALID",
      label: "Ngày cấp GCN không hợp lệ",
      severity: "BLOCKING",
      message: "Ngày cấp GCN phải có định dạng YYYY-MM-DD và là ngày hợp lệ.",
    });
  }
  if (!cert.registryNumber.trim()) {
    checks.push({
      code: "CERT_REGISTRY_NUMBER_MISSING",
      label: "Thiếu số vào sổ GCN",
      severity: "BLOCKING",
      message: "Chưa nhập số vào sổ cấp GCN.",
    });
  }

  // 2. Owners checks
  if (!payload.owners || payload.owners.length === 0) {
    checks.push({
      code: "OWNERS_EMPTY",
      label: "Thiếu thông tin chủ sử dụng",
      severity: "BLOCKING",
      message: "Hồ sơ phải có ít nhất 1 chủ sử dụng.",
    });
  } else {
    payload.owners.forEach((owner, idx) => {
      if (!owner.fullName.trim()) {
        checks.push({
          code: `OWNER_${idx}_NAME_MISSING`,
          label: `Chủ ${idx + 1} thiếu họ tên`,
          severity: "BLOCKING",
          message: `Chủ sử dụng thứ ${idx + 1} chưa nhập họ và tên.`,
        });
      }
      if (owner.ownerType === "CA_NHAN" && !owner.hasDistinctCurrentUser) {
        if (!CITIZEN_ID_PATTERN.test(owner.identityNumber.trim())) {
          checks.push({
            code: `OWNER_${idx}_ID_INVALID`,
            label: `Chủ ${idx + 1} CCCD không hợp lệ`,
            severity: "BLOCKING",
            message: `Chủ sử dụng thứ ${idx + 1} phải có số CCCD gồm đúng 12 chữ số.`,
          });
        }
      }
    });
  }

  // 3. Parcels checks
  if (!payload.parcels || payload.parcels.length === 0) {
    checks.push({
      code: "PARCELS_EMPTY",
      label: "Thiếu thông tin thửa đất",
      severity: "BLOCKING",
      message: "Hồ sơ phải có ít nhất 1 thửa đất.",
    });
  } else {
    payload.parcels.forEach((parcel, idx) => {
      const areaNum = Number(parcel.area);
      if (isNaN(areaNum) || areaNum <= 0) {
        checks.push({
          code: `PARCEL_${idx}_AREA_INVALID`,
          label: `Thửa ${idx + 1} diện tích không hợp lệ`,
          severity: "BLOCKING",
          message: `Thửa đất thứ ${idx + 1} (tờ ${parcel.mapSheetNumber}, thửa ${parcel.parcelNumber}) phải có diện tích > 0.`,
        });
      }
      if (parcel.oldWard && !OLD_WARD_CODES.has(parcel.oldWard)) {
        checks.push({
          code: `PARCEL_${idx}_WARD_INVALID`,
          label: `Thửa ${idx + 1} ĐVHC cũ không hợp lệ`,
          severity: "BLOCKING",
          message: `Thửa đất thứ ${idx + 1} có ĐVHC cũ không thuộc danh mục 10 tổ/xã cũ Phường Phong Châu.`,
        });
      }
      if (parcel.landUses.length > 3) {
        checks.push({
          code: `PARCEL_${idx}_LAND_USES_EXCEEDED`,
          label: `Thửa ${idx + 1} vượt quá 3 mục đích`,
          severity: "BLOCKING",
          message: `Thửa đất thứ ${idx + 1} có ${parcel.landUses.length} mục đích sử dụng (tối đa 3 theo mẫu PL3).`,
        });
      }
    });
  }

  // Warning checks
  if (record.fileSummaries.length === 0) {
    checks.push({
      code: "FILES_WARNING_EMPTY",
      label: "Chưa có file ảnh đính kèm",
      severity: "WARNING",
      message: "Hồ sơ hiện chưa đính kèm file quét GCN/CCCD.",
    });
  }

  return checks;
}
