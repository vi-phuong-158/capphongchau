/**
 * Tạo bản kê khai — dùng chung cho cổng công khai và chế độ cán bộ hỗ trợ.
 *
 * Tách khỏi route để hai đường vào **không** có hai bản logic idempotency riêng. Chỉ khác nhau ở
 * hai thứ, và cả hai đều do máy chủ quyết định:
 *
 *   - cổng công khai đòi Turnstile, chế độ cán bộ đòi phiên đăng nhập;
 *   - `channel` và `actor` do route gán, **không bao giờ lấy từ body request**.
 */

import { randomUUID } from "node:crypto";

import { loadPublicIntakeEnvironment } from "@/modules/common/env";

import {
  deriveAccessSecret,
  deriveCreationFingerprint,
  deriveReceiptCode,
  deriveSubmissionId,
} from "./creation-idempotency";
import { getPublicIntakeRepository, type AssistingOfficer, type IntakeChannel } from "./repository";
import { hashAccessSecret } from "./session";
import { getPublicIntakeStorage } from "./storage";
import { emptyDraft } from "./types";

export interface CreationResult {
  readonly submissionId: string;
  readonly receiptCode: string;
  readonly accessSecret: string;
  readonly recovered: boolean;
}

export class CreationConflictError extends Error {
  constructor() {
    super("Idempotency key đã được dùng với số điện thoại khác.");
    this.name = "CreationConflictError";
  }
}

/** Token Turnstile đã dùng nhưng không có bản nháp cũ để trả lại — không được tạo bản mới. */
export class StaleChallengeError extends Error {
  constructor() {
    super("Mã xác minh đã được sử dụng.");
    this.name = "StaleChallengeError";
  }
}

export interface CreateIntakeSubmissionInput {
  readonly rawIdempotencyKey: string;
  readonly idempotencyKey: string;
  readonly mutationHash: string;
  readonly phone: string;
  readonly requestId: string;
  readonly sessionSecret: string;
  readonly accessPepper: string;
  readonly replayOnly: boolean;
  /** Route chỉ truyền literal này sau khi đã validate `consent.accepted === true`. */
  readonly consentAccepted: true;
  readonly consentVersion: string;
  /** Do route gán. `OFFICER_ASSISTED` chỉ đến từ route đã xác thực nhân viên. */
  readonly channel: IntakeChannel;
  readonly assistedBy?: AssistingOfficer;
}

export function creationFingerprint(
  accessPepper: string,
  phone: string,
  consentVersion: string,
): string {
  return deriveCreationFingerprint(accessPepper, phone, consentVersion);
}

export async function createIntakeSubmission(
  input: CreateIntakeSubmissionInput,
): Promise<CreationResult> {
  const repository = getPublicIntakeRepository();
  const accessSecret = deriveAccessSecret(input.accessPepper, input.rawIdempotencyKey);
  const previous = await repository.findCreationByIdempotencyKey(input.idempotencyKey);

  if (previous) {
    if (previous.mutationHash !== input.mutationHash) {
      throw new CreationConflictError();
    }
    return {
      submissionId: previous.submissionId,
      receiptCode: previous.receiptCode,
      accessSecret,
      recovered: true,
    };
  }

  if (input.replayOnly) {
    throw new StaleChallengeError();
  }

  const submissionId = deriveSubmissionId(input.sessionSecret, input.rawIdempotencyKey);
  const receiptCode = deriveReceiptCode(input.sessionSecret, input.rawIdempotencyKey);
  const lazyDriveFolderCreation = loadPublicIntakeEnvironment().LAZY_DRIVE_FOLDER_CREATION_ENABLED;
  const driveFolderId = lazyDriveFolderCreation
    ? null
    : await getPublicIntakeStorage().createSubmissionFolder(submissionId);
  const draft = emptyDraft(randomUUID(), randomUUID(), randomUUID());
  draft.phone = input.phone;
  draft.consentAccepted = input.consentAccepted;

  await repository.create({
    submissionId,
    receiptCode,
    accessCodeHash: hashAccessSecret(input.accessPepper, accessSecret),
    idempotencyKey: input.idempotencyKey,
    mutationHash: input.mutationHash,
    requestId: input.requestId,
    phone: input.phone,
    driveFolderId,
    draft,
    consentVersion: input.consentVersion,
    intakeChannel: input.channel,
    assistedBy: input.assistedBy,
  });

  return { submissionId, receiptCode, accessSecret, recovered: false };
}
