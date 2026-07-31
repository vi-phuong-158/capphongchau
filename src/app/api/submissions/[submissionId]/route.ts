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
  citizenIdsForLookup,
  CITIZEN_ID_PATTERN,
  isValidDate,
  ORGANISATION_ID_PATTERN,
} from "@/modules/public-intake/validation";
import { identityHmac, newTimelineEvent, publicActorName } from "@/modules/public-intake/workflow";
import { effectivePayload } from "@/modules/public-intake/payload-layers";
import { manualIdentityConfirmationIssue } from "@/modules/submissions/manual-identity-confirmation";
import { loadStaffSubmissionDetail } from "@/modules/submissions/detail";
import {
  isOwnerIdentityQrConfirmed,
  mayAmendOfficialRecord,
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
  identityOverrideReason: z.string().trim().min(5).max(500).optional(),
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
  /** Xác nhận có đối chiếu CCCD; server tự gắn trạng thái và thời điểm, không tin client. */
  manualIdentityConfirmation: z
    .object({
      ownerIds: z.array(z.string().trim().min(1)).min(1).max(10),
    })
    .optional(),
  /**
   * Bắt buộc khi hồ sơ đã tiếp nhận chính thức. Đây là dấu vết đối soát duy nhất giải thích vì sao
   * dữ liệu chính thức đổi sau khi đã chốt — nên đòi câu có nghĩa, không nhận "sửa" hay "abc".
   */
  amendmentReason: z.string().trim().min(10).max(500).optional(),
});

