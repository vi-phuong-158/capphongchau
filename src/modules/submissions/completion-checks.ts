import type { Asset, IntakeDraft, Owner, Parcel } from "@/modules/public-intake/types";
import type { SubmissionRecord } from "@/modules/public-intake/repository";
import {
  CERTIFICATE_ROLE_CODES,
  CHANGE_REASON_CODES,
  LAND_ORIGIN_OPTIONS,
  LAND_PURPOSE_CAN_DOI_CHIEU,
  LAND_PURPOSE_GHI_THEO_BIA,
  LAND_PURPOSE_SELECT_OPTIONS,
  LAND_USE_FORM_OPTIONS,
  LAND_USE_TERM_OPTIONS,
  OLD_WARD_OPTIONS,
  ASSET_TYPE_OPTIONS,
} from "@/modules/public-intake/reference";
import {
  CITIZEN_ID_PATTERN,
  LAND_USE_AREA_TOLERANCE_M2,
  ORGANISATION_ID_PATTERN,
  isValidDate,
  overrideReasonsWithCitizenIdLike,
} from "@/modules/public-intake/validation";
import {
  isOrganisationOwner,
  requiresCitizenId,
  MAX_LAND_USES_PER_PARCEL,
} from "@/modules/public-intake/types";
import { parseVietnameseDecimal } from "@/modules/public-intake/vietnamese-number";

export interface CompletionCheck {
  code: string;
  label: string;
  severity: "BLOCKING" | "WARNING";
  message: string;
}

/** Chi tiết an toàn để API cán bộ chỉ ra chính xác mục nào đang chặn tiếp nhận. */
export function blockingCompletionIssueDetails(
  checks: readonly CompletionCheck[],
): Array<Pick<CompletionCheck, "code" | "label" | "message">> {
  return checks
    .filter((check) => check.severity === "BLOCKING")
    .map(({ code, label, message }) => ({ code, label, message }));
}

const OLD_WARD_CODES = new Set(OLD_WARD_OPTIONS.map((option) => option.code));
const LAND_PURPOSE_CODES = new Set(LAND_PURPOSE_SELECT_OPTIONS.map((option) => option.code));
const LAND_ORIGIN_CODES = new Set(LAND_ORIGIN_OPTIONS.map((option) => option.code));
const LAND_USE_FORM_CODES = new Set(LAND_USE_FORM_OPTIONS.map((option) => option.code));
const LAND_USE_TERM_CODES = new Set(LAND_USE_TERM_OPTIONS.map((option) => option.code));

/**
 * MỨC C — gác cổng **tiếp nhận chính thức**.
 *
 * Từ Public Intake V2, cổng công khai chỉ đòi người dân số điện thoại, tên chủ sử dụng và đủ ảnh
 * (`validateCitizenSubmitDraft`). Toàn bộ dữ liệu PL3 mà `validateDraftForSubmit` từng bắt buộc ở
 * cổng công khai **chuyển hết về đây**. Thiếu bước này thì nới điều kiện gửi đồng nghĩa với việc
 * hồ sơ chỉ có tên + ảnh cũng tiếp nhận chính thức được — xem
 * `tests/public-intake-v2-characterization.test.ts` cho hiện trạng trước khi vá.
 *
 * Cán bộ hoàn thiện dữ liệu ở `working_payload`; `payload` truyền vào đây là **payload hiệu lực**
 * (`effectivePayload`), tức bản đã gộp phần cán bộ sửa.
 */
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

  const block = (code: string, label: string, message: string): void => {
    checks.push({ code, label, severity: "BLOCKING", message });
  };

  if (payload.consentAccepted !== true) {
    block(
      "CONSENT_NOT_ACCEPTED",
      "Thiếu xác nhận đồng ý",
      "Hồ sơ chưa có bằng chứng người kê khai đã đồng ý thông báo xử lý dữ liệu.",
    );
  }

  checkCertificate(payload, block);
  checkOwners(payload, block);
  checkParcels(payload, block);
  checkAssets(payload, block);
  checkAutomaticOverrides(payload, block);
  checkFiles(record, payload, block);

  return checks;
}

