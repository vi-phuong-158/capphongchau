import { CERTIFICATE_ROLE_CODES, CHANGE_REASON_CODES, OLD_WARD_OPTIONS } from "./reference";
import type { IntakeDraft } from "./types";
import { MAX_LAND_USES_PER_PARCEL, isOrganisationOwner, requiresCitizenId, OWNER_TYPES } from "./types";

const OLD_WARD_CODES: readonly string[] = OLD_WARD_OPTIONS.map((option) => option.code);

/**
 * Kiểm tra ở ranh giới tin cậy. Trình duyệt đã validate theo từng bước, nhưng mọi endpoint ghi
 * vẫn phải tự kiểm: người dân không đăng nhập, request có thể tới từ bất cứ đâu.
 */

const PHONE_PATTERN = /^0\d{9}$/;
export const CITIZEN_ID_PATTERN = /^\d{12}$/;
/** Mã số thuế 10 số, hoặc 13 số dạng đơn vị trực thuộc (`0123456789-001`). */
export const ORGANISATION_ID_PATTERN = /^\d{10}(-\d{3})?$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_CERTIFICATE_FILES = 10;
const MAX_CERTIFICATE_PAGE_LABEL_LENGTH = 120;

/**
 * Biên sai lệch cho phép giữa tổng diện tích theo mục đích và diện tích thửa, đơn vị m².
 *
 * PL3 mẫu dòng 9 có thửa `29,16` m² nhưng diện tích loại đất ghi `29,2` m² — quy tắc "tổng không
 * được vượt diện tích thửa" từ chối chính dữ liệu do cơ quan phát hành. Nguyên nhân là làm tròn tới
 * 0,1 m²: tối đa ba dòng mục đích, mỗi dòng lệch tới 0,05 m², cộng chính diện tích thửa lệch 0,005
 * → 0,155 m². Lấy 0,5 m² cho rộng rãi mà vẫn bắt được sai sót thật.
 */
export const LAND_USE_AREA_TOLERANCE_M2 = 0.5;

export function isValidDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

import { z } from "zod";
export function isValidPhone(value: string): boolean {
  return PHONE_PATTERN.test(value.trim());
}

export const draftSchema = z
  .object({
    certificate: z.object({
      issueNumber: z.string(),
      issueDate: z.string(),
      registryNumber: z.string(),
    }).strict(),
    owners: z.array(
      z.object({
        id: z.string(),
        ownerType: z.enum(OWNER_TYPES as unknown as [string, ...string[]]),
        fullName: z.string(),
        identityNumber: z.string(),
        dateOfBirth: z.string(),
        gender: z.union([z.literal("NAM"), z.literal("NU"), z.literal("")]),
        residenceAddress: z.string(),
        identitySource: z.union([z.literal("QR"), z.literal("MANUAL"), z.literal("")]),
        qrPayloadHash: z.string(),
        qrDecoderVersion: z.string(),
        qrParserVersion: z.string(),
        identityStatus: z.union([
          z.literal("PENDING_CONFIRMATION"),
          z.literal("QR_CONFIRMED"),
          z.literal("MANUAL_COMPLETE"),
          z.literal(""),
        ]),
        identityConfirmedAt: z.string(),
        roleOnCertificate: z.string(),
        hasDistinctCurrentUser: z.boolean(),
        currentUserName: z.string(),
        currentUserCitizenId: z.string(),
        currentUserAddress: z.string(),
        changeReason: z.string(),
      }).strict()
    ),
    parcels: z.array(
      z.object({
        id: z.string(),
        parcelIdCode: z.string(),
        mapSheetNumber: z.string(),
        parcelNumber: z.string(),
        addressOnCertificate: z.string(),
        addressTwoLevel: z.string(),
        oldWard: z.string(),
        area: z.string(),
        landUses: z.array(
          z.object({
            id: z.string(),
            purposeCode: z.string(),
            purposeFreeText: z.string(),
            originCode: z.string(),
            formCode: z.string(),
            termCode: z.string(),
            area: z.string(),
          }).strict()
        ),
      }).strict()
    ),
    assets: z.array(
      z.object({
        id: z.string(),
        assetType: z.string(),
        description: z.string(),
      }).strict()
    ),
    certificateFileMetadata: z
      .array(
        z.object({
          fileId: z.string(),
          pageLabel: z.string(),
        }).strict()
      )
      .optional(),
    phone: z.string(),
    consentAccepted: z.boolean().optional(),
  })
  .strict();