export async function GET(
  _: NextRequest,
  context: { params: Promise<{ submissionId: string }> },
): Promise<NextResponse> {
  const requestId = randomUUID();
  const totalStartedAt = performance.now();
  try {
    const user = await requireActiveUser(SUBMISSION_READ_ROLES);
    const { submissionId } = await context.params;
    const databaseStartedAt = performance.now();
    const submission = await loadStaffSubmissionDetail({
      submissionId,
      actorEmail: user.email,
      canResetAccessSecret:
        user.roles.includes(UserRole.SYSTEM_ADMIN) || user.roles.includes(UserRole.WARD_ADMIN),
      auditDetailView: true,
      requestId,
    });
    const databaseMs = performance.now() - databaseStartedAt;
    if (!submission) {
      return NextResponse.json(
        createApiErrorPayload({
          code: "NOT_FOUND",
          message: "Không tìm thấy bản kê khai.",
          requestId,
        }),
        { status: 404 },
      );
    }
    return NextResponse.json(
      {
        submission,
        requestId,
      },
      {
        headers: {
          "cache-control": "no-store",
          "server-timing": `detail_db;dur=${databaseMs.toFixed(1)}, detail_total;dur=${(performance.now() - totalStartedAt).toFixed(1)}`,
        },
      },
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
 * Chỉ còn hai nhánh: xác nhận định danh thủ công (`manualIdentityConfirmation`) và điều chỉnh hồ
 * sơ ĐÃ tiếp nhận chính thức (`amendmentReason`, hồ sơ `ACCEPTED`). Trường định danh của chủ đã
 * `QR_CONFIRMED` (đọc từ chip CCCD) bị khóa cứng, không nhận sửa nếu thiếu lý do ghi đè.
 *
 * **[2026-07-29] Đóng nhánh `STAFF_DRAFT_EDIT`** (sửa GCN/chủ sử dụng khi `UNDER_REVIEW`, không
 * kèm `amendmentReason`). Nhánh đó ghi vào `draft_json`, còn `WorkingPayloadEditor` ghi vào
 * `working_payload_json` qua `PUT .../working-payload`; `effectivePayload()` luôn ưu tiên
 * `working_payload_json` nếu có, nên một lần lưu qua nhánh này từng bị **bàn làm việc che khuất
 * hoàn toàn** ở lần tải hồ sơ kế tiếp — cán bộ tưởng đã lưu nhưng dữ liệu hiển thị vẫn là bản cũ.
 * Sửa GCN/chủ sử dụng khi đang xử lý giờ đi duy nhất qua bàn làm việc.
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

    // Chế độ suy ra từ chính yêu cầu (có `amendmentReason` hay không) để không phải đọc hồ sơ trước
    // khi kiểm phát lại. Nếu chế độ suy ra không khớp trạng thái thật của hồ sơ thì yêu cầu bị từ
    // chối bên dưới, trước mọi thao tác ghi.
    const scopeKind = body.data.manualIdentityConfirmation
      ? "MANUAL_IDENTITY_CONFIRMATION"
      : body.data.amendmentReason
        ? "OFFICIAL_AMENDMENT"
        : "STAFF_DRAFT_EDIT";
    const scopedIdempotencyKey = `${scopeKind}:${submissionId}:${idempotencyKey}`;
    const mutationHash = createHash("sha256")
      .update(
        JSON.stringify({
          submissionId,
          actorEmail: user.email,
          version: body.data.version,
          certificate: body.data.certificate ?? null,
          owners: body.data.owners ?? [],
          manualIdentityConfirmationOwnerIds: [
            ...(body.data.manualIdentityConfirmation?.ownerIds ?? []),
          ].sort(),
          // Phải nằm trong hash: phát lại cùng khóa nhưng khác lý do là hai thao tác khác nhau.
          amendmentReason: body.data.amendmentReason ?? null,
        }),
      )
      .digest("hex");
    const replay = await repository.findStoredMutation(scopedIdempotencyKey, scopeKind);
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

    /**
     * Hai chế độ sửa, tách bạch có chủ đích:
     *
     *   - Sửa thường: hồ sơ `UNDER_REVIEW`, người đang giữ hồ sơ. Chỉ chạm bản kê khai.
     *   - **Điều chỉnh hồ sơ chính thức**: hồ sơ đã `ACCEPTED`. Bắt buộc kèm `amendmentReason`, và
     *     `commitOfficialAmendment` sẽ ghi lại cả dữ liệu chính thức trong cùng transaction.
     *
     * Trước 2026-07-25, nhánh `|| isAdministrator` cho quản trị viên sửa hồ sơ ở BẤT KỲ trạng thái
     * nào — kể cả `ACCEPTED` — mà không đồng bộ lại bảng chính thức và không cần lý do. Đó chính là
     * đường làm `draft_json` lệch khỏi dữ liệu chính thức vĩnh viễn. Nhánh đó đã bị gỡ; muốn sửa hồ
     * sơ đã tiếp nhận thì phải đi đường điều chỉnh.
     */
    const isAmendment = mayAmendOfficialRecord(record, user.email, isAdministrator);
    if (!isAmendment && !mayStaffEdit(record, user.email)) {
      return fail(
        "VALIDATION_FAILED",
        record.status === "ACCEPTED"
          ? "Hồ sơ đã tiếp nhận chính thức. Chỉ cán bộ đã nhận hồ sơ hoặc quản trị viên mới điều chỉnh được."
          : "Hồ sơ phải đang được bạn nhận xử lý và ở trạng thái đang xử lý mới sửa được.",
        requestId,
        400,
      );
    }
    if (isAmendment && !body.data.amendmentReason) {
      return fail(
        "VALIDATION_FAILED",
        "Điều chỉnh hồ sơ đã tiếp nhận chính thức phải kèm lý do (ít nhất 10 ký tự).",
        requestId,
        400,
      );
    }
    if (!isAmendment && body.data.amendmentReason) {
      return fail(
        "VALIDATION_FAILED",
        "Chỉ hồ sơ đã tiếp nhận chính thức mới cần lý do điều chỉnh.",
        requestId,
        400,
      );
    }

    if (body.data.manualIdentityConfirmation) {
      if (isAmendment || !mayStaffEdit(record, user.email)) {
        return fail(
          "ACCESS_DENIED",
          "Chỉ cán bộ đang nhận xử lý hồ sơ mới được xác nhận định danh thủ công.",
          requestId,
          403,
        );
      }
      if (body.data.certificate || body.data.owners || body.data.amendmentReason) {
        return fail(
          "VALIDATION_FAILED",
          "Xác nhận định danh phải thực hiện riêng, không kèm chỉnh sửa thông tin khác.",
          requestId,
          400,
        );
      }

      const ownerIds = body.data.manualIdentityConfirmation.ownerIds;
      if (new Set(ownerIds).size !== ownerIds.length) {
        return fail(
          "VALIDATION_FAILED",
          "Danh sách chủ sử dụng cần xác nhận có mục trùng lặp.",
          requestId,
          400,
        );
      }
      const payload = effectivePayload(record);
      if (!payload) {
        return fail(
          "VALIDATION_FAILED",
          "Hồ sơ chưa có dữ liệu kê khai để xác nhận định danh.",
          requestId,
          400,
        );
      }

      const workingDraft: IntakeDraft = structuredClone(payload);
      const confirmedAt = new Date().toISOString();
      for (const ownerId of ownerIds) {
        const owner = workingDraft.owners.find((candidate) => candidate.id === ownerId);
        if (!owner) {
          return fail(
            "VALIDATION_FAILED",
            "Không tìm thấy chủ sử dụng cần xác nhận định danh.",
            requestId,
            400,
          );
        }
        const issue = manualIdentityConfirmationIssue(owner);
        if (issue) return fail("VALIDATION_FAILED", issue.message, requestId, 400);

        owner.identitySource = "MANUAL";
        owner.identityStatus = "MANUAL_COMPLETE";
        owner.identityConfirmedAt = confirmedAt;
      }

      const pendingIdentityHmacs = citizenIdsForLookup(workingDraft).map((identityNumber) =>
        identityHmac(environment.DATA_HASH_PEPPER, identityNumber),
      );
      const updated = await repository.commitWorkingPayload({
        record,
        expectedVersion: body.data.version,
        draft: workingDraft,
        actorEmail: user.email,
        changeNote: "Cán bộ xác nhận đã đối chiếu CCCD.",
        manualIdentityConfirmationOwnerCount: ownerIds.length,
        requestLogKind: "MANUAL_IDENTITY_CONFIRMATION",
        requestId,
        idempotencyKey: scopedIdempotencyKey,
        mutationHash,
        pendingIdentityHmacs,
      });

      return NextResponse.json(
        { submission: { version: updated.version }, requestId },
        { headers: { "cache-control": "no-store" } },
      );
    }

    if (!isAmendment) {
      return fail(
        "VALIDATION_FAILED",
        "Sửa Giấy chứng nhận và Chủ sử dụng khi đang xử lý dùng Bàn làm việc PL3 " +
          "(PUT /working-payload), không dùng đường này nữa.",
        requestId,
        400,
      );
    }

    const draft: IntakeDraft = structuredClone(record.draft);
    const changes: Record<string, string> = {};
    /** Chủ có trường định danh đọc từ chip CCCD bị cán bộ ghi đè — đánh dấu riêng trong audit. */
    const identityOverrideOwnerIds = new Set<string>();

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
        ownerPatch.gender !== undefined;
      // Không còn chặn cán bộ sửa chủ đã `QR_CONFIRMED` (03-decisions.md [2026-07-25] Q1), nhưng
      // ghi đè dữ liệu đọc từ chip là việc phải tra lại được — đánh dấu riêng trong audit.
      if (identityFieldsTouched && isOwnerIdentityQrConfirmed(owner.identityStatus)) {
        if (!ownerPatch.identityOverrideReason) {
          return fail(
            "VALIDATION_FAILED",
            "Cần nêu lý do khi sửa thông tin định danh đã đọc từ QR.",
            requestId,
            400,
          );
        }
        identityOverrideOwnerIds.add(ownerPatch.id);
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
        changes[`owners.${ownerPatch.id}.gender`] =
          `${owner.gender || "-"} → ${ownerPatch.gender || "-"}`;
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
      if (identityFieldsTouched && isOwnerIdentityQrConfirmed(owner.identityStatus)) {
        owner.identitySource = "MANUAL";
        owner.identityStatus = "QR_OVERRIDE_PENDING_REVIEW";
        owner.identityOverrideReason = ownerPatch.identityOverrideReason ?? "";
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

    const auditMetadata =
      identityOverrideOwnerIds.size > 0
        ? {
            ...changes,
            identityOverride: "true",
            identityOverrideOwnerCount: String(identityOverrideOwnerIds.size),
          }
        : changes;

    /*
     * Cán bộ sửa/điền CCCD mà người dân để trống ở MỨC A thì hồ sơ phải vào chỉ mục tra cứu ngay
     * tại đây. Trước V2 mọi hồ sơ đều có CCCD lúc gửi nên chỉ cần ghi ở `submit`; từ khi CCCD là
     * tùy chọn, đường của cán bộ là đường DUY NHẤT mà một số CCCD có thể xuất hiện lần đầu.
     *
     * Dùng `kind = 'PENDING'` y như người dân tự khai (quyết định 2026-07-29): chỉ mục trả lời
     * "có hồ sơ nào đang gắn với CCCD này", không phân biệt ai gõ vào ô đó. Insert dùng
     * `on conflict do nothing` nên ghi lại ở mỗi lần sửa là vô hại.
     */
    const pendingIdentityHmacs = citizenIdsForLookup(draft).map((identityNumber) =>
      identityHmac(environment.DATA_HASH_PEPPER, identityNumber),
    );

    // Chỉ còn đường điều chỉnh hồ sơ chính thức tới đây — nhánh STAFF_DRAFT_EDIT đã return ở trên.
    const updated = await repository.commitOfficialAmendment({
      record,
      expectedVersion: body.data.version,
      draft,
      actorEmail: user.email,
      amendmentReason: body.data.amendmentReason ?? "",
      auditMetadata,
      timelineEvent: newTimelineEvent({
        eventType: "OFFICIAL_RECORD_AMENDED",
        label: "Cán bộ điều chỉnh hồ sơ đã tiếp nhận",
        actorDisplayName: publicActorName(user.displayName),
      }),
      requestId,
      idempotencyKey: scopedIdempotencyKey,
      mutationHash,
      pendingIdentityHmacs,
    });

    return NextResponse.json(
      {
        submission: { version: updated.version },
        amended: true,
        officialCaseId: updated.officialCaseId,
        requestId,
      },
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
