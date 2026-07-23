import { createHash } from "node:crypto";

import { NextResponse } from "next/server";

import { loadPublicIntakeEnvironment } from "@/modules/common/env";
import { isValidPublicIdempotencyKey } from "@/modules/public-intake/creation-idempotency";
import {
  getPublicIntakeRepository,
  SubmissionIdempotencyConflictError,
  SubmissionVersionConflictError,
} from "@/modules/public-intake/repository";
import {
  isEditable,
  publicError,
  resolvePublicRequest,
} from "@/modules/public-intake/route-context";
import {
  TURNSTILE_HEADER,
  turnstileHostname,
  verifyTurnstileToken,
} from "@/modules/public-intake/turnstile";
import { requiresCitizenId, type IntakeDraft } from "@/modules/public-intake/types";
import { validateDraftForSubmit } from "@/modules/public-intake/validation";
import { identityHmac, newTimelineEvent } from "@/modules/public-intake/workflow";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  const context = await resolvePublicRequest(request, { requireCsrf: true });
  if (context instanceof NextResponse) return context;

  const { record, requestId } = context;
  const rawIdempotencyKey = request.headers.get("idempotency-key");
  if (!isValidPublicIdempotencyKey(rawIdempotencyKey)) {
    return publicError("VALIDATION_FAILED", "Thiếu hoặc sai khóa chống gửi trùng.", requestId);
  }

  const environment = loadPublicIntakeEnvironment();
  let body: { draft?: unknown };
  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).length > environment.MAX_DRAFT_JSON_BYTES) {
      return publicError(
        "VALIDATION_FAILED",
        `Kích thước dữ liệu vượt quá giới hạn (${environment.MAX_DRAFT_JSON_BYTES} bytes).`,
        requestId,
      );
    }
    body = JSON.parse(text) as { draft?: unknown };
  } catch {
    return publicError("VALIDATION_FAILED", "Nội dung yêu cầu không hợp lệ.", requestId);
  }

  const draft = (body.draft ?? record.draft) as IntakeDraft | null;
  if (!draft) return publicError("VALIDATION_FAILED", "Chưa có dữ liệu kê khai.", requestId);

  const status: "SUBMITTED" | "RESUBMITTED" =
    record.status === "NEEDS_SUPPLEMENT" || record.status === "RESUBMITTED"
      ? "RESUBMITTED"
      : "SUBMITTED";
  const idempotencyKey = `PUBLIC_SUBMIT:${record.submissionId}:${rawIdempotencyKey.toLowerCase()}`;
  const mutationHash = createHash("sha256")
    .update(JSON.stringify({ submissionId: record.submissionId, status, draft }))
    .digest("hex");
  const repository = getPublicIntakeRepository();

  // Nếu lần gửi trước đã commit nhưng response bị mất, trả lại đúng kết quả mà không yêu cầu Turnstile mới.
  const replay = await repository.findStoredMutation(idempotencyKey, "PUBLIC_SUBMIT");
  if (replay) {
    if (replay.mutationHash !== mutationHash) {
      return publicError(
        "IDEMPOTENCY_CONFLICT",
        "Khóa chống gửi trùng đã được dùng cho nội dung khác.",
        requestId,
      );
    }
    const replayStatus = replay.response.status;
    return NextResponse.json({
      receiptCode: record.receiptCode,
      status: replayStatus === "RESUBMITTED" ? "RESUBMITTED" : "SUBMITTED",
    });
  }

  if (!isEditable(record)) {
    return publicError("INVALID_STATE", "Bản kê khai này đã được gửi.", requestId);
  }

  const turnstile = await verifyTurnstileToken({
    token: request.headers.get(TURNSTILE_HEADER),
    action: "submit",
    secretKey: environment.TURNSTILE_SECRET_KEY,
    expectedHostname: turnstileHostname(environment.APP_BASE_URL),
  });
  if (!turnstile.ok) {
    return publicError(
      "ACCESS_DENIED",
      "Chưa xác minh được thao tác này do người thật thực hiện. Tải lại trang và gửi lại.",
      requestId,
    );
  }

  const draftError = validateDraftForSubmit(draft);
  if (draftError) return publicError("VALIDATION_FAILED", draftError, requestId);

  const files = await repository.listFiles(record.submissionId);
  const identityOwners = draft.owners.filter(
    (owner) => requiresCitizenId(owner.ownerType) && !owner.hasDistinctCurrentUser,
  );
  const hasEveryCitizenIdPair = identityOwners.every((owner) =>
    ["CITIZEN_ID_FRONT", "CITIZEN_ID_BACK"].every((documentType) =>
      files.some((file) => file.ownerId === owner.id && file.documentType === documentType),
    ),
  );
  const certificateCount = files.filter((file) => file.documentType === "CERTIFICATE").length;
  if (!hasEveryCitizenIdPair || certificateCount < 1) {
    return publicError(
      "UPLOAD_INCOMPLETE",
      "Cần đủ ảnh CCCD mặt trước/mặt sau cho từng cá nhân và ít nhất một ảnh Giấy chứng nhận.",
      requestId,
    );
  }

  const pendingIdentityHmacs =
    status === "SUBMITTED"
      ? identityOwners.map((owner) =>
          identityHmac(environment.DATA_HASH_PEPPER, owner.identityNumber),
        )
      : undefined;

  try {
    await repository.submit({
      record,
      draft,
      status,
      timelineEvent: newTimelineEvent({
        eventType: status,
        label: status === "RESUBMITTED" ? "Đã gửi bổ sung" : "Đã gửi hồ sơ",
        actorDisplayName: "Người nộp",
      }),
      actorEmail: "PUBLIC",
      requestId,
      idempotencyKey,
      mutationHash,
      pendingIdentityHmacs,
    });
  } catch (error) {
    if (error instanceof SubmissionIdempotencyConflictError) {
      return publicError(
        "IDEMPOTENCY_CONFLICT",
        "Khóa chống gửi trùng đã được dùng cho nội dung khác.",
        requestId,
      );
    }
    if (error instanceof SubmissionVersionConflictError) {
      return publicError(
        "VERSION_CONFLICT",
        "Bản kê khai đã thay đổi ở một phiên khác. Vui lòng tải lại trước khi gửi.",
        requestId,
      );
    }
    throw error;
  }

  return NextResponse.json({ receiptCode: record.receiptCode, status });
}
