import { createHash, randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { AuthorizationError, requireActiveUser } from "@/modules/auth/authorization";
import { verifyCsrfToken } from "@/modules/auth/csrf";
import { createApiErrorPayload } from "@/modules/common/api-error";
import { UserRole } from "@/modules/common/domain";
import { loadServerEnvironment } from "@/modules/common/env";
import { CERTIFICATE_ROLE_CODES } from "@/modules/public-intake/reference";
import {
  getPublicIntakeRepository,
  SubmissionIdempotencyConflictError,
  SubmissionVersionConflictError,
} from "@/modules/public-intake/repository";
import type { IntakeDraft } from "@/modules/public-intake/types";
import { isOrganisationOwner } from "@/modules/public-intake/types";
import {
  CITIZEN_ID_PATTERN,
  isValidDate,
  ORGANISATION_ID_PATTERN,
} from "@/modules/public-intake/validation";
import { newTimelineEvent } from "@/modules/public-intake/workflow";
import {
  isOwnerIdentityLocked,
  mayStaffEdit,
  SUBMISSION_DECISION_ROLES,
  SUBMISSION_READ_ROLES,
} from "@/modules/submissions/review";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fail(
  code:
    | "ACCESS_DENIED"
    | "UNAUTHENTICATED"
    | "VALIDATION_FAILED"
    | "NOT_FOUND"
    | "VERSION_CONFLICT"
    | "IDEMPOTENCY_CONFLICT"
    | "INTERNAL_ERROR",
  message: string,
  requestId: string,
  status: number,
): NextResponse {
  return NextResponse.json(createApiErrorPayload({ code, message, requestId }), {
    status,
    headers: { "cache-control": "no-store" },
  });
}

/** Số 12 chữ số bị khóa khi đã xác thực QR — chỉ giữ 4 số cuối trong audit, không ghi CCCD đầy đủ. */
function maskIdentityNumber(value: string): string {
  const trimmed = value.trim();
  return trimmed.length >= 4 ? `••••${trimmed.slice(-4)}` : "••••";
}

const ownerPatchSchema = z.object({
  id: z.string().trim().min(1),
  fullName: z.string().trim().max(200).optional(),
  identityNumber: z.string().trim().max(20).optional(),
  dateOfBirth: z.string().trim().max(10).optional(),
  gender: z.enum(["NAM", "NU", ""]).optional(),
  residenceAddress: z.string().trim().max(500).optional(),
  roleOnCertificate: z.string().trim().max(50).optional(),
});

const patchSchema = z.object({
  version: z.number().int().positive(),
  certificate: z
    .object({
      issueNumber: z.string().trim().max(100).optional(),
      issueDate: z.string().trim().max(10).optional(),
      registryNumber: z.string().trim().max(100).optional(),
    })
    .optional(),
  owners: z.array(ownerPatchSchema).max(10).optional(),
});

export async function GET(
  _: NextRequest,
  context: { params: Promise<{ submissionId: string }> },
): Promise<NextResponse> {
  const requestId = randomUUID();
  try {
    const user = await requireActiveUser(SUBMISSION_READ_ROLES);
    const { submissionId } = await context.params;
    const record = await getPublicIntakeRepository().findById(submissionId);
    if (!record) {
      return NextResponse.json(
        createApiErrorPayload({
          code: "NOT_FOUND",
          message: "Không tìm thấy bản kê khai.",
          requestId,
        }),
        { status: 404 },
      );
    }
    await getPublicIntakeRepository().appendAudit({
      actorEmail: user.email,
      action: "SUBMISSION_SENSITIVE_DETAIL_VIEWED",
      entityId: record.submissionId,
      requestId,
    });
    const files = await getPublicIntakeRepository().listFiles(record.submissionId);
    return NextResponse.json(
      {
        submission: {
          submissionId: record.submissionId,
          receiptCode: record.receiptCode,
          status: record.status,
          phone: record.phone,
          version: record.version,
          claimedBy: record.claimedBy || null,
          claimedAt: record.claimedAt || null,
          createdAt: record.createdAt,
          updatedAt: record.updatedAt,
          officialCaseId: record.officialCaseId || null,
          acceptStep: record.acceptStep || null,
          draft: record.draft,
          files: files.map((file) => ({
            fileId: file.fileId,
            documentType: file.documentType,
          })),
          canResetAccessSecret:
            user.roles.includes(UserRole.SYSTEM_ADMIN) || user.roles.includes(UserRole.WARD_ADMIN),
        },
        requestId,
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    const code = error instanceof AuthorizationError ? error.kind : "INTERNAL_ERROR";
    const message =
      error instanceof AuthorizationError ? error.message : "Không thể tải bản kê khai.";
    return NextResponse.json(createApiErrorPayload({ code, message, requestId }), {
      status: code === "UNAUTHENTICATED" ? 401 : code === "ACCESS_DENIED" ? 403 : 500,
    });
  }
}

/**
 * Cán bộ sửa lỗi gõ nhỏ (số phát hành/ngày cấp GCN, họ tên/địa chỉ) thay vì bắt người dân nộp lại.
 * Đảo quyết định [2026-07-21] "không sửa draft_json gốc" — xem `03-decisions.md` [2026-07-24].
 * Trường định danh của chủ đã `QR_CONFIRMED` (đọc từ chip CCCD) bị khóa cứng, không nhận sửa.
 */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ submissionId: string }> },
): Promise<NextResponse> {
  const requestId = request.headers.get("x-request-id") ?? randomUUID();
  try {
    const body = patchSchema.safeParse(await request.json());
    const idempotencyKey = request.headers.get("idempotency-key");
    if (!body.success || !idempotencyKey || idempotencyKey.length > 256) {
      return fail(
        "VALIDATION_FAILED",
        "Dữ liệu chỉnh sửa hoặc idempotency key không hợp lệ.",
        requestId,
        400,
      );
    }
    const user = await requireActiveUser(SUBMISSION_DECISION_ROLES);
    const environment = loadServerEnvironment();
    if (
      !verifyCsrfToken(environment.AUTH_SECRET, user.email, request.headers.get("x-csrf-token"))
    ) {
      return fail("ACCESS_DENIED", "Yêu cầu bảo mật không hợp lệ hoặc đã hết hạn.", requestId, 403);
    }
    const { submissionId } = await context.params;
    const repository = getPublicIntakeRepository();

    const scopedIdempotencyKey = `STAFF_DRAFT_EDIT:${submissionId}:${idempotencyKey}`;
    const mutationHash = createHash("sha256")
      .update(
        JSON.stringify({
          submissionId,
          actorEmail: user.email,
          version: body.data.version,
          certificate: body.data.certificate ?? null,
          owners: body.data.owners ?? [],
        }),
      )
      .digest("hex");
    const replay = await repository.findStoredMutation(scopedIdempotencyKey, "STAFF_DRAFT_EDIT");
    if (replay) {
      if (replay.mutationHash !== mutationHash) {
        return fail(
          "IDEMPOTENCY_CONFLICT",
          "Khóa chống gửi trùng đã dùng cho thao tác khác.",
          requestId,
          409,
        );
      }
      const version = replay.response.version;
      if (typeof version !== "number") {
        return fail(
          "INTERNAL_ERROR",
          "Không thể khôi phục kết quả thao tác trước.",
          requestId,
          500,
        );
      }
      return NextResponse.json(
        { submission: { version }, requestId },
        { headers: { "cache-control": "no-store" } },
      );
    }

    const record = await repository.findById(submissionId);
    if (!record) return fail("NOT_FOUND", "Không tìm thấy bản kê khai.", requestId, 404);
    if (record.version !== body.data.version) {
      return fail("VERSION_CONFLICT", "Hồ sơ đã thay đổi. Hãy tải lại trang.", requestId, 409);
    }
    if (!record.draft) {
      return fail("VALIDATION_FAILED", "Hồ sơ chưa có dữ liệu kê khai để sửa.", requestId, 400);
    }
    const isAdministrator =
      user.roles.includes(UserRole.WARD_ADMIN) || user.roles.includes(UserRole.SYSTEM_ADMIN);
    if (!mayStaffEdit(record, user.email) && !isAdministrator) {
      return fail(
        "VALIDATION_FAILED",
        "Hồ sơ phải đang được bạn nhận xử lý và ở trạng thái đang xử lý mới sửa được.",
        requestId,
        400,
      );
    }

    const draft: IntakeDraft = structuredClone(record.draft);
    const changes: Record<string, string> = {};

    if (body.data.certificate) {
      const patch = body.data.certificate;
      if (
        patch.issueDate !== undefined &&
        patch.issueDate !== "" &&
        !isValidDate(patch.issueDate)
      ) {
        return fail("VALIDATION_FAILED", "Ngày cấp Giấy chứng nhận không hợp lệ.", requestId, 400);
      }
      if (patch.issueNumber !== undefined && patch.issueNumber !== draft.certificate.issueNumber) {
        changes["certificate.issueNumber"] =
          `${draft.certificate.issueNumber || "-"} → ${patch.issueNumber || "-"}`;
        draft.certificate.issueNumber = patch.issueNumber;
      }
      if (patch.issueDate !== undefined && patch.issueDate !== draft.certificate.issueDate) {
        changes["certificate.issueDate"] =
          `${draft.certificate.issueDate || "-"} → ${patch.issueDate || "-"}`;
        draft.certificate.issueDate = patch.issueDate;
      }
      if (
        patch.registryNumber !== undefined &&
        patch.registryNumber !== draft.certificate.registryNumber
      ) {
        changes["certificate.registryNumber"] =
          `${draft.certificate.registryNumber || "-"} → ${patch.registryNumber || "-"}`;
        draft.certificate.registryNumber = patch.registryNumber;
      }
    }

    for (const ownerPatch of body.data.owners ?? []) {
      const owner = draft.owners.find((candidate) => candidate.id === ownerPatch.id);
      if (!owner) {
        return fail("VALIDATION_FAILED", "Không tìm thấy chủ sử dụng cần sửa.", requestId, 400);
      }
      const identityFieldsTouched =
        ownerPatch.fullName !== undefined ||
        ownerPatch.identityNumber !== undefined ||
        ownerPatch.dateOfBirth !== undefined ||
        ownerPatch.gender !== undefined ||
        ownerPatch.residenceAddress !== undefined;
      if (identityFieldsTouched && isOwnerIdentityLocked(owner.identityStatus)) {
        return fail(
          "VALIDATION_FAILED",
          "Thông tin định danh đã xác thực bằng QR CCCD, không thể sửa.",
          requestId,
          400,
        );
      }

      if (ownerPatch.identityNumber !== undefined) {
        const trimmed = ownerPatch.identityNumber.trim();
        const organisation = isOrganisationOwner(owner.ownerType);
        const allowEmpty = owner.hasDistinctCurrentUser && trimmed === "";
        const validFormat =
          allowEmpty ||
          (organisation ? ORGANISATION_ID_PATTERN.test(trimmed) : CITIZEN_ID_PATTERN.test(trimmed));
        if (!validFormat) {
          return fail(
            "VALIDATION_FAILED",
            organisation
              ? "Mã số thuế của tổ chức không hợp lệ."
              : "Số định danh cá nhân phải gồm đúng 12 chữ số.",
            requestId,
            400,
          );
        }
      }
      if (
        ownerPatch.dateOfBirth !== undefined &&
        ownerPatch.dateOfBirth !== "" &&
        !isValidDate(ownerPatch.dateOfBirth)
      ) {
        return fail("VALIDATION_FAILED", "Ngày sinh không hợp lệ.", requestId, 400);
      }
      if (
        ownerPatch.roleOnCertificate !== undefined &&
        !CERTIFICATE_ROLE_CODES.includes(ownerPatch.roleOnCertificate)
      ) {
        return fail(
          "VALIDATION_FAILED",
          "Vai trò trên Giấy chứng nhận không thuộc danh mục cho phép.",
          requestId,
          400,
        );
      }

      if (ownerPatch.fullName !== undefined && ownerPatch.fullName !== owner.fullName) {
        changes[`owners.${ownerPatch.id}.fullName`] =
          `${owner.fullName || "-"} → ${ownerPatch.fullName || "-"}`;
        owner.fullName = ownerPatch.fullName;
      }
      if (
        ownerPatch.identityNumber !== undefined &&
        ownerPatch.identityNumber !== owner.identityNumber
      ) {
        changes[`owners.${ownerPatch.id}.identityNumber`] =
          `${maskIdentityNumber(owner.identityNumber)} → ${maskIdentityNumber(ownerPatch.identityNumber)}`;
        owner.identityNumber = ownerPatch.identityNumber;
      }
      if (ownerPatch.dateOfBirth !== undefined && ownerPatch.dateOfBirth !== owner.dateOfBirth) {
        changes[`owners.${ownerPatch.id}.dateOfBirth`] =
          `${owner.dateOfBirth || "-"} → ${ownerPatch.dateOfBirth || "-"}`;
        owner.dateOfBirth = ownerPatch.dateOfBirth;
      }
      if (ownerPatch.gender !== undefined && ownerPatch.gender !== owner.gender) {
        changes[`owners.${ownerPatch.id}.gender`] = `${owner.gender || "-"} → ${ownerPatch.gender || "-"}`;
        owner.gender = ownerPatch.gender;
      }
      if (
        ownerPatch.residenceAddress !== undefined &&
        ownerPatch.residenceAddress !== owner.residenceAddress
      ) {
        changes[`owners.${ownerPatch.id}.residenceAddress`] =
          `${owner.residenceAddress || "-"} → ${ownerPatch.residenceAddress || "-"}`;
        owner.residenceAddress = ownerPatch.residenceAddress;
      }
      if (
        ownerPatch.roleOnCertificate !== undefined &&
        ownerPatch.roleOnCertificate !== owner.roleOnCertificate
      ) {
        changes[`owners.${ownerPatch.id}.roleOnCertificate`] =
          `${owner.roleOnCertificate || "-"} → ${ownerPatch.roleOnCertificate || "-"}`;
        owner.roleOnCertificate = ownerPatch.roleOnCertificate;
      }
    }

    if (Object.keys(changes).length === 0) {
      return fail("VALIDATION_FAILED", "Không có thay đổi nào để lưu.", requestId, 400);
    }

    const updated = await repository.commitStaffDraftEdit({
      record,
      expectedVersion: body.data.version,
      draft,
      actorEmail: user.email,
      auditMetadata: changes,
      timelineEvent: newTimelineEvent({
        eventType: "STAFF_EDITED",
        label: "Cán bộ cập nhật thông tin hồ sơ",
        actorDisplayName: user.displayName,
      }),
      requestId,
      idempotencyKey: scopedIdempotencyKey,
      mutationHash,
    });

    return NextResponse.json(
      { submission: { version: updated.version }, requestId },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return fail(
        error.kind,
        error.message,
        requestId,
        error.kind === "UNAUTHENTICATED" ? 401 : 403,
      );
    }
    if (error instanceof SubmissionVersionConflictError) {
      return fail("VERSION_CONFLICT", error.message, requestId, 409);
    }
    if (error instanceof SubmissionIdempotencyConflictError) {
      return fail("IDEMPOTENCY_CONFLICT", error.message, requestId, 409);
    }
    return fail("INTERNAL_ERROR", "Không thể cập nhật hồ sơ.", requestId, 500);
  }
}
