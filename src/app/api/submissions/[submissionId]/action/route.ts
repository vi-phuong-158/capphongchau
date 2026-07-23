import { randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { AuthorizationError, requireActiveUser } from "@/modules/auth/authorization";
import { verifyCsrfToken } from "@/modules/auth/csrf";
import { createApiErrorPayload } from "@/modules/common/api-error";
import { UserRole } from "@/modules/common/domain";
import { loadServerEnvironment } from "@/modules/common/env";
import {
  getPublicIntakeRepository,
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
  mayReject,
  mayRequestSupplement,
  SUBMISSION_DECISION_ROLES,
  SUBMISSION_READ_ROLES,
} from "@/modules/submissions/review";

export const runtime = "nodejs";

const schema = z.object({
  action: z.enum(["CLAIM", "REQUEST_SUPPLEMENT", "REJECT"]),
  version: z.number().int().positive(),
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
    const roles = body.data.action === "CLAIM" ? SUBMISSION_READ_ROLES : SUBMISSION_DECISION_ROLES;
    const user = await requireActiveUser(roles);
    const environment = loadServerEnvironment();
    if (
      !verifyCsrfToken(environment.AUTH_SECRET, user.email, request.headers.get("x-csrf-token"))
    ) {
      return fail("ACCESS_DENIED", "Yêu cầu bảo mật không hợp lệ hoặc đã hết hạn.", requestId, 403);
    }
    const { submissionId } = await context.params;
    const repository = getPublicIntakeRepository();
    const record = await repository.findById(submissionId);
    if (!record) return fail("NOT_FOUND", "Không tìm thấy bản kê khai.", requestId, 404);
    if (record.version !== body.data.version) {
      return fail("VERSION_CONFLICT", "Hồ sơ đã thay đổi. Hãy tải lại trang.", requestId, 409);
    }

    if (body.data.action === "CLAIM") {
      if (!mayClaim(record.status))
        return fail(
          "VALIDATION_FAILED",
          "Hồ sơ không ở trạng thái có thể nhận xử lý.",
          requestId,
          400,
        );
      const force =
        user.roles.includes(UserRole.WARD_ADMIN) || user.roles.includes(UserRole.SYSTEM_ADMIN);
      if (record.claimedBy && !isClaimedBy(record, user.email) && !force) {
        return fail("ACCESS_DENIED", "Hồ sơ đang do cán bộ khác xử lý.", requestId, 403);
      }
      const updated = await repository.transition({
        record,
        expectedVersion: body.data.version,
        status: "UNDER_REVIEW",
        claimedBy: user.email,
        claimedAt: new Date().toISOString(),
      });
      await repository.appendAudit({
        actorEmail: user.email,
        action: "SUBMISSION_CLAIMED",
        entityId: record.submissionId,
        requestId,
        metadata: { forced: force },
      });
      await repository.appendTimelineEvent(
        record.submissionId,
        newTimelineEvent({
          eventType: "UNDER_REVIEW",
          label: "Đang kiểm tra",
          actorDisplayName: user.displayName,
        }),
        user.email,
        requestId,
      );
      return NextResponse.json(
        {
          submission: {
            status: updated.status,
            version: updated.version,
            claimedBy: updated.claimedBy,
          },
          requestId,
        },
        { headers: { "cache-control": "no-store" } },
      );
    }

    if (
      !isClaimedBy(record, user.email) &&
      !user.roles.includes(UserRole.WARD_ADMIN) &&
      !user.roles.includes(UserRole.SYSTEM_ADMIN)
    ) {
      return fail("ACCESS_DENIED", "Bạn cần nhận xử lý hồ sơ trước khi thao tác.", requestId, 403);
    }
    const allowed =
      body.data.action === "REQUEST_SUPPLEMENT"
        ? mayRequestSupplement(record, user.email) ||
          user.roles.includes(UserRole.WARD_ADMIN) ||
          user.roles.includes(UserRole.SYSTEM_ADMIN)
        : mayReject(record, user.email) ||
          user.roles.includes(UserRole.WARD_ADMIN) ||
          user.roles.includes(UserRole.SYSTEM_ADMIN);
    if (!allowed)
      return fail("VALIDATION_FAILED", "Hồ sơ không ở trạng thái có thể xử lý.", requestId, 400);
    if (
      body.data.action === "REQUEST_SUPPLEMENT" &&
      (!body.data.reasonCode || !body.data.message || !body.data.items?.length)
    ) {
      return fail(
        "VALIDATION_FAILED",
        "Cần nêu lý do, hướng dẫn và ít nhất một trường hoặc tài liệu phải bổ sung.",
        requestId,
        400,
      );
    }
    const status = body.data.action === "REQUEST_SUPPLEMENT" ? "NEEDS_SUPPLEMENT" : "REJECTED";
    const updated = await repository.transition({
      record,
      expectedVersion: body.data.version,
      status,
    });
    await repository.appendAudit({
      actorEmail: user.email,
      action:
        body.data.action === "REQUEST_SUPPLEMENT"
          ? "SUBMISSION_NEEDS_SUPPLEMENT"
          : "SUBMISSION_REJECTED",
      entityId: record.submissionId,
      requestId,
    });
    if (body.data.action === "REQUEST_SUPPLEMENT") {
      const supplementRequestId = randomUUID();
      const createdAt = new Date().toISOString();
      const supplementRequest: SupplementRequest = {
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
      await repository.createSupplementRequest({
        submissionId: record.submissionId,
        request: supplementRequest,
        actorEmail: user.email,
      });
    }
    await repository.appendTimelineEvent(
      record.submissionId,
      newTimelineEvent({
        eventType: status,
        label: status === "NEEDS_SUPPLEMENT" ? "Cần bổ sung" : "Không tiếp nhận",
        actorDisplayName: user.displayName,
        message: body.data.message,
      }),
      user.email,
      requestId,
    );
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
    if (error instanceof SubmissionVersionConflictError)
      return fail("VERSION_CONFLICT", error.message, requestId, 409);
    return fail("INTERNAL_ERROR", "Không thể cập nhật hồ sơ.", requestId, 500);
  }
}
