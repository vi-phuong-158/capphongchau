import { requiresCitizenId, type IntakeDraft, type Owner } from "@/modules/public-intake/types";

const IDENTITY_FIELDS: ReadonlyArray<
  keyof Pick<Owner, "fullName" | "identityNumber" | "dateOfBirth" | "gender">
> = ["fullName", "identityNumber", "dateOfBirth", "gender"];

export type WorkingIdentityTransitionResult =
  | { readonly ok: true; readonly draft: IntakeDraft }
  | { readonly ok: false; readonly message: string };

function identityFieldsChanged(before: Owner, after: Owner): boolean {
  return IDENTITY_FIELDS.some((field) => before[field] !== after[field]);
}

function statusWasForged(before: Owner, after: Owner): boolean {
  return (
    before.identityStatus !== after.identityStatus ||
    before.identityConfirmedAt !== after.identityConfirmedAt ||
    before.identitySource !== after.identitySource
  );
}

/**
 * `working-payload` là API tổng quát nên client không được tự gán trạng thái xác nhận. Mọi chuyển
 * trạng thái do server suy ra từ payload hiệu lực trước đó; `MANUAL_COMPLETE` chỉ do endpoint xác
 * nhận riêng tạo ra sau khi cán bộ cam kết đã đối chiếu CCCD.
 */
export function normalizeWorkingIdentityTransitions(
  baseline: IntakeDraft,
  candidate: IntakeDraft,
): WorkingIdentityTransitionResult {
  const draft = structuredClone(candidate);
  const baselineById = new Map(baseline.owners.map((owner) => [owner.id, owner]));

  for (const owner of draft.owners) {
    const before = baselineById.get(owner.id);
    if (!before) {
      if (owner.identityStatus || owner.identityConfirmedAt || owner.identitySource) {
        return {
          ok: false,
          message: "Chủ sử dụng mới chưa thể tự gán trạng thái xác nhận định danh.",
        };
      }
      continue;
    }

    if (!requiresCitizenId(before.ownerType) || before.hasDistinctCurrentUser) continue;
    if (statusWasForged(before, owner)) {
      return {
        ok: false,
        message:
          "Trạng thái xác nhận định danh chỉ được thay đổi bởi thao tác xác nhận của cán bộ.",
      };
    }

    if (before.identityStatus === "QR_CONFIRMED" && identityFieldsChanged(before, owner)) {
      if (owner.identityOverrideReason.trim().length < 5) {
        return {
          ok: false,
          message: "Cần nêu lý do khi sửa thông tin định danh đã đọc từ QR.",
        };
      }
      owner.identitySource = "MANUAL";
      owner.identityStatus = "QR_OVERRIDE_PENDING_REVIEW";
      continue;
    }

    if (before.identityStatus === "MANUAL_COMPLETE" && identityFieldsChanged(before, owner)) {
      owner.identityStatus = "PENDING_CONFIRMATION";
      owner.identityConfirmedAt = "";
      owner.identitySource = "MANUAL";
    }
  }

  return { ok: true, draft };
}
