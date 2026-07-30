import { randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { AuthorizationError, requireActiveUser } from "@/modules/auth/authorization";
import { verifyCsrfToken } from "@/modules/auth/csrf";
import { createApiErrorPayload } from "@/modules/common/api-error";
import { loadServerEnvironment } from "@/modules/common/env";
import { effectivePayload } from "@/modules/public-intake/payload-layers";
import {
  FileOwnerReassignConflictError,
  getPublicIntakeRepository,
} from "@/modules/public-intake/repository";
import { getPublicIntakeStorage, PreviewUnavailableError } from "@/modules/public-intake/storage";
import { requiresCitizenId } from "@/modules/public-intake/types";
import {
  mayStaffEdit,
  SUBMISSION_DECISION_ROLES,
  SUBMISSION_READ_ROLES,
} from "@/modules/submissions/review";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _: NextRequest,
  context: { params: Promise<{ submissionId: string; fileId: string }> },
): Promise<NextResponse> {
  const requestId = randomUUID();
  try {
    const user = await requireActiveUser(SUBMISSION_READ_ROLES);
    const { submissionId, fileId } = await context.params;
    const repository = getPublicIntakeRepository();
    const record = await repository.findById(submissionId);
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
    const file = await repository.findActiveFile(submissionId, fileId);
    if (!file) {
      return NextResponse.json(
        createApiErrorPayload({
          code: "NOT_FOUND",
          message: "Không tìm thấy tệp hồ sơ.",
          requestId,
        }),
        { status: 404 },
      );
    }
    const preview = await getPublicIntakeStorage().readPreview(file.driveFileId);
    await repository.appendAudit({
      actorEmail: user.email,
      action: "SUBMISSION_FILE_PREVIEW_VIEWED",
      entityId: record.submissionId,
      requestId,
      metadata: { documentType: file.documentType },
    });
    return new NextResponse(new Uint8Array(preview.bytes).buffer, {
      headers: {
        "cache-control": "private, no-store",
        "content-type": preview.contentType,
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json(
        createApiErrorPayload({ code: error.kind, message: error.message, requestId }),
        { status: error.kind === "UNAUTHENTICATED" ? 401 : 403 },
      );
    }
    if (error instanceof PreviewUnavailableError) {
      return NextResponse.json(
        createApiErrorPayload({ code: "VALIDATION_FAILED", message: error.message, requestId }),
        { status: 422, headers: { "cache-control": "no-store" } },
      );
    }
    return NextResponse.json(
      createApiErrorPayload({
        code: "INTERNAL_ERROR",
        message: "Không thể tải ảnh xem trước.",
        requestId,
      }),
      { status: 500, headers: { "cache-control": "no-store" } },
    );
  }
}

/**
 * Cán bộ gỡ một ảnh Giấy chứng nhận khỏi hồ sơ (Đợt 2C).
 *
 * **Xóa mềm, không bao giờ chạm Drive.** Sao y đúng hợp đồng của đường hộ dân
 * (`DELETE /api/public/submissions/current/files/:fileId`): đổi `status` sang `DELETED`, tệp nằm
 * nguyên trên Drive. `isDriveFileAdopted` không lọc theo `status` nên `scripts/audit-orphan-public-
 * files.ts` vẫn coi tệp là "đã có hồ sơ nhận" và không dọn nó — ảnh đã gỡ vẫn tra lại được.
 *
 * **Chỉ ảnh `CERTIFICATE`,** cũng theo đúng đường hộ dân. Ảnh CCCD là ràng buộc bắt buộc:
 * `completionChecks.checkFiles` chặn tiếp nhận khi một chủ sử dụng thiếu mặt trước hoặc mặt sau, nên
 * "gỡ một ảnh CCCD" chỉ tạo ra trạng thái không tiếp nhận được mà cán bộ phải sửa ngay. Luồng đúng
 * cho CCCD là **thay ảnh** (`POST .../uploads/*` kèm `replaceFileId`) — một bước, không có khoảng
 * thời gian hồ sơ bị hổng.
 *
 * **Gỡ được cả ảnh do hộ dân tự tải lên,** không chỉ ảnh chính cán bộ vừa bổ sung (quyết định
 * 2026-07-30): cán bộ là người quyết định hồ sơ gồm những gì, xóa mềm không mất dữ liệu, và audit
 * ghi rõ ai làm. Chặn lại thì một trang GCN hộ dân chụp nhầm nằm trong hồ sơ vĩnh viễn.
 *
 * **Không đòi `idempotency-key`.** Không phải bỏ sót: `markFileDeleted` khóa dòng (`for update`) rồi
 * mới chuyển trạng thái và **không làm gì** nếu đã ở `DELETED`, nên gọi lại là no-op tự nhiên. Thêm
 * một khóa không dùng tới chỉ là hình thức.
 *
 * **Không chặn khi đây là ảnh GCN cuối cùng.** Việc đó thuộc `completionChecks` — nó báo
 * `FILES_CERTIFICATE_MISSING` lúc tiếp nhận. Chặn ngay ở đây là bắt cán bộ muốn thay toàn bộ bộ ảnh
 * phải làm ngược thứ tự.
 */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ submissionId: string; fileId: string }> },
): Promise<NextResponse> {
  const requestId = request.headers.get("x-request-id") ?? randomUUID();
  const fail = (
    code: "ACCESS_DENIED" | "UNAUTHENTICATED" | "VALIDATION_FAILED" | "NOT_FOUND" | "INTERNAL_ERROR",
    message: string,
    status: number,
  ): NextResponse =>
    NextResponse.json(createApiErrorPayload({ code, message, requestId }), {
      status,
      headers: { "cache-control": "no-store" },
    });

  try {
    const user = await requireActiveUser(SUBMISSION_DECISION_ROLES);
    const environment = loadServerEnvironment();
    if (
      !verifyCsrfToken(environment.AUTH_SECRET, user.email, request.headers.get("x-csrf-token"))
    ) {
      return fail("ACCESS_DENIED", "Yêu cầu bảo mật không hợp lệ hoặc đã hết hạn.", 403);
    }

    const { submissionId, fileId } = await context.params;
    const repository = getPublicIntakeRepository();
    const record = await repository.findById(submissionId);
    if (!record) return fail("NOT_FOUND", "Không tìm thấy bản kê khai.", 404);
    if (!mayStaffEdit(record, user.email)) {
      return fail(
        "ACCESS_DENIED",
        "Chỉ cán bộ đang nhận xử lý hồ sơ ở trạng thái Đang kiểm tra mới gỡ được ảnh.",
        403,
      );
    }

    // `includeInactive` để thấy cả ảnh đã `DELETED` — cần cho tính idempotent. Ảnh `REPLACED` thì
    // coi như không còn: nó đã ra khỏi bộ ảnh hiệu lực bằng luồng thay ảnh, không phải việc của đây.
    const file = (await repository.listFiles(submissionId, true)).find(
      (candidate) =>
        candidate.fileId === fileId &&
        (candidate.status === "UPLOADED" || candidate.status === "DELETED"),
    );
    if (!file) return fail("NOT_FOUND", "Không tìm thấy ảnh cần gỡ.", 404);
    if (file.documentType !== "CERTIFICATE") {
      return fail(
        "VALIDATION_FAILED",
        "Chỉ gỡ được ảnh Giấy chứng nhận. Ảnh CCCD dùng chức năng thay ảnh.",
        400,
      );
    }

    if (file.status === "UPLOADED") {
      await repository.markFileDeleted(submissionId, fileId);
      // Metadata chỉ danh mục đóng và số, không tên tệp / Drive ID / ownerId.
      await repository.appendAudit({
        actorEmail: user.email,
        action: "SUBMISSION_OFFICER_FILE_DELETED",
        entityId: submissionId,
        requestId,
        metadata: { documentType: file.documentType, fileId, sizeBytes: file.sizeBytes },
      });
    }

    return NextResponse.json(
      { fileId, status: "DELETED", requestId },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return fail(error.kind, error.message, error.kind === "UNAUTHENTICATED" ? 401 : 403);
    }
    return fail("INTERNAL_ERROR", "Không gỡ được ảnh khỏi hồ sơ.", 500);
  }
}

