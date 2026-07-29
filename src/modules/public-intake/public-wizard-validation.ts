/**
 * Kiểm tra theo từng bước cho wizard kê khai công khai (Public Intake V2, 4 bước).
 *
 * Nguồn đúng duy nhất là `validateCitizenSubmitDraft` — cùng hàm máy chủ dùng ở
 * `POST /submit`. Module này **không kiểm lại nội dung**, chỉ:
 *
 *   1. lọc các lỗi thuộc về bước đang mở, và
 *   2. ánh xạ `fieldPath` sang khóa lỗi mà wizard dùng để tô ô nhập,
 *   3. thêm các điều kiện chỉ có ở client: ảnh đã tải, upload đang chạy, hai câu hỏi sàng lọc.
 *
 * Tách khỏi `wizard.tsx` vì trước đây `validate()` chép lại logic nghiệp vụ bằng regex riêng
 * (`/^\d{12}$/`, `/^0\d{9}$/`…) — hai bản dễ lệch nhau, và không test được nếu không dựng cả
 * component.
 *
 * Đặt tên không có hậu tố `.client` (khác gợi ý trong kế hoạch) vì module này thuần túy, không
 * đụng API trình duyệt, nên chạy được trong test Node.
 */
import type { IntakeDraft } from "./types";
import { validateCitizenSubmitDraft, type CitizenSubmitIssue } from "./validation";

/**
 * Bốn bước của wizard V2.
 *
 * "Ảnh Giấy chứng nhận" đứng trước "Người kê khai và CCCD": bản kê khai chỉ tạo được (và chỉ từ đó
 * mới có thư mục Drive để tải ảnh) khi đã có số điện thoại + đồng ý xử lý dữ liệu — hai trường đó
 * giờ nằm ở đầu bước này. Đặt chúng ở bước cuối cùng là không thể, vì lúc đó hồ sơ đã phải tồn tại
 * từ lâu để các bước giữa tải được ảnh.
 */
export const PUBLIC_WIZARD_STEPS = [
  "Ảnh Giấy chứng nhận",
  "Người kê khai và CCCD",
  "Thông tin thửa đất",
  "Kiểm tra và gửi",
] as const;

export const STEP_CERTIFICATE_UPLOAD = 0;
export const STEP_CONTACT_AND_IDENTITY = 1;
export const STEP_PARCEL_QUICK = 2;
export const STEP_REVIEW_SUBMIT = 3;

export type WizardErrors = Record<string, string>;

export type IdentityDocumentType = "CITIZEN_ID_FRONT" | "CITIZEN_ID_BACK";

export interface WizardValidationInput {
  readonly step: number;
  readonly draft: IntakeDraft;
  /** Đã tạo bản kê khai trên máy chủ chưa (bước 1 có hai giai đoạn). */
  readonly hasReceipt: boolean;
  /** Hai câu hỏi sàng lọc, chỉ hỏi trước khi tạo bản kê khai. */
  readonly hasCertificate: string;
  readonly certificateCount: string;
  /** `ownerId` → các mặt CCCD đã tải xong. */
  readonly uploadedIdentitySides: Readonly<Record<string, readonly IdentityDocumentType[]>>;
  readonly uploadedCertificateCount: number;
  /** Còn ảnh đang tải hoặc tải lỗi chưa xử lý thì không cho đi tiếp/gửi. */
  readonly hasPendingUpload: boolean;
  readonly hasFailedUpload: boolean;
}

/**
 * Trường nào thuộc bước nào. Khóa là tiền tố của `fieldPath`.
 *
 * `parcels.*` gộp cả thửa đất lẫn loại đất vì V2 nhập cả hai trong một bước.
 */
function stepOfFieldPath(fieldPath: string): number {
  if (fieldPath === "phone" || fieldPath === "consentAccepted") return STEP_CERTIFICATE_UPLOAD;
  if (fieldPath.startsWith("owners")) return STEP_CONTACT_AND_IDENTITY;
  if (fieldPath.startsWith("certificate.")) return STEP_CERTIFICATE_UPLOAD;
  if (fieldPath.startsWith("parcels")) return STEP_PARCEL_QUICK;
  // Lỗi cấu trúc hoặc trường lạ: chỉ hiện ở bước cuối, không chặn giữa chừng.
  return STEP_REVIEW_SUBMIT;
}

/**
 * `owners.0.fullName` → `owner-0-name`, `parcels.1.landUses.2.area` → `use-1-2-area`…
 *
 * Trả `""` cho các đường dẫn không có ô nhập tương ứng (lỗi cấu trúc); phía gọi đưa vào lỗi chung.
 */
