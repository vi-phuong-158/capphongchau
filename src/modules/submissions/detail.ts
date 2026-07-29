import { randomUUID } from "node:crypto";

import { effectivePayload, payloadLayerOf } from "@/modules/public-intake/payload-layers";
import { getPublicIntakeRepository } from "@/modules/public-intake/repository";

import type { StaffSubmissionDetail } from "./detail-types";

export async function loadStaffSubmissionDetail(input: {
  readonly submissionId: string;
  readonly actorEmail: string;
  readonly canResetAccessSecret: boolean;
  readonly auditDetailView: boolean;
  readonly requestId?: string;
}): Promise<StaffSubmissionDetail | null> {
  const repository = getPublicIntakeRepository();
  const [record, files] = await Promise.all([
    repository.findById(input.submissionId),
    repository.listFiles(input.submissionId),
  ]);
  if (!record) return null;

  if (input.auditDetailView) {
    await repository.appendAudit({
      actorEmail: input.actorEmail,
      action: "SUBMISSION_SENSITIVE_DETAIL_VIEWED",
      entityId: record.submissionId,
      requestId: input.requestId ?? randomUUID(),
    });
  }

  return {
    submissionId: record.submissionId,
    receiptCode: record.receiptCode,
    status: record.status,
    phone: record.phone,
    version: record.version,
    claimedBy: record.claimedBy || null,
    claimedByDisplayName: record.claimedByDisplayName || null,
    intakeChannel: record.intakeChannel,
    assistedByDisplayName: record.assistedByDisplayName || null,
    claimedAt: record.claimedAt || null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    officialCaseId: record.officialCaseId || null,
    acceptStep: record.acceptStep || null,
    draft: effectivePayload(record),
    payloadLayer: payloadLayerOf(record),
    citizenPayload: record.citizenPayload ?? null,
    workingPayload: record.workingPayload ?? null,
    officialPayload: record.officialPayload ?? null,
    files: files.map((file) => ({
      fileId: file.fileId,
      documentType: file.documentType,
      ownerId: file.ownerId,
    })),
    canResetAccessSecret: input.canResetAccessSecret,
  };
}
