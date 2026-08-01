import { randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { AuthorizationError, requireActiveUser } from "@/modules/auth/authorization";
import { verifyCsrfToken } from "@/modules/auth/csrf";
import { createApiErrorPayload } from "@/modules/common/api-error";
import { loadServerEnvironment } from "@/modules/common/env";
import {
  FileOwnerReassignConflictError,
  getPublicIntakeRepository,
  OfficerFileMutationRejectedError,
  type OfficerFileRejectionReason,
} from "@/modules/public-intake/repository";
import { getPublicIntakeStorage, PreviewUnavailableError } from "@/modules/public-intake/storage";
import { SUBMISSION_DECISION_ROLES, SUBMISSION_READ_ROLES } from "@/modules/submissions/review";

/**
 * Vì sao lượt thao tác ảnh bị từ chối → mã lỗi HTTP nào. Cùng bảng nghĩa với
 * `uploads/complete/route.ts`: 409 cho "trạng thái không như bên gọi tưởng, hãy tải lại", 400 cho
 * dữ liệu bên gọi gửi sai.
 */
const REJECTION_HTTP: Record<
  OfficerFileRejectionReason,
  { readonly code: MutationFailCode; readonly status: number }
> = {
  NOT_FOUND: { code: "NOT_FOUND", status: 404 },
  FORBIDDEN: { code: "ACCESS_DENIED", status: 403 },
  OWNER_INVALID: { code: "VALIDATION_FAILED", status: 400 },
  REPLACE_TARGET_INVALID: { code: "VERSION_CONFLICT", status: 409 },
  SLOT_CONFLICT: { code: "VERSION_CONFLICT", status: 409 },
  CERTIFICATE_LIMIT: { code: "VERSION_CONFLICT", status: 409 },
  BYTE_BUDGET: { code: "VALIDATION_FAILED", status: 400 },
  FILE_NOT_FOUND: { code: "NOT_FOUND", status: 404 },
  FILE_INACTIVE: { code: "VERSION_CONFLICT", status: 409 },
  DOCUMENT_TYPE_INVALID: { code: "VALIDATION_FAILED", status: 400 },
};

type MutationFailCode =
  | "ACCESS_DENIED"
  | "UNAUTHENTICATED"
  | "VALIDATION_FAILED"
  | "NOT_FOUND"
  | "VERSION_CONFLICT"
  | "INTERNAL_ERROR";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _: NextRequest,
  context: { params: Promise<{ submissionId: string; fileId: string }> },
): Promise<NextResponse> {
  const requestId = randomUUID();
  const totalStartedAt = performance.now();
  try {
    const user = await requireActiveUser(SUBMISSION_READ_ROLES);
    const { submissionId, fileId } = await context.params;
    const repository = getPublicIntakeRepository();
    const databaseStartedAt = performance.now();
    const file = await repository.findActiveFile(submissionId, fileId);
    const databaseMs = performance.now() - databaseStartedAt;
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
    const driveStartedAt = performance.now();
    const original = await getPublicIntakeStorage().readOriginal(file.driveFileId);
    const driveMs = performance.now() - driveStartedAt;
    await repository.appendAudit({
      actorEmail: user.email,
      action: "SUBMISSION_FILE_PREVIEW_VIEWED",
      entityId: submissionId,
      requestId,
      metadata: { documentType: file.documentType },
    });
    return new NextResponse(new Uint8Array(original.bytes).buffer, {
      headers: {
        "cache-control": "private, no-store",
        "content-type": original.contentType,
        "x-content-type-options": "nosniff",
        "content-disposition": "inline",
        "server-timing": `preview_db;dur=${databaseMs.toFixed(1)}, preview_drive;dur=${driveMs.toFixed(1)}, preview_total;dur=${(performance.now() - totalStartedAt).toFixed(1)}`,
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
 * **Không đòi `idempotency-key`.** Không phải bỏ sót: `commitOfficerFileDelete` khóa dòng
 * (`for update`) rồi mới chuyển trạng thái và **không làm gì** nếu đã ở `DELETED`, nên gọi lại là
 * no-op tự nhiên và cũng không ghi audit lần hai. Thêm một khóa không dùng tới chỉ là hình thức.
 *
 * **Quyền, trạng thái, đổi trạng thái ảnh và audit nằm trong cùng một transaction**
 * (`commitOfficerFileDelete`). Bản đầu kiểm `mayStaffEdit` ở route rồi mới gọi hai lệnh ghi rời
 * nhau: giữa hai bước hồ sơ có thể đã được tiếp nhận chính thức hoặc chuyển cho cán bộ khác, và nếu
 * audit lỗi sau khi ảnh đã bị gỡ thì nhật ký không biết ai gỡ.
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
  const fail = (code: MutationFailCode, message: string, status: number): NextResponse =>
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
    try {
      await repository.commitOfficerFileDelete({
        submissionId,
        fileId,
        actorEmail: user.email,
        requestId,
      });
    } catch (error) {
      if (error instanceof OfficerFileMutationRejectedError) {
        const { code, status } = REJECTION_HTTP[error.reason];
        return fail(code, error.message, status);
      }
      throw error;
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
 * **Không đòi `idempotency-key`.** `commitOfficerFileOwnerReassign` coi gán lại đúng chủ đang có là
 * **no-op** thành công, nên gọi lại sau khi mất mạng giữa chừng tự động an toàn — không ghi audit
 * lần hai.
 *
 * **Quyền, trạng thái, chủ đích, chống tranh chấp ô đích, cập nhật ảnh và audit nằm trong cùng một
 * transaction.** Bản đầu kiểm quyền ở route rồi ghi audit sau khi transaction đã commit: nếu audit
 * lỗi thì ảnh đã đổi chủ mà nhật ký không biết ai đổi.
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
    try {
      await repository.commitOfficerFileOwnerReassign({
        submissionId,
        fileId,
        newOwnerId: body.data.ownerId,
        actorEmail: user.email,
        requestId,
      });
    } catch (error) {
      if (error instanceof OfficerFileMutationRejectedError) {
        const { code, status } = REJECTION_HTTP[error.reason];
        return fail(code, error.message, status);
      }
      if (error instanceof FileOwnerReassignConflictError) {
        return fail("VERSION_CONFLICT", error.message, 409);
      }
      throw error;
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