type Blocker = (code: string, label: string, message: string) => void;

function checkCertificate(payload: IntakeDraft, block: Blocker): void {
  const cert = payload.certificate;
  if (!cert.issueNumber.trim()) {
    block(
      "CERT_ISSUE_NUMBER_MISSING",
      "Thiếu số phát hành GCN",
      "Chưa nhập số phát hành Giấy chứng nhận.",
    );
  }
  if (!cert.issueDate.trim() || !isValidDate(cert.issueDate.trim())) {
    block(
      "CERT_ISSUE_DATE_INVALID",
      "Ngày cấp GCN không hợp lệ",
      "Ngày cấp GCN phải có định dạng YYYY-MM-DD và là ngày hợp lệ.",
    );
  }
  if (!cert.registryNumber.trim()) {
    block("CERT_REGISTRY_NUMBER_MISSING", "Thiếu số vào sổ GCN", "Chưa nhập số vào sổ cấp GCN.");
  }
}

function checkOwners(payload: IntakeDraft, block: Blocker): void {
  if (!payload.owners || payload.owners.length === 0) {
    block("OWNERS_EMPTY", "Thiếu thông tin chủ sử dụng", "Hồ sơ phải có ít nhất 1 chủ sử dụng.");
    return;
  }
  payload.owners.forEach((owner, index) => checkOwner(owner, index, block));
}

