import {
  CERTIFICATE_ROLE_CODES,
  CHANGE_REASON_CODES,
  LAND_PURPOSE_GHI_THEO_BIA,
  OLD_WARD_OPTIONS,
} from "./reference";
import type { IntakeDraft, Owner } from "./types";
import {
  MAX_LAND_USES_PER_PARCEL,
  isOrganisationOwner,
  requiresCitizenId,
  OWNER_TYPES,
} from "./types";
import { parseVietnameseDecimal } from "./vietnamese-number";
import type { PublicFileSummary } from "./workflow";

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
    certificate: z
      .object({
        issueNumber: z.string(),
        issueDate: z.string(),
        registryNumber: z.string(),
      })
      .strict(),
    owners: z.array(
      z
        .object({
          id: z.string(),
          ownerType: z.enum(OWNER_TYPES as unknown as [string, ...string[]]),
          organisationName: z.string().max(500).optional().default(""),
          organisationIdentityNumber: z.string().max(100).optional().default(""),
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
            z.literal("QR_OVERRIDE_PENDING_REVIEW"),
            z.literal("MANUAL_COMPLETE"),
            z.literal(""),
          ]),
          identityConfirmedAt: z.string(),
          identityOverrideReason: z.string().max(500),
          roleOnCertificate: z.string(),
          hasDistinctCurrentUser: z.boolean(),
          currentUserName: z.string(),
          currentUserCitizenId: z.string(),
          currentUserAddress: z.string(),
          changeReason: z.string(),
        })
        .strict(),
    ),
    parcels: z.array(
      z
        .object({
          id: z.string(),
          parcelIdCode: z.string(),
          mapSheetNumber: z.string(),
          parcelNumber: z.string(),
          addressOnCertificate: z.string(),
          addressTwoLevel: z.string(),
          oldWard: z.string(),
          cadastralMapSheetNumber: z.string().max(100).optional().default(""),
          cadastralMapSheetOverrideReason: z.string().max(500).optional().default(""),
          cadastralParcelNumber: z.string().max(100).optional().default(""),
          area: z.string(),
          landUses: z.array(
            z
              .object({
                id: z.string(),
                purposeCode: z.string(),
                purposeFreeText: z.string(),
                originCode: z.string(),
                formCode: z.string(),
                termCode: z.string(),
                area: z.string(),
              })
              .strict(),
          ),
        })
        .strict(),
    ),
    assets: z.array(
      z
        .object({
          id: z.string(),
          parcelId: z.string().max(100).optional().default(""),
          assetType: z.string(),
          description: z.string(),
          mixedUseBuildingName: z.string().max(500).optional().default(""),
          apartmentBuildingName: z.string().max(500).optional().default(""),
          apartmentNumber: z.string().max(100).optional().default(""),
          constructionArea: z.string().max(100).optional().default(""),
          floorArea: z.string().max(100).optional().default(""),
          ownershipForm: z.string().max(500).optional().default(""),
          ownershipTerm: z.string().max(500).optional().default(""),
          grade: z.string().max(500).optional().default(""),
        })
        .strict(),
    ),
    certificateFileMetadata: z
      .array(
        z
          .object({
            fileId: z.string(),
            pageLabel: z.string(),
          })
          .strict(),
      )
      .optional(),
    wardAdministrativeCodeOverride: z.string().max(20).optional().default(""),
    wardAdministrativeCodeOverrideReason: z.string().max(500).optional().default(""),
    scannedFileNamesOverride: z.string().max(2000).optional().default(""),
    scannedFileNamesOverrideReason: z.string().max(500).optional().default(""),
    phone: z.string(),
    consentAccepted: z.boolean().optional(),
  })
  .strict()
  .superRefine((draft, context) => {
    const requireOverrideReason = (
      value: string | undefined,
      reason: string | undefined,
      path: (string | number)[],
    ) => {
      if (value?.trim() && (reason?.trim().length ?? 0) < 10) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path,
          message: "Ghi đè trường tự động phải có lý do từ 10 ký tự.",
        });
      }
    };

    requireOverrideReason(
      draft.wardAdministrativeCodeOverride,
      draft.wardAdministrativeCodeOverrideReason,
      ["wardAdministrativeCodeOverrideReason"],
    );
    requireOverrideReason(draft.scannedFileNamesOverride, draft.scannedFileNamesOverrideReason, [
      "scannedFileNamesOverrideReason",
    ]);
    draft.parcels.forEach((parcel, index) =>
      requireOverrideReason(
        parcel.cadastralMapSheetNumber,
        parcel.cadastralMapSheetOverrideReason,
        ["parcels", index, "cadastralMapSheetOverrideReason"],
      ),
    );
    const parcelIds = new Set(draft.parcels.map((parcel) => parcel.id));
    draft.assets.forEach((asset, index) => {
      if (asset.parcelId?.trim() && !parcelIds.has(asset.parcelId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["assets", index, "parcelId"],
          message: "Tài sản phải tham chiếu một thửa đất trong cùng hồ sơ.",
        });
      }
    });
  });