export function errorKeyForFieldPath(fieldPath: string): string {
  const owner = /^owners\.(\d+)\.(\w+)$/.exec(fieldPath);
  if (owner) {
    const [, index, field] = owner;
    const map: Record<string, string> = {
      fullName: "name",
      identityNumber: "id",
      dateOfBirth: "dob",
      roleOnCertificate: "role",
      residenceAddress: "address",
      currentUserName: "cu-name",
      currentUserCitizenId: "cu-id",
      currentUserAddress: "cu-address",
      changeReason: "cu-reason",
    };
    return map[field] ? `owner-${index}-${map[field]}` : `owner-${index}-${field}`;
  }

  const landUse = /^parcels\.(\d+)\.landUses\.(\d+)\.(\w+)$/.exec(fieldPath);
  if (landUse) {
    const [, parcelIndex, useIndex, field] = landUse;
    const map: Record<string, string> = { purposeFreeText: "purposefree", area: "area" };
    return `use-${parcelIndex}-${useIndex}-${map[field] ?? field}`;
  }

  const parcelLandUses = /^parcels\.(\d+)\.landUses$/.exec(fieldPath);
  if (parcelLandUses) return `parcel-${parcelLandUses[1]}-usearea`;

  const parcel = /^parcels\.(\d+)\.(\w+)$/.exec(fieldPath);
  if (parcel) {
    const [, index, field] = parcel;
    const map: Record<string, string> = {
      area: "area",
      oldWard: "oldward",
      mapSheetNumber: "mapsheet",
      parcelNumber: "parcelnumber",
      parcelIdCode: "parcelidcode",
      addressOnCertificate: "address",
    };
    return `parcel-${index}-${map[field] ?? field}`;
  }

  if (fieldPath === "phone") return "phone";
  if (fieldPath === "consentAccepted") return "consent";
  if (fieldPath === "certificate.issueDate") return "issueDate";
  if (fieldPath === "certificate.issueNumber") return "issueNumber";
  if (fieldPath === "certificate.registryNumber") return "registryNumber";
  if (fieldPath === "owners") return "owners";
  return "";
}

const UPLOAD_PENDING_MESSAGE = "Còn ảnh đang tải lên. Đợi tải xong rồi bấm tiếp.";
const UPLOAD_FAILED_MESSAGE = "Có ảnh tải lỗi. Thử lại hoặc xóa ảnh đó rồi bấm tiếp.";

/**
 * Trả các lỗi **chặn** của bước đang mở. Rỗng nghĩa là được đi tiếp.
 *
 * Điều **không** chặn ở V2, dù trước đây có: QR không đọc được, thiếu ngày sinh/giới tính/địa
 * chỉ, thiếu vai trò trên GCN, thiếu CCCD dạng chữ, thiếu số phát hành/ngày cấp/số vào sổ, thiếu
 * số tờ/số thửa/diện tích/tổ dân phố, thiếu nguồn gốc/hình thức/thời hạn.
 */
export function validatePublicWizardStep(input: WizardValidationInput): WizardErrors {
  const errors: WizardErrors = {};

  // Giai đoạn sàng lọc trước khi tạo bản kê khai — không liên quan tới `draft`. Hai câu hỏi này
  // không còn ô nhập trên màn hình (hệ thống tự gán "CO"/"MOT"), nên trong thực tế không bao giờ
  // rỗng; điều kiện vẫn giữ để không âm thầm cho qua nếu sau này có chỗ quên gán mặc định.
  if (input.step === STEP_CERTIFICATE_UPLOAD && !input.hasReceipt) {
    if (!input.hasCertificate) errors.hasCertificate = "Chọn một phương án.";
    if (!input.certificateCount) errors.certificateCount = "Chọn một phương án.";
  }

  for (const issue of relevantIssues(input)) {
    const key = errorKeyForFieldPath(issue.fieldPath);
    errors[key || "draft"] = issue.message;
  }

  if (input.step === STEP_CONTACT_AND_IDENTITY) {
    Object.assign(errors, identityPhotoErrors(input));
  }

  // Chưa có bản kê khai thì chưa có nơi để tải ảnh GCN — không được báo "thiếu ảnh" trong lúc màn
  // hình vẫn đang hỏi điện thoại/đồng ý để tạo hồ sơ.
  if (
    input.step === STEP_CERTIFICATE_UPLOAD &&
    input.hasReceipt &&
    input.uploadedCertificateCount < 1
  ) {
    errors.certificatePhotos = "Chưa có ảnh Giấy chứng nhận. Cần ít nhất một ảnh.";
  }

  // Ảnh đang tải / tải lỗi chỉ chặn ở các bước có upload và ở bước gửi.
  const stepHasUpload =
    input.step === STEP_CONTACT_AND_IDENTITY ||
    input.step === STEP_CERTIFICATE_UPLOAD ||
    input.step === STEP_REVIEW_SUBMIT;
  if (stepHasUpload) {
    if (input.hasPendingUpload) errors.uploadPending = UPLOAD_PENDING_MESSAGE;
    if (input.hasFailedUpload) errors.uploadFailed = UPLOAD_FAILED_MESSAGE;
  }

  return errors;
}