function checkOwner(owner: Owner, index: number, block: Blocker): void {
  const nth = index + 1;
  const prefix = `OWNER_${index}`;

  if (!owner.fullName.trim()) {
    block(
      `${prefix}_NAME_MISSING`,
      `Chủ ${nth} thiếu họ tên`,
      `Chủ sử dụng thứ ${nth} chưa nhập họ và tên.`,
    );
  }

  if (!CERTIFICATE_ROLE_CODES.includes(owner.roleOnCertificate)) {
    block(
      `${prefix}_ROLE_MISSING`,
      `Chủ ${nth} thiếu vai trò trên GCN`,
      `Chủ sử dụng thứ ${nth} chưa có vai trò trên Giấy chứng nhận thuộc danh mục PL3.`,
    );
  }

  if (isOrganisationOwner(owner.ownerType)) {
    if (!owner.organisationName?.trim()) {
      block(
        `${prefix}_ORG_NAME_MISSING`,
        `Chủ ${nth} thiếu tên tổ chức`,
        `Dòng thứ ${nth} là tổ chức nhưng chưa nhập tên tổ chức ở cột F của PL3.`,
      );
    }
    if (!ORGANISATION_ID_PATTERN.test(owner.organisationIdentityNumber?.trim() ?? "")) {
      block(
        `${prefix}_ORG_ID_INVALID`,
        `Chủ ${nth} mã số tổ chức không hợp lệ`,
        `Tổ chức thứ ${nth} phải có mã số gồm 10 chữ số (hoặc kèm 3 số đơn vị trực thuộc) ở cột G.`,
      );
    }
  }

  // Người trên GCN đã mất / đã sang tên: miễn định danh của họ, đổi lại phải khai đủ người sử
  // dụng hiện tại (cột O, P và trường 14, 15 của PL3).
  if (owner.hasDistinctCurrentUser) {
    if (owner.identityNumber.trim() && !CITIZEN_ID_PATTERN.test(owner.identityNumber.trim())) {
      block(
        `${prefix}_ID_INVALID`,
        `Chủ ${nth} CCCD không hợp lệ`,
        `Số định danh của chủ sử dụng thứ ${nth} phải gồm đúng 12 chữ số.`,
      );
    }
    if (!owner.currentUserName.trim()) {
      block(
        `${prefix}_CURRENT_USER_NAME_MISSING`,
        `Chủ ${nth} thiếu tên người sử dụng hiện tại`,
        `Chủ sử dụng thứ ${nth} chưa có tên người sử dụng đất hiện tại.`,
      );
    }
    if (!CITIZEN_ID_PATTERN.test(owner.currentUserCitizenId.trim())) {
      block(
        `${prefix}_CURRENT_USER_ID_INVALID`,
        `Chủ ${nth} CCCD người sử dụng hiện tại không hợp lệ`,
        `Người sử dụng hiện tại của chủ thứ ${nth} phải có CCCD gồm đúng 12 chữ số.`,
      );
    }
    if (!owner.currentUserAddress.trim()) {
      block(
        `${prefix}_CURRENT_USER_ADDRESS_MISSING`,
        `Chủ ${nth} thiếu địa chỉ người sử dụng hiện tại`,
        `Người sử dụng hiện tại của chủ thứ ${nth} chưa có địa chỉ thường trú.`,
      );
    }
    if (!CHANGE_REASON_CODES.includes(owner.changeReason)) {
      block(
        `${prefix}_CHANGE_REASON_MISSING`,
        `Chủ ${nth} thiếu lý do thay đổi`,
        `Chủ sử dụng thứ ${nth} chưa nêu lý do thay đổi người sử dụng đất.`,
      );
    }
    return;
  }

  if (!CITIZEN_ID_PATTERN.test(owner.identityNumber.trim())) {
    block(
      `${prefix}_ID_INVALID`,
      `Chủ ${nth} CCCD không hợp lệ`,
      `Chủ sử dụng thứ ${nth} phải có số CCCD gồm đúng 12 chữ số.`,
    );
  }

  if (requiresCitizenId(owner.ownerType)) {
    if (owner.identityStatus === "QR_OVERRIDE_PENDING_REVIEW") {
      block(
        `${prefix}_IDENTITY_OVERRIDE_PENDING`,
        `Chủ ${nth} còn chờ duyệt thay đổi định danh`,
        `Thông tin định danh của chủ sử dụng thứ ${nth} đã sửa sau xác nhận QR và chưa được duyệt.`,
      );
    } else if (
      owner.identityStatus !== "QR_CONFIRMED" &&
      owner.identityStatus !== "MANUAL_COMPLETE"
    ) {
      block(
        `${prefix}_IDENTITY_NOT_CONFIRMED`,
        `Chủ ${nth} chưa xác nhận định danh`,
        `Thông tin định danh của chủ sử dụng thứ ${nth} chưa được xác nhận.`,
      );
    }
  }

  if (!isValidDate(owner.dateOfBirth.trim())) {
    block(
      `${prefix}_DOB_MISSING`,
      `Chủ ${nth} thiếu ngày sinh`,
      `Chủ sử dụng thứ ${nth} chưa có ngày sinh hợp lệ.`,
    );
  }
  if (owner.gender !== "NAM" && owner.gender !== "NU") {
    block(
      `${prefix}_GENDER_MISSING`,
      `Chủ ${nth} thiếu giới tính`,
      `Chủ sử dụng thứ ${nth} chưa có giới tính.`,
    );
  }
  if (!owner.residenceAddress.trim()) {
    block(
      `${prefix}_ADDRESS_MISSING`,
      `Chủ ${nth} thiếu địa chỉ thường trú`,
      `Chủ sử dụng thứ ${nth} chưa có địa chỉ thường trú.`,
    );
  }
}

/**
 * Tên gọi tài sản cho thông báo lỗi: đủ để cán bộ tìm đúng thẻ tài sản trên màn hình mà không lộ
 * gì nhạy cảm (loại tài sản là mã danh mục đóng, mô tả do chính cán bộ ghi).
 */
function assetLabel(asset: Asset, index: number): string {
  const typeLabel = ASSET_TYPE_OPTIONS.find((option) => option.code === asset.assetType)?.label;
  const description = asset.description.trim();
  const detail = [typeLabel, description].filter(Boolean).join(" — ");
  return detail ? `Tài sản ${index + 1} (${detail})` : `Tài sản ${index + 1}`;
}

