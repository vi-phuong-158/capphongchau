import { createHmac, randomUUID } from "node:crypto";

import { requiresCitizenId, type IntakeDraft } from "./types";

export const PUBLIC_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "UNDER_REVIEW",
  "NEEDS_SUPPLEMENT",
  "RESUBMITTED",
  "ACCEPTING",
  "ACCEPTED",
  "NO_ACTION_REQUIRED",
  "REJECTED",
  "EXPIRED",
] as const;

export type PublicStatus = (typeof PUBLIC_STATUSES)[number];

export const PUBLIC_BUCKETS = ["pending", "in-progress", "accepted"] as const;
export type PublicBucket = (typeof PUBLIC_BUCKETS)[number];

export function getSubmissionBucket(status: PublicStatus, isClaimed: boolean): PublicBucket | null {
  if (status === "ACCEPTED") return "accepted";
  if (["UNDER_REVIEW", "ACCEPTING"].includes(status)) return "in-progress";
  if (["SUBMITTED", "RESUBMITTED", "NEEDS_SUPPLEMENT"].includes(status)) {
    return isClaimed ? "in-progress" : "pending";
  }
  return null;
}

export const QUEUE_BUCKET_SQL_CONDITION = `
  $8::text is null
  or ($8 = 'pending' and claimed_by is null and status in ('SUBMITTED', 'RESUBMITTED', 'NEEDS_SUPPLEMENT'))
  or ($8 = 'in-progress' and (
    status in ('UNDER_REVIEW', 'ACCEPTING')
    or (claimed_by is not null and status in ('SUBMITTED', 'RESUBMITTED', 'NEEDS_SUPPLEMENT'))
  ))
  or ($8 = 'accepted' and status = 'ACCEPTED')
`;

export const PUBLIC_STATUS_LABELS: Readonly<Record<PublicStatus, string>> = {
  DRAFT: "Chưa gửi",
  SUBMITTED: "Đã gửi",
  UNDER_REVIEW: "Đang kiểm tra",
  NEEDS_SUPPLEMENT: "Cần bổ sung",
  RESUBMITTED: "Đã gửi bổ sung",
  ACCEPTING: "Đang tiếp nhận",
  ACCEPTED: "Đã tiếp nhận",
  NO_ACTION_REQUIRED: "Đã có hồ sơ, không cần nộp lại",
  REJECTED: "Không tiếp nhận",
  EXPIRED: "Hết thời hạn lưu nháp",
};

export type PublicDocumentType = "CITIZEN_ID_FRONT" | "CITIZEN_ID_BACK" | "CERTIFICATE";
export type PublicFileStatus = "UPLOADED" | "REPLACED" | "DELETED";

export interface PublicFileSummary {
  readonly fileId: string;
  readonly ownerId: string;
  readonly documentType: PublicDocumentType;
  readonly status: PublicFileStatus;
  readonly sizeBytes: number;
  readonly checksum: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  /** Nội bộ server; DTO công khai phải ánh xạ allowlist và không trả hai trường này. */
  readonly driveFileId?: string;
  readonly mimeType?: string;
  /** Nội bộ: không đưa vào DTO công khai. */
  readonly rowIndex?: number;
}

export interface PublicTimelineEvent {
  readonly eventId: string;
  readonly eventType: string;
  readonly label: string;
  readonly actorDisplayName: string;
  readonly message: string;
  readonly occurredAt: string;
}

export const SUPPLEMENT_REASON_CODES = [
  "MISSING_INFORMATION",
  "UNREADABLE_IMAGE",
  "INCONSISTENT_INFORMATION",
  "WRONG_DOCUMENT",
  "OTHER",
] as const;

export type SupplementReasonCode = (typeof SUPPLEMENT_REASON_CODES)[number];

