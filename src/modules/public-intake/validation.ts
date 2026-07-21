import type { IntakeDraft } from "./types";
import { requiresCitizenId } from "./types";

/**
 * Kiểm tra ở ranh giới tin cậy. Trình duyệt đã validate theo từng bước, nhưng mọi endpoint ghi
 * vẫn phải tự kiểm: người dân không đăng nhập, request có thể tới từ bất cứ đâu.
 */

const PHONE_PATTERN = /^0\d{9}$/;
const CITIZEN_ID_PATTERN = /^\d{12}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

export function isValidPhone(value: string): boolean {
  return PHONE_PATTERN.test(value.trim());
}

/** Lỗi trả về chỉ nêu tên trường, không lặp lại giá trị người dân nhập (tránh lộ PII qua log). */
export function validateDraftForSave(draft: IntakeDraft): string | null {
  if (draft.phone && !isValidPhone(draft.phone)) {
    return "Số điện thoại phải gồm 10 chữ số và bắt đầu bằng 0.";
  }
  return null;
}

export function validateDraftForSubmit(draft: IntakeDraft): string | null {
  const saveError = validateDraftForSave(draft);
  if (saveError) {
    return saveError;
  }

  if (!isValidPhone(draft.phone)) {
    return "Thiếu số điện thoại liên hệ hợp lệ.";
  }

  const certificate = draft.certificate;
  if (
    !certificate.issueNumber.trim() ||
    !certificate.issueDate ||
    !certificate.registryNumber.trim()
  ) {
    return "Thiếu thông tin bắt buộc của Giấy chứng nhận.";
  }

  if (draft.owners.length === 0) {
    return "Cần ít nhất một chủ sử dụng.";
  }
  for (const owner of draft.owners) {
    if (!owner.fullName.trim() || !owner.roleOnCertificate) {
      return "Thiếu thông tin bắt buộc của chủ sử dụng.";
    }
    if (requiresCitizenId(owner.ownerType) && !CITIZEN_ID_PATTERN.test(owner.identityNumber)) {
      return "Số định danh cá nhân phải gồm đúng 12 chữ số.";
    }
    if (requiresCitizenId(owner.ownerType)) {
      if (!isValidDate(owner.dateOfBirth)) {
        return "Ngày sinh của chủ sử dụng phải đầy đủ.";
      }
      if (owner.gender !== "NAM" && owner.gender !== "NU") {
        return "Thiếu giới tính của chủ sử dụng.";
      }
      if (!owner.residenceAddress.trim()) {
        return "Thiếu địa chỉ thường trú của chủ sử dụng.";
      }
      if (owner.identityStatus !== "QR_CONFIRMED" && owner.identityStatus !== "MANUAL_COMPLETE") {
        return "Cần xác nhận thông tin CCCD của chủ sử dụng.";
      }
    }
  }

  if (draft.parcels.length === 0) {
    return "Cần ít nhất một thửa đất.";
  }
  for (const parcel of draft.parcels) {
    if (!parcel.addressOnCertificate.trim()) {
      return "Thiếu địa chỉ thửa đất ghi trên Giấy chứng nhận.";
    }

    const parcelArea = Number(parcel.area);
    if (!Number.isFinite(parcelArea) || parcelArea <= 0) {
      return "Diện tích thửa đất phải lớn hơn 0.";
    }

    if (parcel.landUses.length === 0) {
      return "Mỗi thửa cần ít nhất một dòng mục đích sử dụng.";
    }
    for (const landUse of parcel.landUses) {
      if (!landUse.purposeCode || !landUse.originCode || !landUse.formCode || !landUse.termCode) {
        return "Thiếu loại đất, nguồn gốc, hình thức hoặc thời hạn sử dụng.";
      }
    }

    // Phụ lục 8 chỉ bắt buộc diện tích thửa; diện tích theo mục đích là tùy chọn nên chỉ
    // kiểm tổng khi người dân có nhập.
    const declared = parcel.landUses
      .map((landUse) => Number(landUse.area))
      .filter((value) => Number.isFinite(value) && value > 0);
    if (declared.length > 0) {
      const total = declared.reduce((sum, value) => sum + value, 0);
      if (total > parcelArea) {
        return "Tổng diện tích theo mục đích sử dụng vượt quá diện tích thửa.";
      }
    }
  }

  return null;
}