function checkAssets(payload: IntakeDraft, block: Blocker): void {
  const parcelIds = new Set(payload.parcels.map((parcel) => parcel.id));
  const assetTypeCodes = new Set(ASSET_TYPE_OPTIONS.map((option) => option.code));
  payload.assets.forEach((asset: Asset, index) => {
    const nth = index + 1;
    const prefix = `ASSET_${index}`;
    const name = assetLabel(asset, index);
    if (!asset.parcelId || !parcelIds.has(asset.parcelId)) {
      block(
        `${prefix}_PARCEL_INVALID`,
        `${name} chưa chọn thửa đất`,
        `${name} chưa được gắn với thửa nào. Mở bàn làm việc, chọn thửa ở ô "Thửa đất liên quan" của tài sản này rồi lưu lại.`,
      );
    }
    if (!assetTypeCodes.has(asset.assetType)) {
      block(
        `${prefix}_TYPE_INVALID`,
        `Tài sản ${nth} thiếu loại tài sản`,
        `Tài sản thứ ${nth} chưa chọn loại tài sản gắn liền với đất.`,
      );
    }
    for (const [field, label] of [
      [asset.constructionArea, "diện tích xây dựng"],
      [asset.floorArea, "diện tích sàn"],
    ] as const) {
      if (field?.trim()) {
        const value = parseVietnameseDecimal(field);
        if (value === null || value <= 0) {
          block(
            `${prefix}_${label === "diện tích xây dựng" ? "CONSTRUCTION" : "FLOOR"}_AREA_INVALID`,
            `Tài sản ${nth} ${label} không hợp lệ`,
            `${label} của tài sản thứ ${nth} phải là số lớn hơn 0.`,
          );
        }
      }
    }
  });
}

function checkAutomaticOverrides(payload: IntakeDraft, block: Blocker): void {
  /*
   * Gác cổng thứ hai cho quy tắc "ô lý do không chứa CCCD". `validateWorkingPayloadForSave` đã
   * chặn lúc lưu, nhưng bản ghi lưu TRƯỚC khi có luật này vẫn còn trong kho — và audit của lần
   * tiếp nhận sẽ chép lại chính chuỗi đó. Chặn ở đây thì cán bộ buộc phải sửa rồi lưu lại, mà
   * đường lưu đã sạch nên không có thế bí.
   */
  for (const label of overrideReasonsWithCitizenIdLike(payload)) {
    block(
      "OVERRIDE_REASON_CONTAINS_CITIZEN_ID",
      `${label} chứa số định danh cá nhân`,
      `${label} không được chứa CCCD. Sửa thành lý do nghiệp vụ ngắn rồi lưu lại bản làm việc.`,
    );
  }

  const check = (
    value: string | undefined,
    reason: string | undefined,
    code: string,
    label: string,
  ) => {
    if (value?.trim() && (reason?.trim().length ?? 0) < 10) {
      block(code, label, `${label} phải có lý do ghi đè từ 10 ký tự.`);
    }
  };
  check(
    payload.wardAdministrativeCodeOverride,
    payload.wardAdministrativeCodeOverrideReason,
    "WARD_CODE_OVERRIDE_REASON_MISSING",
    "Ghi đè mã ĐVHC",
  );
  check(
    payload.scannedFileNamesOverride,
    payload.scannedFileNamesOverrideReason,
    "SCANNED_FILES_OVERRIDE_REASON_MISSING",
    "Ghi đè tên file quét",
  );
  payload.parcels.forEach((parcel, index) =>
    check(
      parcel.cadastralMapSheetNumber,
      parcel.cadastralMapSheetOverrideReason,
      `PARCEL_${index}_MAP_SHEET_OVERRIDE_REASON_MISSING`,
      `Ghi đè số hiệu tờ địa chính của thửa ${index + 1}`,
    ),
  );
}