/**
 * Chỉ kiểm **hình dạng** dữ liệu: schema và giới hạn mảng. Không kiểm nội dung nghiệp vụ.
 *
 * Tách riêng khỏi `validateDraftForSave` để `validateCitizenSubmitDraft` báo được lỗi theo từng
 * trường: gộp chung thì số điện thoại sai chỉ trả một câu "Cấu trúc dữ liệu không hợp lệ" không
 * kèm `fieldPath`, và client không biết phải đưa con trỏ về ô nào.
 */
export function validateDraftStructure(draft: IntakeDraft): string | null {
  try {
    draftSchema.parse(draft);
  } catch {
    return "Cấu trúc dữ liệu không hợp lệ hoặc chứa các trường không cho phép.";
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

/** Lỗi trả về chỉ nêu tên trường, không lặp lại giá trị người dân nhập (tránh lộ PII qua log). */
export function validateDraftForSave(draft: IntakeDraft): string | null {
  const structureError = validateDraftStructure(draft);
  if (structureError) return structureError;

  if (draft.phone && !isValidPhone(draft.phone)) {
    return "Số điện thoại phải gồm 10 chữ số và bắt đầu bằng 0.";
  }
  return null;
}

/**
 * Bàn biên tập cán bộ dùng cùng schema payload nhưng phải chặn giới hạn PL3 ngay khi lưu.
 *
 * Giữ quy tắc này ngoài `draftSchema`: các luồng gửi hồ sơ công khai cần trả mã lỗi/ngữ cảnh
 * nghiệp vụ riêng thay vì bị rút gọn thành lỗi cấu trúc chung.
 */
export function validateWorkingPayloadForSave(draft: IntakeDraft): string | null {
  const saveError = validateDraftForSave(draft);
  if (saveError) return saveError;

  if (draft.parcels.some((parcel) => parcel.landUses.length > MAX_LAND_USES_PER_PARCEL)) {
    return `Mỗi thửa chỉ ghi tối đa ${MAX_LAND_USES_PER_PARCEL} dòng mục đích sử dụng.`;
  }
  return null;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Public Intake V2 — ba tầng kiểm tra, ba mục đích khác nhau
 *
 *   validateDraftForSave()      — cấu trúc; dùng ở PATCH lưu nháp.
 *   validateCitizenSubmitDraft() — MỨC A: đủ để **người dân bấm gửi**.
 *   completionChecks()          — MỨC C: đủ để **cán bộ tiếp nhận chính thức**.
 *
 * Mục A của kế hoạch V2: cổng công khai là nơi thu nhận tài liệu ban đầu, không phải màn hình
 * hoàn thiện PL3. Người dân chỉ bắt buộc số điện thoại, đồng ý, tên chủ sử dụng và đủ ảnh. Mọi
 * trường PL3 khác là **tùy chọn** — nhưng nếu đã nhập thì phải đúng định dạng, không được biến
 * thành dữ liệu sai im lặng.
 *
 * `validateDraftForSubmit()` (mức cũ, đòi đủ PL3) vẫn còn để cán bộ/công cụ nội bộ dùng khi cần
 * kiểm một bản kê khai đã hoàn thiện, và để hồ sơ cũ so sánh được.
 * ──────────────────────────────────────────────────────────────────────────── */

export interface CitizenSubmitIssue {
  readonly code: string;
  /** Đường dẫn tới trường sai, ví dụ `owners.0.identityNumber` — để client focus đúng ô. */
  readonly fieldPath: string;
  readonly message: string;
  readonly severity: "BLOCKING";
}

function issue(code: string, fieldPath: string, message: string): CitizenSubmitIssue {
  return { code, fieldPath, message, severity: "BLOCKING" };
}

/** Giới hạn độ dài các ô tự do người dân nhập — chặn rác, không chặn dữ liệu thật. */
export const MAX_PURPOSE_FREE_TEXT_LENGTH = 120;
export const MAX_PARCEL_REFERENCE_LENGTH = 40;
const MAX_FREE_TEXT_LENGTH = 500;

/**
 * Ký hiệu loại đất người dân ghi theo bìa GCN (`LUC`, `LUK`, `BHK`, "màu", "vườn"…).
 *
 * Chỉ trim + viết hoa **mã ngắn thuần chữ cái** (≤ 5 ký tự): "luc" → "LUC". Chuỗi tiếng Việt như
 * "đất vườn" giữ nguyên — viết hoa cả câu là bóp méo thứ người dân ghi trên bìa, mà cán bộ mới là
 * người chuẩn hóa ở `working_payload`.
 */
export function normalizeLandPurposeFreeText(input: string): string {
  const text = input.trim().slice(0, MAX_PURPOSE_FREE_TEXT_LENGTH);
  return /^[a-zA-Z]{1,5}$/.test(text) ? text.toUpperCase() : text;
}

function checkOptionalOwner(owner: Owner, index: number, issues: CitizenSubmitIssue[]): void {
  const path = `owners.${index}`;
  const identityNumber = owner.identityNumber.trim();

  if (identityNumber) {
    const pattern = isOrganisationOwner(owner.ownerType)
      ? ORGANISATION_ID_PATTERN
      : CITIZEN_ID_PATTERN;
    if (!pattern.test(identityNumber)) {
      issues.push(
        issue(
          "OWNER_ID_INVALID",
          `${path}.identityNumber`,
          isOrganisationOwner(owner.ownerType)
            ? "Mã số thuế gồm 10 chữ số (hoặc 10 chữ số kèm 3 số đơn vị trực thuộc). Không rõ thì để trống."
            : "Số định danh gồm đúng 12 chữ số. Không rõ thì để trống, cán bộ sẽ đọc trên ảnh CCCD.",
        ),
      );
    }
  }

  if (owner.dateOfBirth.trim() && !isValidDate(owner.dateOfBirth.trim())) {
    issues.push(
      issue("OWNER_DOB_INVALID", `${path}.dateOfBirth`, "Ngày sinh không hợp lệ. Có thể để trống."),
    );
  }

  if (owner.roleOnCertificate.trim() && !CERTIFICATE_ROLE_CODES.includes(owner.roleOnCertificate)) {
    issues.push(
      issue(
        "OWNER_ROLE_INVALID",
        `${path}.roleOnCertificate`,
        "Vai trò trên Giấy chứng nhận không thuộc danh mục cho phép.",
      ),
    );
  }

  if (owner.changeReason.trim() && !CHANGE_REASON_CODES.includes(owner.changeReason)) {
    issues.push(
      issue(
        "OWNER_CHANGE_REASON_INVALID",
        `${path}.changeReason`,
        "Lý do thay đổi không thuộc danh mục cho phép.",
      ),
    );
  }

  const currentUserCitizenId = owner.currentUserCitizenId.trim();
  if (currentUserCitizenId && !CITIZEN_ID_PATTERN.test(currentUserCitizenId)) {
    issues.push(
      issue(
        "OWNER_CURRENT_USER_ID_INVALID",
        `${path}.currentUserCitizenId`,
        "Số định danh của người sử dụng hiện tại gồm đúng 12 chữ số. Không rõ thì để trống.",
      ),
    );
  }

  for (const [field, value] of [
    ["residenceAddress", owner.residenceAddress],
    ["currentUserName", owner.currentUserName],
    ["currentUserAddress", owner.currentUserAddress],
    ["fullName", owner.fullName],
  ] as const) {
    if (value.length > MAX_FREE_TEXT_LENGTH) {
      issues.push(
        issue("FIELD_TOO_LONG", `${path}.${field}`, "Nội dung quá dài, rút ngắn giúp cán bộ đọc."),
      );
    }
  }
}

/**
 * MỨC A — điều kiện tối thiểu để người dân gửi hồ sơ.
 *
 * Trả danh sách lỗi có cấu trúc (không phải một chuỗi) để client focus đúng ô sai và hiển thị lỗi
 * tại chỗ thay vì một toast chung chung.
 */
export function validateCitizenSubmitDraft(draft: IntakeDraft): CitizenSubmitIssue[] {
  const structureError = validateDraftStructure(draft);
  if (structureError) {
    return [issue("DRAFT_STRUCTURE_INVALID", "", structureError)];
  }

  const issues: CitizenSubmitIssue[] = [];

  if (!isValidPhone(draft.phone)) {
    issues.push(
      issue("PHONE_INVALID", "phone", "Nhập số điện thoại gồm 10 chữ số, bắt đầu bằng 0."),
    );
  }

  if (!draft.consentAccepted) {
    issues.push(
      issue("CONSENT_REQUIRED", "consentAccepted", "Cần đồng ý cho phép xử lý dữ liệu để gửi."),
    );
  }

  if (draft.owners.length === 0) {
    issues.push(issue("OWNER_REQUIRED", "owners", "Cần ít nhất một chủ sử dụng."));
  }

  draft.owners.forEach((owner, index) => {
    if (!owner.fullName.trim()) {
      issues.push(
        issue(
          "OWNER_NAME_REQUIRED",
          `owners.${index}.fullName`,
          "Nhập tên chủ sử dụng ghi trên Giấy chứng nhận.",
        ),
      );
    }
    checkOptionalOwner(owner, index, issues);
  });

  // Giấy chứng nhận: cả ba trường đều tùy chọn ở mức A, chỉ kiểm khi đã nhập.
  if (draft.certificate.issueDate.trim() && !isValidDate(draft.certificate.issueDate.trim())) {
    issues.push(
      issue(
        "CERTIFICATE_ISSUE_DATE_INVALID",
        "certificate.issueDate",
        "Ngày cấp không hợp lệ. Không đọc được trên bìa thì để trống.",
      ),
    );
  }

  draft.parcels.forEach((parcel, index) => {
    const path = `parcels.${index}`;

    if (parcel.oldWard.trim() && !OLD_WARD_CODES.includes(parcel.oldWard)) {
      issues.push(
        issue(
          "PARCEL_OLD_WARD_INVALID",
          `${path}.oldWard`,
          "Đơn vị hành chính cũ không thuộc danh mục cho phép.",
        ),
      );
    }

    const parcelArea = parcel.area.trim() ? parseVietnameseDecimal(parcel.area) : null;
    if (parcel.area.trim() && (parcelArea === null || parcelArea <= 0)) {
      issues.push(
        issue(
          "PARCEL_AREA_INVALID",
          `${path}.area`,
          "Diện tích phải là số lớn hơn 0 (ví dụ 220 hoặc 220,5). Không rõ thì để trống.",
        ),
      );
    }

    for (const [field, value] of [
      ["mapSheetNumber", parcel.mapSheetNumber],
      ["parcelNumber", parcel.parcelNumber],
      ["parcelIdCode", parcel.parcelIdCode],
    ] as const) {
      if (value.trim().length > MAX_PARCEL_REFERENCE_LENGTH) {
        issues.push(issue("FIELD_TOO_LONG", `${path}.${field}`, "Nội dung quá dài."));
      }
    }

    if (parcel.landUses.length > MAX_LAND_USES_PER_PARCEL) {
      issues.push(
        issue(
          "PARCEL_LAND_USES_EXCEEDED",
          `${path}.landUses`,
          `Mỗi thửa chỉ ghi tối đa ${MAX_LAND_USES_PER_PARCEL} dòng mục đích sử dụng.`,
        ),
      );
    }

    parcel.landUses.forEach((landUse, useIndex) => {
      const usePath = `${path}.landUses.${useIndex}`;
      if (landUse.purposeFreeText.length > MAX_PURPOSE_FREE_TEXT_LENGTH) {
        issues.push(
          issue(
            "LAND_USE_FREE_TEXT_TOO_LONG",
            `${usePath}.purposeFreeText`,
            `Ký hiệu loại đất tối đa ${MAX_PURPOSE_FREE_TEXT_LENGTH} ký tự.`,
          ),
        );
      }
      const useArea = landUse.area.trim() ? parseVietnameseDecimal(landUse.area) : null;
      if (landUse.area.trim() && (useArea === null || useArea <= 0)) {
        issues.push(
          issue(
            "LAND_USE_AREA_INVALID",
            `${usePath}.area`,
            "Diện tích theo mục đích phải là số lớn hơn 0. Không rõ thì để trống.",
          ),
        );
      }
    });

    // Chỉ so tổng khi cả diện tích thửa lẫn diện tích mục đích đều có — thiếu một bên thì không
    // có gì để so, và ở mức A cả hai đều được phép trống.
    const declared = parcel.landUses
      .map((landUse) => parseVietnameseDecimal(landUse.area))
      .filter((value): value is number => value !== null && value > 0);
    if (declared.length > 0 && parcelArea !== null && parcelArea > 0) {
      const total = declared.reduce((sum, value) => sum + value, 0);
      if (total - parcelArea > LAND_USE_AREA_TOLERANCE_M2) {
        issues.push(
          issue(
            "LAND_USE_AREA_EXCEEDS_PARCEL",
            `${path}.landUses`,
            "Tổng diện tích theo mục đích sử dụng vượt quá diện tích thửa.",
          ),
        );
      }
    }
  });

  return issues;
}

/**
 * MỨC A phần tài liệu — kiểm trên **file máy chủ đã xác minh**, không tin trạng thái client.
 *
 * Chỉ tính file `UPLOADED`: `REPLACED`/`DELETED` không còn là bằng chứng gì.
 */
export function validateCitizenRequiredFiles(
  draft: IntakeDraft,
  files: readonly Pick<PublicFileSummary, "ownerId" | "documentType" | "status">[],
): CitizenSubmitIssue[] {
  const issues: CitizenSubmitIssue[] = [];
  const uploaded = files.filter((file) => file.status === "UPLOADED");

  draft.owners.forEach((owner, index) => {
    if (!requiresCitizenId(owner.ownerType) || owner.hasDistinctCurrentUser) return;
    const has = (documentType: string): boolean =>
      uploaded.some((file) => file.ownerId === owner.id && file.documentType === documentType);

    if (!has("CITIZEN_ID_FRONT")) {
      issues.push(
        issue(
          "CITIZEN_ID_FRONT_REQUIRED",
          `files.owners.${index}.CITIZEN_ID_FRONT`,
          "Chưa có ảnh CCCD mặt trước.",
        ),
      );
    }
    if (!has("CITIZEN_ID_BACK")) {
      issues.push(
        issue(
          "CITIZEN_ID_BACK_REQUIRED",
          `files.owners.${index}.CITIZEN_ID_BACK`,
          "Chưa có ảnh CCCD mặt sau.",
        ),
      );
    }
  });

  if (!uploaded.some((file) => file.documentType === "CERTIFICATE")) {
    issues.push(
      issue(
        "CERTIFICATE_IMAGE_REQUIRED",
        "files.certificate",
        "Chưa có ảnh Giấy chứng nhận. Cần ít nhất một ảnh.",
      ),
    );
  }

  return issues;
}

/** Chỉ owner cá nhân có CCCD **hợp lệ** mới sinh HMAC tra cứu — không băm chuỗi rỗng. */
export function citizenIdsForLookup(draft: IntakeDraft): string[] {
  return draft.owners
    .filter((owner) => requiresCitizenId(owner.ownerType) && !owner.hasDistinctCurrentUser)
    .map((owner) => owner.identityNumber.trim())
    .filter((value) => CITIZEN_ID_PATTERN.test(value));
}

/** Ký hiệu loại đất người dân ghi tự do được lưu vào `purposeFreeText` với mã "ghi theo bìa". */
export const CITIZEN_RAW_LAND_PURPOSE_CODE = LAND_PURPOSE_GHI_THEO_BIA;

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
      if (
        owner.identityStatus !== "QR_CONFIRMED" &&
        owner.identityStatus !== "QR_OVERRIDE_PENDING_REVIEW" &&
        owner.identityStatus !== "MANUAL_COMPLETE"
      ) {
        return "Cần xác nhận thông tin CCCD của chủ sử dụng.";
      }
      if (
        owner.identityStatus === "QR_OVERRIDE_PENDING_REVIEW" &&
        owner.identityOverrideReason.trim().length < 5
      ) {
        return "Cần nêu lý do khi sửa thông tin định danh đã đọc từ QR.";
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