const reassignSchema = z.object({
  ownerId: z.string().trim().min(1).max(64),
});

/**
 * Cán bộ gán lại chủ sử dụng của một ảnh CCCD (Đợt 2C bổ sung).
 *
 * Vá lỗ mà cả thay ảnh lẫn gỡ ảnh đều không vá được: cán bộ tải nhầm ảnh CCCD của chủ 2 vào ô mặt
 * trước của chủ 1. Nếu chủ 1 chưa có ảnh nào khác thì "thay ảnh" không áp dụng được (không có ảnh
 * nào đang chiếm ô đó để thay), và "gỡ ảnh" chỉ để lại một ô trống — ảnh của chủ 2 biến mất, cán bộ
 * phải tải lại từ đầu dù ảnh đã đúng, chỉ sai nhãn. Route này sửa đúng cái nhãn đó.
 *
 * **Chỉ ảnh CCCD**, không áp dụng cho `CERTIFICATE`: ảnh GCN không gắn với một chủ sử dụng cụ thể.
 *
 * **Không tự động đánh `REPLACED` ảnh đang có ở ô đích.** Khác `appendFile` lúc thay ảnh: đó là "tôi
 * vừa chụp ảnh mới cho đúng người", còn đây là "tôi gán nhãn sai cho ảnh cũ" — hai việc khác nhau.
 * Nếu chủ đích đã có ảnh cùng mặt, trả `VERSION_CONFLICT` bắt cán bộ xử lý ảnh đang chiếm chỗ trước
 * (gỡ hoặc thay), thay vì âm thầm đẩy một ảnh có thể đang đúng xuống lịch sử.
 *
 * **Không đòi `idempotency-key`.** `reassignFileOwner` coi gán lại đúng chủ đang có là **no-op**
 * thành công, nên gọi lại sau khi mất mạng giữa chừng tự động an toàn — không ghi audit lần hai.
 */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ submissionId: string; fileId: string }> },
): Promise<NextResponse> {
  const requestId = request.headers.get("x-request-id") ?? randomUUID();
  const fail = (
    code:
      | "ACCESS_DENIED"
      | "UNAUTHENTICATED"
      | "VALIDATION_FAILED"
      | "NOT_FOUND"
      | "VERSION_CONFLICT"
      | "INTERNAL_ERROR",
    message: string,
    status: number,
  ): NextResponse =>
    NextResponse.json(createApiErrorPayload({ code, message, requestId }), {
      status,
      headers: { "cache-control": "no-store" },
    });

  try {
    const body = reassignSchema.safeParse(await request.json().catch(() => null));
    if (!body.success) {
      return fail("VALIDATION_FAILED", "Thiếu chủ sử dụng đích hợp lệ.", 400);
    }

    const user = await requireActiveUser(SUBMISSION_DECISION_ROLES);
    const environment = loadServerEnvironment();
    if (
      !verifyCsrfToken(environment.AUTH_SECRET, user.email, request.headers.get("x-csrf-token"))
    ) {
      return fail("ACCESS_DENIED", "Yêu cầu bảo mật không hợp lệ hoặc đã hết hạn.", 403);
    }

    const { submissionId, fileId } = await context.params;
    const repository = getPublicIntakeRepository();
    const record = await repository.findById(submissionId);
    if (!record) return fail("NOT_FOUND", "Không tìm thấy bản kê khai.", 404);
    if (!mayStaffEdit(record, user.email)) {
      return fail(
        "ACCESS_DENIED",
        "Chỉ cán bộ đang nhận xử lý hồ sơ ở trạng thái Đang kiểm tra mới gán lại được chủ sử dụng.",
        403,
      );
    }

    const file = (await repository.listFiles(submissionId)).find(
      (candidate) => candidate.fileId === fileId,
    );
    if (!file) return fail("NOT_FOUND", "Không tìm thấy ảnh cần gán lại.", 404);
    if (file.documentType === "CERTIFICATE") {
      return fail(
        "VALIDATION_FAILED",
        "Chỉ gán lại chủ sử dụng cho ảnh CCCD. Ảnh Giấy chứng nhận không gắn với một chủ cụ thể.",
        400,
      );
    }

    // Chủ đích đọc từ lớp dữ liệu đang có hiệu lực, cùng quy tắc với các route uploads/* — chủ do
    // cán bộ thêm ở Bàn làm việc chỉ tồn tại ở `working_payload`, không ở `draft_json`.
    const owners = effectivePayload(record)?.owners;
    const targetOwner = Array.isArray(owners)
      ? owners.find((candidate) => candidate.id === body.data.ownerId)
      : undefined;
    if (!targetOwner || !requiresCitizenId(targetOwner.ownerType)) {
      return fail("VALIDATION_FAILED", "Chủ sử dụng đích không hợp lệ.", 400);
    }

    let outcome: "REASSIGNED" | "NOOP";
    try {
      outcome = await repository.reassignFileOwner(submissionId, fileId, body.data.ownerId);
    } catch (error) {
      if (error instanceof FileOwnerReassignConflictError) {
        return fail("VERSION_CONFLICT", error.message, 409);
      }
      throw error;
    }

    if (outcome === "REASSIGNED") {
      // Metadata chỉ danh mục đóng và số, không ownerId (cùng quy tắc với các audit khác của 2C).
      await repository.appendAudit({
        actorEmail: user.email,
        action: "SUBMISSION_OFFICER_FILE_OWNER_REASSIGNED",
        entityId: submissionId,
        requestId,
        metadata: { documentType: file.documentType, fileId },
      });
    }

    return NextResponse.json(
      { fileId, ownerId: body.data.ownerId, requestId },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return fail(error.kind, error.message, error.kind === "UNAUTHENTICATED" ? 401 : 403);
    }
    return fail("INTERNAL_ERROR", "Không gán lại được chủ sử dụng.", 500);
  }
}