function checkParcels(payload: IntakeDraft, block: Blocker): void {
  if (!payload.parcels || payload.parcels.length === 0) {
    block("PARCELS_EMPTY", "Thiếu thông tin thửa đất", "Hồ sơ phải có ít nhất 1 thửa đất.");
    return;
  }
  payload.parcels.forEach((parcel, index) => checkParcel(parcel, index, block));
}

function checkParcel(parcel: Parcel, index: number, block: Blocker): void {
  const nth = index + 1;
  const prefix = `PARCEL_${index}`;

  if (!parcel.addressOnCertificate.trim()) {
    block(
      `${prefix}_ADDRESS_MISSING`,
      `Thửa ${nth} thiếu địa chỉ trên GCN`,
      `Thửa đất thứ ${nth} chưa có địa chỉ ghi trên Giấy chứng nhận.`,
    );
  }

  // Trống **và** sai danh mục đều chặn. Trước V2 chỉ chặn khi sai danh mục, nên thửa bỏ trống
  // `oldWard` vẫn tiếp nhận được — mà thiếu nó thì không quy đổi được số hiệu tờ bản đồ
  // (trường 19 của PL3) vì ba xã cũ đều đánh số tờ từ 1.
  if (!OLD_WARD_CODES.has(parcel.oldWard)) {
    block(
      `${prefix}_WARD_INVALID`,
      `Thửa ${nth} thiếu/sai ĐVHC cũ`,
      `Thửa đất thứ ${nth} chưa có đơn vị hành chính cũ hợp lệ (cần để suy ra số hiệu tờ bản đồ).`,
    );
  }

  const parcelArea = parseVietnameseDecimal(parcel.area);
  if (parcelArea === null || parcelArea <= 0) {
    block(
      `${prefix}_AREA_INVALID`,
      `Thửa ${nth} diện tích không hợp lệ`,
      `Thửa đất thứ ${nth} phải có diện tích lớn hơn 0.`,
    );
  }

  if (parcel.landUses.length === 0) {
    block(
      `${prefix}_LAND_USES_EMPTY`,
      `Thửa ${nth} chưa có mục đích sử dụng`,
      `Thửa đất thứ ${nth} cần ít nhất một dòng mục đích sử dụng.`,
    );
    return;
  }
  if (parcel.landUses.length > MAX_LAND_USES_PER_PARCEL) {
    block(
      `${prefix}_LAND_USES_EXCEEDED`,
      `Thửa ${nth} vượt quá ${MAX_LAND_USES_PER_PARCEL} mục đích`,
      `Thửa đất thứ ${nth} có ${parcel.landUses.length} mục đích sử dụng (tối đa ${MAX_LAND_USES_PER_PARCEL} theo mẫu PL3).`,
    );
  }

  parcel.landUses.forEach((landUse, useIndex) => {
    const usePrefix = `${prefix}_USE_${useIndex}`;
    const useNth = useIndex + 1;

    if (!LAND_PURPOSE_CODES.has(landUse.purposeCode)) {
      block(
        `${usePrefix}_PURPOSE_MISSING`,
        `Thửa ${nth} mục đích ${useNth} thiếu loại đất`,
        `Dòng mục đích ${useNth} của thửa ${nth} chưa chọn loại đất trong danh mục.`,
      );
    }
    // "Ghi theo bìa" là lối thoát hợp lệ, nhưng phải có chữ; "đề nghị đối chiếu" là việc chưa làm
    // xong — cán bộ phải chốt trước khi tiếp nhận chính thức.
    if (landUse.purposeCode === LAND_PURPOSE_GHI_THEO_BIA && !landUse.purposeFreeText.trim()) {
      block(
        `${usePrefix}_PURPOSE_FREE_TEXT_MISSING`,
        `Thửa ${nth} mục đích ${useNth} chưa ghi loại đất theo bìa`,
        `Dòng mục đích ${useNth} của thửa ${nth} chọn "ghi theo bìa" nhưng chưa nhập nội dung.`,
      );
    }
    if (landUse.purposeCode === LAND_PURPOSE_CAN_DOI_CHIEU) {
      block(
        `${usePrefix}_PURPOSE_UNRESOLVED`,
        `Thửa ${nth} mục đích ${useNth} chờ đối chiếu`,
        `Dòng mục đích ${useNth} của thửa ${nth} còn ở trạng thái "đề nghị cán bộ đối chiếu"; cần chốt loại đất trước khi tiếp nhận.`,
      );
    }
    if (!LAND_ORIGIN_CODES.has(landUse.originCode)) {
      block(
        `${usePrefix}_ORIGIN_MISSING`,
        `Thửa ${nth} mục đích ${useNth} thiếu nguồn gốc`,
        `Dòng mục đích ${useNth} của thửa ${nth} chưa có nguồn gốc sử dụng đất.`,
      );
    }
    if (!LAND_USE_FORM_CODES.has(landUse.formCode)) {
      block(
        `${usePrefix}_FORM_MISSING`,
        `Thửa ${nth} mục đích ${useNth} thiếu hình thức`,
        `Dòng mục đích ${useNth} của thửa ${nth} chưa có hình thức sử dụng.`,
      );
    }
    if (!LAND_USE_TERM_CODES.has(landUse.termCode)) {
      block(
        `${usePrefix}_TERM_MISSING`,
        `Thửa ${nth} mục đích ${useNth} thiếu thời hạn`,
        `Dòng mục đích ${useNth} của thửa ${nth} chưa có thời hạn sử dụng.`,
      );
    }
  });

  const declared = parcel.landUses
    .map((landUse) => parseVietnameseDecimal(landUse.area))
    .filter((value): value is number => value !== null && value > 0);
  if (declared.length > 0 && parcelArea !== null && parcelArea > 0) {
    const total = declared.reduce((sum, value) => sum + value, 0);
    if (total - parcelArea > LAND_USE_AREA_TOLERANCE_M2) {
      block(
        `${prefix}_LAND_USE_AREA_EXCEEDS`,
        `Thửa ${nth} tổng diện tích mục đích vượt diện tích thửa`,
        `Tổng diện tích theo mục đích của thửa ${nth} (${total} m²) vượt diện tích thửa (${parcelArea} m²).`,
      );
    }
  }
}

