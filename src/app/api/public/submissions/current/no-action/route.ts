import { createHash, randomUUID } from "node:crypto";

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
  publicPrivateJson,
  resolvePublicRequest,
} from "@/modules/public-intake/route-context";
import {
  hasCompleteExistingRecordLookupIdentity,
  identityHmac,
  newTimelineEvent,
} from "@/modules/public-intake/workflow";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  const requestId = request.headers.get("x-request-id") ?? randomUUID();
  const rawIdempotencyKey = request.headers.get("idempotency-key");
  if (!isValidPublicIdempotencyKey(rawIdempotencyKey)) {
    return publicError("VALIDATION_FAILED", "Thiếu khóa chống gửi trùng.", requestId);
  }

  const context = await resolvePublicRequest(request, { requireCsrf: true });
  if (context instanceof NextResponse) return context;
  if (!isEditable(context.record)) {
    return publicError("INVALID_STATE", "Bản kê khai đã được gửi.", context.requestId);
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

  const existingRecordIds = matches.map((match) => match.existingRecordId);
  const idempotencyKey = `PUBLIC_NO_ACTION:${context.record.submissionId}:${rawIdempotencyKey}`;
  const mutationHash = createHash("sha256")
    .update(
      JSON.stringify({
        submissionId: context.record.submissionId,
        ownerId: owner.id,
        existingRecordIds,
      }),
    )
    .digest("hex");

  try {
    const result = await repository.commitNoAction({
      record: context.record,
      expectedVersion: context.record.version,
      ownerId: owner.id,
      existingRecordIds,
      matchesCount: matches.length,
      timelineEvent: newTimelineEvent({
        eventType: "NO_ACTION_REQUIRED",
        label: "Đã có hồ sơ, không cần nộp lại",
        actorDisplayName: "Hệ thống",
      }),
      requestId: context.requestId,
      idempotencyKey,
      mutationHash,
    });
    return publicPrivateJson(result);
  } catch (error) {
    if (error instanceof SubmissionVersionConflictError) {
      return publicError("VERSION_CONFLICT", "Bản kê khai đã bị thay đổi.", context.requestId);
    }
    if (error instanceof SubmissionIdempotencyConflictError) {
      return publicError("IDEMPOTENCY_CONFLICT", "Yêu cầu bị xung đột.", context.requestId);
    }
    throw error;
  }
}