/** Lỗi trả về chỉ nêu tên trường, không lặp lại giá trị người dân nhập (tránh lộ PII qua log). */
export function validateDraftForSave(draft: IntakeDraft): string | null {
  try {
    draftSchema.parse(draft);
  } catch {
    return "Cấu trúc dữ liệu không hợp lệ hoặc chứa các trường không cho phép.";
  }

  if (draft.phone && !isValidPhone(draft.phone)) {
    return "Số điện thoại phải gồm 10 chữ số và bắt đầu bằng 0.";
  }
  const metadata: unknown = draft.certificateFileMetadata;
  if (metadata !== undefined) {
    if (!Array.isArray(metadata) || metadata.length > MAX_CERTIFICATE_FILES) {
      return "Danh sách nhãn trang Giấy chứng nhận không hợp lệ.";
    }
    const fileIds = new Set<string>();
    for (const item of metadata) {
      if (
        typeof item !== "object" ||
        item === null ||
        !("fileId" in item) ||
        typeof item.fileId !== "string" ||
        !item.fileId.trim() ||
        item.fileId.length > 100 ||
        !("pageLabel" in item) ||
        typeof item.pageLabel !== "string" ||
        item.pageLabel.length > MAX_CERTIFICATE_PAGE_LABEL_LENGTH ||
        fileIds.has(item.fileId)
      ) {
        return "Danh sách nhãn trang Giấy chứng nhận không hợp lệ.";
      }
      fileIds.add(item.fileId);
    }
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
    if (!CERTIFICATE_ROLE_CODES.includes(owner.roleOnCertificate)) {
      return "Vai trò trên Giấy chứng nhận không thuộc danh mục cho phép.";
    }

    if (isOrganisationOwner(owner.ownerType)) {
      // Không có CCCD thì phải có mã định danh và trụ sở, nếu không hồ sơ chỉ còn mỗi cái tên.
      if (!ORGANISATION_ID_PATTERN.test(owner.identityNumber.trim())) {
        return "Mã số thuế của tổ chức phải gồm 10 chữ số (hoặc 10 chữ số kèm 3 số đơn vị trực thuộc).";
      }
      if (!owner.residenceAddress.trim()) {
        return "Thiếu địa chỉ trụ sở của tổ chức.";
      }
      continue;
    }

    // Người trên GCN đã mất / đã sang tên: miễn ảnh CCCD và định danh của họ, đổi lại phải khai đủ
    // người sử dụng hiện tại (cột O, P và trường 14, 15 của PL3).
    if (owner.hasDistinctCurrentUser) {
      if (owner.identityNumber.trim() && !CITIZEN_ID_PATTERN.test(owner.identityNumber.trim())) {
        return "Số định danh của người trên Giấy chứng nhận phải gồm đúng 12 chữ số.";
      }
      if (!owner.currentUserName.trim()) {
        return "Thiếu tên người sử dụng hiện tại.";
      }
      if (!CITIZEN_ID_PATTERN.test(owner.currentUserCitizenId.trim())) {
        return "Số định danh của người sử dụng hiện tại phải gồm đúng 12 chữ số.";
      }
      if (!owner.currentUserAddress.trim()) {
        return "Thiếu địa chỉ thường trú của người sử dụng hiện tại.";
      }
      if (!CHANGE_REASON_CODES.includes(owner.changeReason)) {
        return "Thiếu lý do thay đổi người sử dụng đất.";
      }
      continue;
    }

    if (!CITIZEN_ID_PATTERN.test(owner.identityNumber)) {
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

    // Bắt buộc chọn, nhưng "KHONG_RO" là lựa chọn hợp lệ: thà biết là chưa xác định còn hơn để
    // trống rồi sau này không phân biệt được với hồ sơ chưa ai đụng tới.
    if (!OLD_WARD_CODES.includes(parcel.oldWard)) {
      return "Thiếu đơn vị hành chính cũ của thửa đất.";
    }

    const parcelArea = Number(parcel.area);
    if (!Number.isFinite(parcelArea) || parcelArea <= 0) {
      return "Diện tích thửa đất phải lớn hơn 0.";
    }

    if (parcel.landUses.length === 0) {
      return "Mỗi thửa cần ít nhất một dòng mục đích sử dụng.";
    }
    if (parcel.landUses.length > MAX_LAND_USES_PER_PARCEL) {
      return `Mỗi thửa chỉ ghi tối đa ${MAX_LAND_USES_PER_PARCEL} dòng mục đích sử dụng.`;
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
      if (total - parcelArea > LAND_USE_AREA_TOLERANCE_M2) {
        return "Tổng diện tích theo mục đích sử dụng vượt quá diện tích thửa.";
      }
    }
  }

  return null;
}
