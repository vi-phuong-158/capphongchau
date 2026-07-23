import { NextResponse } from "next/server";

import { loadPublicIntakeEnvironment } from "@/modules/common/env";
import { isValidPublicIdempotencyKey } from "@/modules/public-intake/creation-idempotency";
import { getPublicIntakeRepository } from "@/modules/public-intake/repository";
import {
  isEditable,
  publicError,
  resolvePublicRequest,
} from "@/modules/public-intake/route-context";
import {
  hasCompleteExistingRecordLookupIdentity,
  identityHmac,
  newTimelineEvent,
} from "@/modules/public-intake/workflow";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  const context = await resolvePublicRequest(request, { requireCsrf: true });
  if (context instanceof NextResponse) return context;
  if (!isEditable(context.record)) {
    return publicError("INVALID_STATE", "Bản kê khai đã được gửi.", context.requestId);
  }
  if (!isValidPublicIdempotencyKey(request.headers.get("idempotency-key"))) {
    return publicError("VALIDATION_FAILED", "Thiếu khóa chống gửi trùng.", context.requestId);
  }
  let body: { ownerId?: unknown; confirmAllAlreadySubmitted?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return publicError("VALIDATION_FAILED", "Nội dung yêu cầu không hợp lệ.", context.requestId);
  }
  if (body.confirmAllAlreadySubmitted !== true) {
    return publicError(
      "VALIDATION_FAILED",
      "Cần xác nhận không còn Giấy chứng nhận mới phải nộp.",
      context.requestId,
    );
  }
  const ownerId = typeof body.ownerId === "string" ? body.ownerId : "";
  const owner = context.record.draft?.owners.find((candidate) => candidate.id === ownerId);
  if (!owner || !hasCompleteExistingRecordLookupIdentity(owner)) {
    return publicError("VALIDATION_FAILED", "Thông tin định danh chưa đầy đủ.", context.requestId);
  }
  const repository = getPublicIntakeRepository();
  const environment = loadPublicIntakeEnvironment();
  const matches = await repository.findExistingCertificates(
    identityHmac(environment.DATA_HASH_PEPPER, owner.identityNumber),
  );
  if (!matches.length) {
    return publicError(
      "INVALID_STATE",
      "Không tìm thấy hồ sơ đã xác minh để kết thúc theo diện không cần nộp lại.",
      context.requestId,
    );
  }

  await repository.linkExistingCertificates({
    submissionId: context.record.submissionId,
    ownerId: owner.id,
    existingRecordIds: matches.map((match) => match.existingRecordId),
    outcome: "MATCHED_VERIFIED",
  });

  const updated = await repository.transition({
    record: context.record,
    expectedVersion: context.record.version,
    status: "NO_ACTION_REQUIRED",
  });
  await Promise.all([
    repository.appendTimelineEvent(
      updated.submissionId,
      newTimelineEvent({
        eventType: "NO_ACTION_REQUIRED",
        label: "Đã có hồ sơ, không cần nộp lại",
        actorDisplayName: "Hệ thống",
      }),
      "SYSTEM",
      context.requestId,
    ),
    repository.appendAudit({
      actorEmail: "PUBLIC",
      action: "PUBLIC_SUBMISSION_NO_ACTION_REQUIRED",
      entityId: updated.submissionId,
      requestId: context.requestId,
      metadata: { matchCount: matches.length },
    }),
  ]);
  return NextResponse.json({ receiptCode: updated.receiptCode, status: updated.status });
}