export interface SupplementItem {
  readonly itemId: string;
  readonly requestId: string;
  readonly itemType: "FIELD" | "FILE";
  readonly targetEntityType:
    "SUBMISSION" | "CERTIFICATE" | "OWNER" | "PARCEL" | "LAND_USE" | "ASSET";
  readonly targetEntityId: string;
  readonly fieldPath: string;
  readonly documentType: PublicDocumentType | "";
  readonly reasonCode: SupplementReasonCode;
  readonly instruction: string;
  readonly status: "OPEN" | "RESOLVED";
}

export interface SupplementRequest {
  readonly requestId: string;
  readonly status: "OPEN" | "RESOLVED" | "SUPERSEDED";
  readonly reasonCode: SupplementReasonCode;
  readonly message: string;
  readonly requestedByDisplayName: string;
  readonly createdAt: string;
  readonly resolvedAt: string;
  readonly items: readonly SupplementItem[];
}

export interface CompletionChecklistItem {
  readonly code: string;
  readonly label: string;
  readonly complete: boolean;
  readonly missing: string;
}

export function completionChecklist(
  draft: IntakeDraft | null,
  files: readonly PublicFileSummary[],
): CompletionChecklistItem[] {
  if (!draft) {
    return [
      {
        code: "DRAFT",
        label: "Thông tin kê khai",
        complete: false,
        missing: "Chưa có dữ liệu kê khai",
      },
    ];
  }
  const identityOwners = draft.owners.filter(
    (owner) => requiresCitizenId(owner.ownerType) && !owner.hasDistinctCurrentUser,
  );
  const hasCertificate = files.some(
    (file) => file.status === "UPLOADED" && file.documentType === "CERTIFICATE",
  );
  return [
    ...identityOwners.map((owner) => {
      const missingSides = (["CITIZEN_ID_FRONT", "CITIZEN_ID_BACK"] as const).filter(
        (documentType) =>
          !files.some(
            (file) =>
              file.status === "UPLOADED" &&
              file.ownerId === owner.id &&
              file.documentType === documentType,
          ),
      );
      return {
        code: `IDENTITY:${owner.id}`,
        label: `CCCD của ${owner.fullName || "người kê khai"}`,
        complete: missingSides.length === 0,
        missing: `Thiếu ${missingSides
          .map((side) => (side === "CITIZEN_ID_FRONT" ? "mặt trước" : "mặt sau"))
          .join(" và ")}`,
      };
    }),
    {
      code: "CERTIFICATE",
      label: "Giấy chứng nhận",
      complete: hasCertificate,
      missing: "Thiếu ảnh Giấy chứng nhận",
    },
    {
      code: "CONTACT",
      label: "Thông tin liên hệ",
      complete: /^0\d{9}$/.test(draft.phone),
      missing: "Thiếu số điện thoại hợp lệ",
    },
  ];
}

export function normalizeCitizenId(value: string): string {
  return value.replace(/\D/g, "");
}

/**
 * Khóa tra cứu GCN đã có là **HMAC của riêng CCCD**.
 *
 * Từng có phương án băm kèm họ tên + ngày sinh để chống dò, nhưng soi kho thật cho thấy 87% ngày
 * sinh chỉ ghi mỗi năm (`1989`) và họ tên đa nguồn hay lệch dấu — đưa hai trường này vào khóa làm
 * **trượt phần lớn** hồ sơ có thật. Chống dò chuyển sang bắt buộc quét QR (đang cầm thẻ thật), xem
 * `hasCompleteExistingRecordLookupIdentity`. Xem `docs/brain/03-decisions.md` [2026-07-23].
 */
export function identityHmac(pepper: string, citizenId: string): string {
  return createHmac("sha256", pepper).update(normalizeCitizenId(citizenId)).digest("hex");
}

/**
 * Điều kiện để mở ô tra cứu GCN đã có. **Bắt buộc `QR_CONFIRMED`** — người dân phải quét mã QR trên
 * thẻ căn cước (đang cầm thẻ thật), không cho gõ tay số CCCD rồi dò. Đây là lớp chống dò duy nhất
 * sau khi khóa khớp rút về mỗi CCCD.
 */
