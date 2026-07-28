import { createHash, randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { AuthorizationError, requireActiveUser } from "@/modules/auth/authorization";
import { getUserRepository } from "@/modules/users/supabase-user-repository";
import { verifyCsrfToken } from "@/modules/auth/csrf";
import { createApiErrorPayload } from "@/modules/common/api-error";
import { UserRole } from "@/modules/common/domain";
import { loadServerEnvironment } from "@/modules/common/env";
import {
  getPublicIntakeRepository,
  SubmissionAlreadyClaimedError,
  SubmissionVersionConflictError,
} from "@/modules/public-intake/repository";
import {
  newTimelineEvent,
  publicActorName,
  SUPPLEMENT_REASON_CODES,
  type SupplementRequest,
} from "@/modules/public-intake/workflow";
import {
  isClaimedBy,
  mayClaim,
  mayForceClaim,
  mayReject,
  mayRelease,
  mayRequestSupplement,
  mayTransfer,
  SUBMISSION_DECISION_ROLES,
  SUBMISSION_READ_ROLES,
} from "@/modules/submissions/review";

export const runtime = "nodejs";

const schema = z.object({
  action: z.enum(["CLAIM", "FORCE_CLAIM", "RELEASE", "TRANSFER", "REQUEST_SUPPLEMENT", "REJECT"]),
  version: z.number().int().positive(),
  reason: z.string().trim().min(5).max(500).optional(),
  toEmail: z.string().trim().email().optional(),
  reasonCode: z.enum(SUPPLEMENT_REASON_CODES).optional(),
  message: z.string().trim().max(1000).optional(),
  items: z
    .array(
      z.object({
        itemType: z.enum(["FIELD", "FILE"]),
        targetEntityType: z.enum([
          "SUBMISSION",
          "CERTIFICATE",
          "OWNER",
          "PARCEL",
          "LAND_USE",
          "ASSET",
        ]),
        targetEntityId: z.string().trim().max(100).default(""),
        fieldPath: z.string().trim().max(200).default(""),
        documentType: z
          .enum(["CITIZEN_ID_FRONT", "CITIZEN_ID_BACK", "CERTIFICATE"])
          .or(z.literal("")),
        instruction: z.string().trim().min(1).max(500),
      }),
    )
    .max(30)
    .optional(),
});

function fail(
  code:
    | "ACCESS_DENIED"
    | "UNAUTHENTICATED"
    | "VALIDATION_FAILED"
    | "NOT_FOUND"
    | "VERSION_CONFLICT"
    | "IDEMPOTENCY_CONFLICT"
    | "ALREADY_CLAIMED"
    | "INTERNAL_ERROR",
  message: string,
  requestId: string,
  status: number,
) {
  return NextResponse.json(createApiErrorPayload({ code, message, requestId }), {
    status,
    headers: { "cache-control": "no-store" },
  });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ submissionId: string }> },
): Promise<NextResponse> {
  const requestId = request.headers.get("x-request-id") ?? randomUUID();
  try {
    const body = schema.safeParse(await request.json());
    const idempotencyKey = request.headers.get("idempotency-key");
    if (!body.success || !idempotencyKey || idempotencyKey.length > 256) {
      return fail(
        "VALIDATION_FAILED",
        "Thao tác hoặc idempotency key không hợp lệ.",
        requestId,
        400,
      );
    }

    const action = body.data.action;
    const roles =
      action === "CLAIM" ||
      action === "FORCE_CLAIM" ||
      action === "RELEASE" ||
      action === "TRANSFER"
        ? SUBMISSION_READ_ROLES
        : SUBMISSION_DECISION_ROLES;
    const user = await requireActiveUser(roles);
    const environment = loadServerEnvironment();
    if (
      !verifyCsrfToken(environment.AUTH_SECRET, user.email, request.headers.get("x-csrf-token"))
    ) {
      return fail("ACCESS_DENIED", "Yêu cầu bảo mật không hợp lệ hoặc đã hết hạn.", requestId, 403);
    }
    const { submissionId } = await context.params;
    const repository = getPublicIntakeRepository();
    const scopedIdempotencyKey = `STAFF_ACTION:${submissionId}:${idempotencyKey}`;
    const mutationHash = createHash("sha256")
      .update(
        JSON.stringify({
          submissionId,
          actorEmail: user.email,
          action,
          version: body.data.version,
          reason: body.data.reason ?? "",
          toEmail: body.data.toEmail ?? "",
          reasonCode: body.data.reasonCode ?? "",
          message: body.data.message ?? "",
          items: body.data.items ?? [],
        }),
      )
      .digest("hex");

    const replay = await repository.findStoredMutation(scopedIdempotencyKey, "STAFF_ACTION");
    if (replay) {
      if (replay.mutationHash !== mutationHash) {
        return fail(
          "IDEMPOTENCY_CONFLICT",
          "Khóa chống gửi trùng đã dùng cho thao tác khác.",
          requestId,
          409,
        );
      }
      const status = replay.response.status;
      const version = replay.response.version;
      if (typeof status !== "string" || typeof version !== "number") {
        return fail(
          "INTERNAL_ERROR",
          "Không thể khôi phục kết quả thao tác trước.",
          requestId,
          500,
        );
      }
      return NextResponse.json(
        {
          submission: {
            status,
            version,
            claimedBy:
              typeof replay.response.claimedBy === "string" ? replay.response.claimedBy : "",
            claimedByDisplayName:
              typeof replay.response.claimedByDisplayName === "string"
                ? replay.response.claimedByDisplayName
                : "",
          },
          requestId,
        },
        { headers: { "cache-control": "no-store" } },
      );
    }

    const record = await repository.findById(submissionId);
    if (!record) return fail("NOT_FOUND", "Không tìm thấy bản kê khai.", requestId, 404);
    if (record.version !== body.data.version) {
      return fail("VERSION_CONFLICT", "Hồ sơ đã thay đổi. Hãy tải lại trang.", requestId, 409);
    }

    // 1. CLAIM
    if (action === "CLAIM") {
      if (!mayClaim(record.status)) {
        return fail(
          "VALIDATION_FAILED",
          "Hồ sơ không ở trạng thái có thể nhận xử lý.",
          requestId,
          400,
        );
      }
      if (record.claimedBy && !isClaimedBy(record, user.email)) {
        return fail("ACCESS_DENIED", "Hồ sơ đang do cán bộ khác nhận xử lý.", requestId, 403);
      }
      const updated = await repository.commitStaffAction({
        record,
        expectedVersion: body.data.version,
        status: "UNDER_REVIEW",
        claimedBy: user.email,
        claimedByDisplayName: user.displayName,
        claimedAt: new Date().toISOString(),
        force: false,
        actorEmail: user.email,
        auditAction: "SUBMISSION_CLAIMED",
        auditMetadata: { forced: false },
        timelineEvent: newTimelineEvent({
          eventType: "UNDER_REVIEW",
          label: "Đang kiểm tra",
          actorDisplayName: user.displayName,
        }),
        requestId,
        idempotencyKey: scopedIdempotencyKey,
        mutationHash,
      });
      return NextResponse.json(
        {
          submission: {
            status: updated.status,
            version: updated.version,
            claimedBy: updated.claimedBy,
            claimedByDisplayName: updated.claimedByDisplayName,
          },
          requestId,
        },
        { headers: { "cache-control": "no-store" } },
      );
    }

    // 2. FORCE_CLAIM
    if (action === "FORCE_CLAIM") {
      if (!mayForceClaim(user.roles)) {
        return fail(
          "ACCESS_DENIED",
          "Chỉ quản trị viên mới có quyền mở khóa cưỡng chế.",
          requestId,
          403,
        );
      }
      if (!body.data.reason) {
        return fail("VALIDATION_FAILED", "Bắt buộc nhập lý do mở khóa cưỡng chế.", requestId, 400);
      }
      const updated = await repository.commitStaffAction({
        record,
        expectedVersion: body.data.version,
        status: "UNDER_REVIEW",
        claimedBy: user.email,
        claimedByDisplayName: user.displayName,
        claimedAt: new Date().toISOString(),
        force: true,
        actorEmail: user.email,
        auditAction: "SUBMISSION_FORCE_CLAIMED",
        auditMetadata: { previousAssignee: record.claimedBy, reason: body.data.reason },
        timelineEvent: newTimelineEvent({
          eventType: "FORCE_CLAIMED",
          label: "Mở khóa cưỡng chế",
          actorDisplayName: user.displayName,
        }),
        requestId,
        idempotencyKey: scopedIdempotencyKey,
        mutationHash,
      });
      return NextResponse.json(
        {
          submission: {
            status: updated.status,
            version: updated.version,
            claimedBy: updated.claimedBy,
            claimedByDisplayName: updated.claimedByDisplayName,
          },
          requestId,
        },
        { headers: { "cache-control": "no-store" } },
      );
    }

    // 3. RELEASE
    if (action === "RELEASE") {
      if (!mayRelease(record, user.email, user.roles)) {
        return fail(
          "ACCESS_DENIED",
          "Bạn không có quyền trả lại hồ sơ này vào hàng chờ.",
          requestId,
          403,
        );
      }
      if (!body.data.reason) {
        return fail("VALIDATION_FAILED", "Bắt buộc nhập lý do trả lại hàng chờ.", requestId, 400);
      }
      const updated = await repository.commitStaffAction({
        record,
        expectedVersion: body.data.version,
        status: "SUBMITTED",
        claimedBy: "",
        claimedByDisplayName: "",
        claimedAt: "",
        force: true,
        actorEmail: user.email,
        auditAction: "SUBMISSION_CLAIM_RELEASED",
        auditMetadata: { reason: body.data.reason },
        timelineEvent: newTimelineEvent({
          eventType: "CLAIM_RELEASED",
          label: "Trả lại hàng chờ",
          actorDisplayName: user.displayName,
        }),
        requestId,
        idempotencyKey: scopedIdempotencyKey,
        mutationHash,
      });
      return NextResponse.json(
        {
          submission: {
            status: updated.status,
            version: updated.version,
            claimedBy: "",
            claimedByDisplayName: "",
          },
          requestId,
        },
        { headers: { "cache-control": "no-store" } },
      );
    }

    // 4. TRANSFER
    if (action === "TRANSFER") {
      if (!mayTransfer(record, user.email, user.roles)) {
        return fail("ACCESS_DENIED", "Bạn không có quyền chuyển giao hồ sơ này.", requestId, 403);
      }
      if (!body.data.toEmail || !body.data.reason) {
        return fail(
          "VALIDATION_FAILED",
          "Bắt buộc chọn người nhận và nhập lý do chuyển giao.",
          requestId,
          400,
        );
      }
      // Tên người nhận lấy từ danh bạ trên máy chủ. Client chỉ được gửi email; nhận tên từ
      // client là để bất kỳ ai cũng gán được một cái tên tùy ý vào dòng thời gian hồ sơ.
      const recipient = await getUserRepository().findActiveByEmail(body.data.toEmail);
      if (!recipient) {
        return fail(
          "VALIDATION_FAILED",
          "Người nhận không phải tài khoản đang hoạt động.",
          requestId,
          400,
        );
      }

      const updated = await repository.commitStaffAction({
        record,
        expectedVersion: body.data.version,
        status: "UNDER_REVIEW",
        claimedBy: body.data.toEmail,
        claimedByDisplayName: recipient.displayName,
        claimedAt: new Date().toISOString(),
        force: true,
        actorEmail: user.email,
        auditAction: "SUBMISSION_TRANSFERRED",
        auditMetadata: {
          fromEmail: record.claimedBy,
          toEmail: body.data.toEmail,
          reason: body.data.reason,
        },
        timelineEvent: newTimelineEvent({
          eventType: "TRANSFERRED",
          label: "Chuyển giao xử lý",
          actorDisplayName: user.displayName,
        }),
        requestId,
        idempotencyKey: scopedIdempotencyKey,
        mutationHash,
      });
      return NextResponse.json(
        {
          submission: {
            status: updated.status,
            version: updated.version,
            claimedBy: updated.claimedBy,
            claimedByDisplayName: updated.claimedByDisplayName,
          },
          requestId,
        },
        { headers: { "cache-control": "no-store" } },
      );
    }

    // 5. REQUEST_SUPPLEMENT & REJECT
    if (
      !isClaimedBy(record, user.email) &&
      !user.roles.includes(UserRole.WARD_ADMIN) &&
      !user.roles.includes(UserRole.SYSTEM_ADMIN)
    ) {
      return fail("ACCESS_DENIED", "Bạn cần nhận xử lý hồ sơ trước khi thao tác.", requestId, 403);
    }
    const allowed =
      action === "REQUEST_SUPPLEMENT"
        ? mayRequestSupplement(record, user.email) || mayForceClaim(user.roles)
        : mayReject(record, user.email) || mayForceClaim(user.roles);
    if (!allowed)
      return fail("VALIDATION_FAILED", "Hồ sơ không ở trạng thái có thể xử lý.", requestId, 400);

    if (
      action === "REQUEST_SUPPLEMENT" &&
      (!body.data.reasonCode || !body.data.message || !body.data.items?.length)
    ) {
      return fail(
        "VALIDATION_FAILED",
        "Cần nêu lý do, hướng dẫn và ít nhất một trường hoặc tài liệu phải bổ sung.",
        requestId,
        400,
      );
    }

    const status = action === "REQUEST_SUPPLEMENT" ? "NEEDS_SUPPLEMENT" : "REJECTED";
    let supplementRequest: SupplementRequest | undefined;
    if (action === "REQUEST_SUPPLEMENT") {
      const supplementRequestId = randomUUID();
      const createdAt = new Date().toISOString();
      supplementRequest = {
        requestId: supplementRequestId,
        status: "OPEN",
        reasonCode: body.data.reasonCode!,
        message: body.data.message!,
        requestedByDisplayName: publicActorName(user.displayName),
        createdAt,
        resolvedAt: "",
        items: body.data.items!.map((item) => ({
          itemId: randomUUID(),
          requestId: supplementRequestId,
          itemType: item.itemType,
          targetEntityType: item.targetEntityType,
          targetEntityId: item.targetEntityId,
          fieldPath: item.fieldPath,
          documentType: item.documentType,
          reasonCode: body.data.reasonCode!,
          instruction: item.instruction,
          status: "OPEN",
        })),
      };
    }
    const updated = await repository.commitStaffAction({
      record,
      expectedVersion: body.data.version,
      status,
      supplementRequest,
      actorEmail: user.email,
      auditAction:
        action === "REQUEST_SUPPLEMENT" ? "SUBMISSION_NEEDS_SUPPLEMENT" : "SUBMISSION_REJECTED",
      timelineEvent: newTimelineEvent({
        eventType: status,
        label: status === "NEEDS_SUPPLEMENT" ? "Cần bổ sung" : "Không tiếp nhận",
        actorDisplayName: user.displayName,
        message: body.data.message,
      }),
      requestId,
      idempotencyKey: scopedIdempotencyKey,
      mutationHash,
    });
    return NextResponse.json(
      { submission: { status: updated.status, version: updated.version }, requestId },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof AuthorizationError)
      return fail(
        error.kind,
        error.message,
        requestId,
        error.kind === "UNAUTHENTICATED" ? 401 : 403,
      );
    if (error instanceof SubmissionAlreadyClaimedError)
      return fail("ALREADY_CLAIMED", error.message, requestId, 409);
    if (error instanceof SubmissionVersionConflictError)
      return fail("VERSION_CONFLICT", error.message, requestId, 409);
    return fail("INTERNAL_ERROR", "Không thể cập nhật hồ sơ.", requestId, 500);
  }
}