/**
 * File: chuyển từ WARNING sang **BLOCKING**.
 *
 * Trước V2 hồ sơ không có ảnh nào vẫn tiếp nhận chính thức được. Khi cổng công khai chỉ còn thu
 * "CCCD + GCN + tên chủ", ảnh chính là bằng chứng duy nhất cán bộ dùng để đối chiếu — thiếu ảnh
 * thì không có gì để tiếp nhận.
 */
function checkFiles(record: SubmissionRecord, payload: IntakeDraft, block: Blocker): void {
  const uploaded = record.fileSummaries.filter((file) => file.status === "UPLOADED");

  if (!uploaded.some((file) => file.documentType === "CERTIFICATE")) {
    block(
      "FILES_CERTIFICATE_MISSING",
      "Thiếu ảnh Giấy chứng nhận",
      "Hồ sơ chưa có ảnh Giấy chứng nhận nào ở trạng thái đã tải lên.",
    );
  }

  payload.owners.forEach((owner, index) => {
    if (!requiresCitizenId(owner.ownerType) || owner.hasDistinctCurrentUser) return;
    const nth = index + 1;
    for (const [documentType, side] of [
      ["CITIZEN_ID_FRONT", "mặt trước"],
      ["CITIZEN_ID_BACK", "mặt sau"],
    ] as const) {
      const has = uploaded.some(
        (file) => file.ownerId === owner.id && file.documentType === documentType,
      );
      if (!has) {
        block(
          `FILES_OWNER_${index}_${documentType}_MISSING`,
          `Chủ ${nth} thiếu ảnh CCCD ${side}`,
          `Chủ sử dụng thứ ${nth} chưa có ảnh CCCD ${side}.`,
        );
      }
    }
  });
}
