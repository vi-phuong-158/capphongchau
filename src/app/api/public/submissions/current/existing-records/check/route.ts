import { NextResponse } from "next/server";

import { loadPublicIntakeEnvironment } from "@/modules/common/env";
import { isValidPublicIdempotencyKey } from "@/modules/public-intake/creation-idempotency";
import { getPublicIntakeRepository } from "@/modules/public-intake/repository";
import { publicError, resolvePublicRequest } from "@/modules/public-intake/route-context";
import {
  hasCompleteExistingRecordLookupIdentity,
  identityHmac,
  maskCertificateNumber,
} from "@/modules/public-intake/workflow";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  const context = await resolvePublicRequest(request, { requireCsrf: true });
  if (context instanceof NextResponse) return context;
  if (!isValidPublicIdempotencyKey(request.headers.get("idempotency-key"))) {
    return publicError("VALIDATION_FAILED", "Thiếu khóa chống gửi trùng.", context.requestId);
  }
  let body: { ownerId?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return publicError("VALIDATION_FAILED", "Nội dung yêu cầu không hợp lệ.", context.requestId);
  }
  const ownerId = typeof body.ownerId === "string" ? body.ownerId : "";
  const owner = context.record.draft?.owners.find((candidate) => candidate.id === ownerId);
  if (!owner || !hasCompleteExistingRecordLookupIdentity(owner)) {
    return publicError(
      "VALIDATION_FAILED",
      "Cần xác nhận đủ số CCCD, họ tên và ngày sinh trước khi kiểm tra.",
      context.requestId,
    );
  }
  const repository = getPublicIntakeRepository();
  const environment = loadPublicIntakeEnvironment();
  const citizenHash = identityHmac(environment.DATA_HASH_PEPPER, owner.identityNumber);
  const matches = await repository.findExistingCertificates(citizenHash);
  const pendingWarning = await repository.hasPendingIdentityMatch(
    citizenHash,
    context.record.submissionId,
  );
  await repository.appendAudit({
    actorEmail: "PUBLIC",
    action: "PUBLIC_EXISTING_RECORDS_CHECKED",
    entityId: context.record.submissionId,
    requestId: context.requestId,
    metadata: { ownerId: owner.id, matchCount: matches.length },
  });

  return NextResponse.json({
    ownerId: owner.id,
    matched: matches.length > 0,
    pendingWarning,
    canFinishNoAction: matches.length > 0,
    certificates: matches.map((match) => ({
      existingRecordId: match.existingRecordId,
      issueNumberMasked: maskCertificateNumber(match.issueNumber),
      issueDate: match.issueDate,
    })),
  });
}