export function hasCompleteExistingRecordLookupIdentity(input: {
  identityNumber: string;
  fullName: string;
  identityStatus: string;
}): boolean {
  return (
    /^\d{12}$/.test(input.identityNumber) &&
    Boolean(input.fullName.trim()) &&
    input.identityStatus === "QR_CONFIRMED"
  );
}

export function maskCertificateNumber(value: string): string {
  const compact = value.trim();
  if (compact.length <= 4) return `••••${compact}`;
  return `${"•".repeat(Math.min(8, compact.length - 4))}${compact.slice(-4)}`;
}

/**
 * Tên người thực hiện ghi vào dòng thời gian mà **người dân đọc được**.
 *
 * `display_name` là ô nhập tự do của quản trị viên và hay bị điền bằng chính email công vụ. Dòng
 * thời gian đi thẳng ra `/tra-cuu`, nên tên hình dạng email phải lùi về nhãn chung thay vì phát
 * tán một địa chỉ thư thật ra ngoài. Xem thêm `publicAssignedOfficer`.
 */
export function publicActorName(displayName: string): string {
  const name = displayName.trim();
  return name && !/\S+@\S+/.test(name) ? name : "Cán bộ phường";
}

function sanitizePublicTimelineText(value: string): string {
  return value.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[đã ẩn]").trim();
}

/** DTO allowlist cho timeline công khai; sanitize lại dữ liệu lịch sử trước khi trả ra ngoài. */
export function serializePublicTimelineEvent(input: PublicTimelineEvent): PublicTimelineEvent {
  return {
    eventId: input.eventId,
    eventType: input.eventType,
    label: sanitizePublicTimelineText(input.label),
    actorDisplayName: publicActorName(input.actorDisplayName),
    message: sanitizePublicTimelineText(input.message),
    occurredAt: input.occurredAt,
  };
}

export function newTimelineEvent(input: {
  eventType: string;
  label: string;
  actorDisplayName?: string;
  message?: string;
  occurredAt?: string;
}): PublicTimelineEvent {
  return {
    eventId: randomUUID(),
    eventType: input.eventType,
    label: input.label,
    actorDisplayName: publicActorName(input.actorDisplayName ?? ""),
    message: input.message?.trim() ?? "",
    occurredAt: input.occurredAt ?? new Date().toISOString(),
  };
}

function flattenDraft(draft: IntakeDraft): Map<string, string> {
  const values = new Map<string, string>();
  values.set("submission.phone", draft.phone);
  for (const [key, value] of Object.entries(draft.certificate)) {
    values.set(`certificate.${key}`, String(value ?? ""));
  }
  for (const owner of draft.owners) {
    for (const [key, value] of Object.entries(owner)) {
      values.set(`owners.${owner.id}.${key}`, String(value ?? ""));
    }
  }
  for (const parcel of draft.parcels) {
    for (const [key, value] of Object.entries(parcel)) {
      if (key !== "landUses") values.set(`parcels.${parcel.id}.${key}`, String(value ?? ""));
    }
    for (const landUse of parcel.landUses) {
      for (const [key, value] of Object.entries(landUse)) {
        values.set(`landUses.${landUse.id}.${key}`, String(value ?? ""));
      }
    }
  }
  for (const asset of draft.assets) {
    for (const [key, value] of Object.entries(asset)) {
      values.set(`assets.${asset.id}.${key}`, String(value ?? ""));
    }
  }
  return values;
}

export function unauthorizedSupplementChanges(
  previous: IntakeDraft,
  next: IntakeDraft,
  items: readonly SupplementItem[],
): string[] {
  const before = flattenDraft(previous);
  const after = flattenDraft(next);
  const allowed = items
    .filter((item) => item.itemType === "FIELD")
    .map((item) => item.fieldPath)
    .filter(Boolean);
  const changed = new Set<string>();
  for (const path of new Set([...before.keys(), ...after.keys()])) {
    if (before.get(path) !== after.get(path)) changed.add(path);
  }
  return [...changed].filter(
    (path) => !allowed.some((prefix) => path === prefix || path.startsWith(`${prefix}.`)),
  );
}
