import { NextResponse } from "next/server";

import { loadPublicIntakeEnvironment } from "@/modules/common/env";
import { isValidPublicIdempotencyKey } from "@/modules/public-intake/creation-idempotency";
import { getPublicIntakeRepository } from "@/modules/public-intake/repository";
import { publicError, resolvePublicRequest } from "@/modules/public-intake/route-context";
import {
  hasCompleteExistingRecordLookupIdentity,
  identityHmac,
} from "@/modules/public-intake/workflow";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  const context = await resolvePublicRequest(request, { requireCsrf: true });
  if (context instanceof NextResponse) return context;
  if (!isValidPublicIdempotencyKey(request.headers.get("idempotency-key"))) {
    return publicError("VALIDATION_FAILED", "Thiếu khóa chống gửi trùng.", context.requestId);
  }
  let body: { ownerId?: unknown; existingRecordIds?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return publicError("VALIDATION_FAILED", "Nội dung yêu cầu không hợp lệ.", context.requestId);
  }
  const ownerId = typeof body.ownerId === "string" ? body.ownerId : "";
  const requestedIds = Array.isArray(body.existingRecordIds)
    ? body.existingRecordIds.filter((value): value is string => typeof value === "string")
    : [];
  const owner = context.record.draft?.owners.find((candidate) => candidate.id === ownerId);
  if (!owner || !hasCompleteExistingRecordLookupIdentity(owner) || !requestedIds.length) {
    return publicError("VALIDATION_FAILED", "Liên kết GCN không hợp lệ.", context.requestId);
  }
  const repository = getPublicIntakeRepository();
  const environment = loadPublicIntakeEnvironment();
  const matches = await repository.findExistingCertificates(
    identityHmac(environment.DATA_HASH_PEPPER, owner.identityNumber),
  );
  const allowedIds = new Set(matches.map((match) => match.existingRecordId));
  if (requestedIds.some((recordId) => !allowedIds.has(recordId))) {
    return publicError("ACCESS_DENIED", "GCN không thuộc kết quả đã xác minh.", context.requestId);
  }
  await Promise.all([
    repository.linkExistingCertificates({
      submissionId: context.record.submissionId,
      ownerId,
      existingRecordIds: [...new Set(requestedIds)],
      outcome: "MATCHED_VERIFIED",
    }),
    repository.appendAudit({
      actorEmail: "PUBLIC",
      action: "PUBLIC_EXISTING_RECORDS_LINKED",
      entityId: context.record.submissionId,
      requestId: context.requestId,
      metadata: { ownerId, count: new Set(requestedIds).size },
    }),
  ]);
  return NextResponse.json({ linked: true, count: new Set(requestedIds).size });
}