function relevantIssues(input: WizardValidationInput): CitizenSubmitIssue[] {
  // Trước khi có bản kê khai, chỉ số điện thoại và đồng ý là có ô nhập trên màn hình.
  const issues = validateCitizenSubmitDraft(input.draft);
  if (input.step === STEP_CERTIFICATE_UPLOAD && !input.hasReceipt) {
    return issues.filter(
      (item) => item.fieldPath === "phone" || item.fieldPath === "consentAccepted",
    );
  }
  if (input.step === STEP_REVIEW_SUBMIT) return issues;
  return issues.filter((item) => stepOfFieldPath(item.fieldPath) === input.step);
}

/**
 * Thiếu ảnh phải báo **ngay tại khối tải ảnh của đúng người**, không chỉ một thông báo chung —
 * đây là góp ý "ko up ảnh thì phải thông báo thiếu trường thông tin".
 */
function identityPhotoErrors(input: WizardValidationInput): WizardErrors {
  const errors: WizardErrors = {};
  input.draft.owners.forEach((owner, index) => {
    if (!ownerNeedsIdentityPhotos(owner.ownerType, owner.hasDistinctCurrentUser)) return;
    const sides = input.uploadedIdentitySides[owner.id] ?? [];
    if (!sides.includes("CITIZEN_ID_FRONT")) {
      errors[`owner-${index}-front`] = "Chưa có ảnh CCCD mặt trước.";
    }
    if (!sides.includes("CITIZEN_ID_BACK")) {
      errors[`owner-${index}-back`] = "Chưa có ảnh CCCD mặt sau.";
    }
  });
  return errors;
}

/** Tổ chức/cộng đồng không có CCCD; người trên GCN đã sang tên thì miễn ảnh của họ. */
export function ownerNeedsIdentityPhotos(
  ownerType: string,
  hasDistinctCurrentUser: boolean,
): boolean {
  if (ownerType === "TO_CHUC" || ownerType === "CONG_DONG_DAN_CU") return false;
  return !hasDistinctCurrentUser;
}

export interface ChecklistItem {
  readonly key: string;
  readonly label: string;
  readonly done: boolean;
}

/**
 * Checklist ở bước gửi — chỉ liệt kê **điều kiện bắt buộc**. Các trường tùy chọn hiển thị riêng
 * là "Đã nhập" / "Cán bộ sẽ bổ sung", không đưa vào đây để người dân không tưởng là mình sai.
 */
export function submitChecklist(input: WizardValidationInput): ChecklistItem[] {
  const owners = input.draft.owners;
  const needPhotos = owners.filter((owner) =>
    ownerNeedsIdentityPhotos(owner.ownerType, owner.hasDistinctCurrentUser),
  );
  const hasSide = (side: IdentityDocumentType): boolean =>
    needPhotos.length > 0 &&
    needPhotos.every((owner) => (input.uploadedIdentitySides[owner.id] ?? []).includes(side));

  return [
    {
      key: "phone",
      label: "Đã có số điện thoại liên hệ",
      done: /^0\d{9}$/.test(input.draft.phone.trim()),
    },
    {
      key: "ownerName",
      label: "Đã có tên chủ sử dụng",
      done: owners.length > 0 && owners.every((owner) => owner.fullName.trim().length > 0),
    },
    {
      key: "identityFront",
      label: "Đã có ảnh CCCD mặt trước",
      done: needPhotos.length === 0 || hasSide("CITIZEN_ID_FRONT"),
    },
    {
      key: "identityBack",
      label: "Đã có ảnh CCCD mặt sau",
      done: needPhotos.length === 0 || hasSide("CITIZEN_ID_BACK"),
    },
    {
      key: "certificate",
      label: "Đã có ảnh Giấy chứng nhận",
      done: input.uploadedCertificateCount > 0,
    },
    {
      key: "uploads",
      label: "Mọi ảnh đã tải xong",
      done: !input.hasPendingUpload && !input.hasFailedUpload,
    },
  ];
}

/** Các thông tin tùy chọn: hiển thị "Đã nhập" hoặc "Cán bộ sẽ bổ sung", **không** coi là lỗi. */
export function optionalSummary(draft: IntakeDraft): ChecklistItem[] {
  const parcel = draft.parcels[0];
  return [
    {
      key: "certificateFields",
      label: "Số phát hành, ngày cấp, số vào sổ Giấy chứng nhận",
      done: Boolean(
        draft.certificate.issueNumber.trim() ||
        draft.certificate.issueDate.trim() ||
        draft.certificate.registryNumber.trim(),
      ),
    },
    {
      key: "parcelNumbers",
      label: "Số tờ, số thửa",
      done: Boolean(parcel?.mapSheetNumber.trim() || parcel?.parcelNumber.trim()),
    },
    { key: "area", label: "Diện tích", done: Boolean(parcel?.area.trim()) },
    {
      key: "landPurpose",
      label: "Ký hiệu loại đất theo Giấy chứng nhận",
      done: Boolean(parcel?.landUses.some((landUse) => landUse.purposeFreeText.trim())),
    },
    {
      key: "neighborhood",
      label: "Tổ dân phố nơi có thửa đất",
      done: Boolean(parcel?.addressTwoLevel.trim()),
    },
  ];
}
