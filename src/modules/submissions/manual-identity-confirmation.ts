import { requiresCitizenId, type Owner } from "@/modules/public-intake/types";
import { CITIZEN_ID_PATTERN, isValidDate } from "@/modules/public-intake/validation";

export interface ManualIdentityConfirmationIssue {
  readonly code:
    | "OWNER_NOT_ELIGIBLE"
    | "IDENTITY_ALREADY_CONFIRMED"
    | "IDENTITY_NUMBER_INVALID"
    | "DATE_OF_BIRTH_INVALID"
    | "GENDER_MISSING"
    | "RESIDENCE_ADDRESS_MISSING";
  readonly message: string;
}

/**
 * Gác cổng cho thao tác cán bộ xác nhận thủ công sau khi đối chiếu CCCD.
 *
 * Đây không phải là xác minh tự động hay xác nhận giá trị pháp lý của hồ sơ: chỉ cho phép cán bộ
 * đang xử lý ghi nhận rằng họ đã đối chiếu đủ các trường định danh bắt buộc trên giấy tờ.
 */
export function manualIdentityConfirmationIssue(
  owner: Owner,
): ManualIdentityConfirmationIssue | null {
  if (!requiresCitizenId(owner.ownerType) || owner.hasDistinctCurrentUser) {
    return {
      code: "OWNER_NOT_ELIGIBLE",
      message: "Chủ sử dụng này không thuộc diện xác nhận CCCD thủ công.",
    };
  }
  if (owner.identityStatus === "QR_CONFIRMED" || owner.identityStatus === "MANUAL_COMPLETE") {
    return {
      code: "IDENTITY_ALREADY_CONFIRMED",
      message: "Thông tin định danh của chủ sử dụng này đã được xác nhận.",
    };
  }
  if (!CITIZEN_ID_PATTERN.test(owner.identityNumber.trim())) {
    return {
      code: "IDENTITY_NUMBER_INVALID",
      message: "Cần nhập CCCD gồm đúng 12 chữ số trước khi xác nhận thủ công.",
    };
  }
  if (!isValidDate(owner.dateOfBirth.trim())) {
    return {
      code: "DATE_OF_BIRTH_INVALID",
      message: "Cần nhập ngày sinh hợp lệ trước khi xác nhận thủ công.",
    };
  }
  if (owner.gender !== "NAM" && owner.gender !== "NU") {
    return {
      code: "GENDER_MISSING",
      message: "Cần chọn giới tính trước khi xác nhận thủ công.",
    };
  }
  if (!owner.residenceAddress.trim()) {
    return {
      code: "RESIDENCE_ADDRESS_MISSING",
      message: "Cần nhập địa chỉ thường trú trước khi xác nhận thủ công.",
    };
  }
  return null;
}
