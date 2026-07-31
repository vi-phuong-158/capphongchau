import { createHash, randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { AuthorizationError, requireActiveUser } from "@/modules/auth/authorization";
import { verifyCsrfToken } from "@/modules/auth/csrf";
import { loadPublicIntakeEnvironment, loadServerEnvironment } from "@/modules/common/env";
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
import type { IntakeDraft } from "@/modules/public-intake/types";
import {
  citizenIdsForLookup,
  validateCitizenRequiredFiles,
  validateCitizenSubmitDraft,
} from "@/modules/public-intake/validation";
import { identityHmac, newTimelineEvent, publicActorName } from "@/modules/public-intake/workflow";
import { ASSISTED_INTAKE_ROLES } from "@/modules/submissions/review";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  const requestId = request.headers.get("x-request-id") ?? randomUUID();
  try {
    const user = await requireActiveUser(ASSISTED_INTAKE_ROLES);
    const environment = loadPublicIntakeEnvironment();
    if (!environment.OFFICER_ASSISTED_INTAKE_ENABLED) {
      return publicError(
        "SERVICE_UNAVAILABLE",
        "Chế độ cán bộ hỗ trợ kê khai hiện chưa được bật.",
        requestId,
      );
    }
    const serverEnvironment = loadServerEnvironment();
    if (
      !verifyCsrfToken(
        serverEnvironment.AUTH_SECRET,
        user.email,
        request.headers.get("x-csrf-token"),
      )
    ) {
      return publicError(
        "ACCESS_DENIED",
        "Yêu cầu bảo mật không hợp lệ hoặc đã hết hạn.",
        requestId,
      );
    }

    const context = await resolvePublicRequest(request, { requireCsrf: false });
    if (context instanceof NextResponse) return context;
    const { record } = context;
    if (record.intakeChannel !== "OFFICER_ASSISTED") {
      return publicError("ACCESS_DENIED", "Hồ sơ không thuộc luồng cán bộ hỗ trợ.", requestId);
    }

    const rawIdempotencyKey = request.headers.get("idempotency-key");
    if (!isValidPublicIdempotencyKey(rawIdempotencyKey)) {
      return publicError("VALIDATION_FAILED", "Thiếu hoặc sai khóa chống gửi trùng.", requestId);
    }

    let body: { draft?: unknown };
    try {
      const text = await request.text();
      if (new TextEncoder().encode(text).length > environment.MAX_DRAFT_JSON_BYTES) {
        return publicError("VALIDATION_FAILED", "Kích thước dữ liệu vượt quá giới hạn.", requestId);
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
    const idempotencyKey = `ASSISTED_SUBMIT:${record.submissionId}:${rawIdempotencyKey.toLowerCase()}`;
    const mutationHash = createHash("sha256")
      .update(JSON.stringify({ submissionId: record.submissionId, status, draft }))
      .digest("hex");
    const repository = getPublicIntakeRepository();

    const replay = await repository.findStoredMutation(idempotencyKey, "PUBLIC_SUBMIT");
    if (replay) {
      if (replay.mutationHash !== mutationHash) {
        return publicError("IDEMPOTENCY_CONFLICT", "Khóa chống gửi trùng đã dùng.", requestId);
      }
      return NextResponse.json({ receiptCode: record.receiptCode, status });
    }
    if (!isEditable(record)) {
      return publicError("INVALID_STATE", "Bản kê khai này đã được gửi.", requestId);
    }

    const issues = validateCitizenSubmitDraft(draft);
    if (issues.length > 0) {
      return publicError(
        "VALIDATION_FAILED",
        "Bản kê khai còn thiếu thông tin bắt buộc.",
        requestId,
        {
          issues: issues.map(({ code, fieldPath, message }) => ({ code, fieldPath, message })),
        },
      );
    }
    const files = await repository.listFiles(record.submissionId);
    const fileIssues = validateCitizenRequiredFiles(draft, files);
    if (fileIssues.length > 0) {
      return publicError("UPLOAD_INCOMPLETE", "Cần tải đủ ảnh bắt buộc.", requestId, {
        issues: fileIssues.map(({ code, fieldPath, message }) => ({ code, fieldPath, message })),
      });
    }

    await repository.submit({
      record,
      draft,
      status,
      timelineEvent: newTimelineEvent({
        eventType: status,
        label: status === "RESUBMITTED" ? "Đã gửi bổ sung" : "Đã gửi hồ sơ",
        actorDisplayName: publicActorName(user.displayName),
      }),
      actorEmail: user.email,
      requestId,
      idempotencyKey,
      mutationHash,
      // Ghi cho cả `RESUBMITTED`, xem lý do đầy đủ ở route submit công khai (quyết định
      // 2026-07-29): ở MỨC A, CCCD hay xuất hiện lần đầu đúng vào lần gửi bổ sung.
      pendingIdentityHmacs: citizenIdsForLookup(draft).map((value) =>
        identityHmac(environment.DATA_HASH_PEPPER, value),
      ),
    });
    return NextResponse.json({ receiptCode: record.receiptCode, status });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return publicError(
        error.kind === "UNAUTHENTICATED" ? "UNAUTHENTICATED" : "ACCESS_DENIED",
        "Tài khoản không có quyền kê khai hộ người dân.",
        requestId,
      );
    }
    if (error instanceof SubmissionIdempotencyConflictError) {
      return publicError("IDEMPOTENCY_CONFLICT", "Khóa chống gửi trùng đã dùng.", requestId);
    }
    if (error instanceof SubmissionVersionConflictError) {
      return publicError("VERSION_CONFLICT", "Bản kê khai đã thay đổi.", requestId);
    }
    throw error;
  }
}
