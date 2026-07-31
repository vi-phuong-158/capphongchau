import { createHash, randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { AuthorizationError, requireActiveUser } from "@/modules/auth/authorization";
import { verifyCsrfToken } from "@/modules/auth/csrf";
import { createApiErrorPayload } from "@/modules/common/api-error";
import { loadServerEnvironment, loadPublicIntakeEnvironment } from "@/modules/common/env";
import {
  getPublicIntakeRepository,
  OfficerFileMutationRejectedError,
  SubmissionIdempotencyConflictError,
  type OfficerFileRejectionReason,
} from "@/modules/public-intake/repository";
import { getPublicIntakeStorage, UploadVerificationError } from "@/modules/public-intake/storage";
import {
  ensureSubmissionFolderReady,
  SubmissionFolderBusyError,
  SubmissionFolderUnavailableError,
} from "@/modules/public-intake/submission-folder";
import { discardIfOrphan } from "@/modules/public-intake/upload-commit";
import { SUBMISSION_DECISION_ROLES } from "@/modules/submissions/review";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  driveFileId: z.string().trim().min(1).max(256),
  documentType: z.enum(["CITIZEN_ID_FRONT", "CITIZEN_ID_BACK", "CERTIFICATE"]),
  ownerId: z.string().trim().max(64).default(""),
  replaceFileId: z.string().trim().max(64).default(""),
});

/**
 * Cố tình chỉ dùng bộ mã có sẵn trong `API_ERROR_CODES` — xem giải thích trong `initiate/route.ts`:
 * nới bộ mã chung là đổi hợp đồng API cho mọi client cán bộ, mà client chỉ hiển thị `error.message`.
 */
type FailCode =
  | "ACCESS_DENIED"
  | "UNAUTHENTICATED"
  | "VALIDATION_FAILED"
  | "NOT_FOUND"
  | "VERSION_CONFLICT"
  | "IDEMPOTENCY_CONFLICT"
  | "SERVICE_UNAVAILABLE"
  | "INTERNAL_ERROR";

function fail(
  code: FailCode,
  message: string,
  requestId: string,
  status: number,
  headers?: Record<string, string>,
): NextResponse {
  return NextResponse.json(createApiErrorPayload({ code, message, requestId }), {
    status,
    headers: { "cache-control": "no-store", ...headers },
  });
}

/**
 * Vì sao lượt ghi bị từ chối → mã lỗi HTTP nào.
 *
 * `VERSION_CONFLICT` (409) cho mọi lý do "trạng thái không như bên gọi tưởng, hãy tải lại": hồ sơ
 * đổi tay, ảnh cần thay đã biến mất, ô CCCD đã bị chiếm, vượt trần số ảnh. `VALIDATION_FAILED`
 * (400) cho dữ liệu bên gọi gửi sai ngay từ đầu.
 */
const REJECTION_HTTP: Record<
  OfficerFileRejectionReason,
  { readonly code: FailCode; readonly status: number }
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

/**
 * Cán bộ tự tải ảnh giấy tờ vào hồ sơ (Đợt 2C) — bước nhận tệp đã nằm trên Drive vào hồ sơ.
 *
 * Cùng cửa quyền với `initiate` (`mayStaffEdit`) và cùng thứ tự xử lý với đường của người dân, kể
 * cả hai điểm dễ làm sai:
 *
 *   1. **Replay đứng trước mọi kiểm tra trạng thái.** Sau lần commit đầu, chính ảnh vừa nhận làm
 *      kiểm tra "đã có ảnh CCCD" thất bại; nếu để nhánh đó chạy trước thì lần gọi lại (response đầu
 *      bị mất mạng) sẽ đi vào cửa dọn dẹp và xóa mất tệp mà cơ sở dữ liệu đang trỏ. Ở đây nhánh
 *      replay nằm **trong cùng transaction** với phần ghi, nên không có khoảng nào để hai lượt gọi
 *      cùng đi qua.
 *   2. **Mọi nhánh thất bại đều qua `discardIfOrphan`,** không xóa thẳng: tệp đã nằm trên Drive
 *      nhưng chưa chắc chưa ai nhận, và xóa sai là mất bằng chứng vĩnh viễn.
 *
 * **Toàn bộ phần quyết định và ghi nằm trong `repository.commitOfficerFileUpload`** — một
 * transaction duy nhất: khóa hồ sơ (`for update`), kiểm lại quyền/trạng thái/trần dung lượng/trần
 * số ảnh bằng dữ liệu thật, ghi ảnh, làm mới `file_summary_json`, ghi audit, ghi `request_log`.
 * Route chỉ còn xác thực, xác minh tệp trên Drive và dịch lỗi sang HTTP.
 *
 * Vì sao không thể để audit ngoài transaction như bản đầu: `appendFile` commit ảnh trước, nếu
 * `appendAudit` lỗi thì API trả 500 nhưng ảnh **đã** vào hồ sơ; client gọi lại thì nhánh replay trả
 * thành công và dòng audit thiếu đó không bao giờ được ghi lại — ảnh có trong hồ sơ mà nhật ký
 * không biết cán bộ nào thêm.
 *
 * Khác đường người dân ở hai chỗ: loại `request_log` là `OFFICER_UPLOAD_COMPLETE` (để hai đường
 * không đọc được replay của nhau) và có thêm một dòng `audit_logs` — người dân tải ảnh của chính
 * mình thì không cần dấu vết ai làm, còn cán bộ ghi vào hồ sơ của người khác thì cần.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ submissionId: string }> },
): Promise<NextResponse> {
  const requestId = request.headers.get("x-request-id") ?? randomUUID();
  try {
    const rawIdempotencyKey = request.headers.get("idempotency-key");
    const body = schema.safeParse(await request.json().catch(() => null));
    if (!body.success || !rawIdempotencyKey || rawIdempotencyKey.length > 256) {
      return fail(
        "VALIDATION_FAILED",
        "Thông tin tệp vừa tải lên hoặc idempotency key không hợp lệ.",
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
    const { driveFileId, documentType, ownerId, replaceFileId } = body.data;
    const repository = getPublicIntakeRepository();
    const idempotencyKey = `OFFICER_UPLOAD_COMPLETE:${submissionId}:${rawIdempotencyKey}`;
    const mutationHash = createHash("sha256")
      .update(
        JSON.stringify({
          submissionId,
          actorEmail: user.email,
          driveFileId,
          documentType,
          ownerId,
          replaceFileId,
        }),
      )
      .digest("hex");

    const record = await repository.findById(submissionId);
    if (!record) return fail("NOT_FOUND", "Không tìm thấy bản kê khai.", requestId, 404);

    /*
     * Thư mục đích để xác minh tệp. Từ Phase 3 (lazy Drive folder) `record.driveFolderId` có thể là
     * `null`; đi qua `ensureSubmissionFolderReady` để dùng đúng cơ chế lease của đường công khai
     * thay vì ép kiểu cho qua build rồi xác minh với thư mục rỗng.
     *
     * Đặt **trước** `verifyUploadedFile` và sau khi đã có `record`: nếu thư mục chưa sẵn sàng thì
     * chưa xác minh được gì, và cũng chưa được dọn tệp — `discardIfOrphan` cần biết thư mục của hồ
     * sơ mới dám xóa, nên nhánh này trả 503 và để client thử lại.
     */
    let expectedFolderId: string;
    try {
      expectedFolderId = await ensureSubmissionFolderReady(record);
    } catch (error) {
      if (
        error instanceof SubmissionFolderBusyError ||
        error instanceof SubmissionFolderUnavailableError
      ) {
        return fail(
          "SERVICE_UNAVAILABLE",
          "Kho ảnh đang được chuẩn bị. Vui lòng thử lại sau ít giây.",
          requestId,
          503,
          {
            "Retry-After": String(
              error instanceof SubmissionFolderBusyError ? error.retryAfterSeconds : 2,
            ),
          },
        );
      }
      throw error;
    }
    const folderScope = { driveFolderId: expectedFolderId };

    let verified;
    try {
      verified = await getPublicIntakeStorage().verifyUploadedFile({
        driveFileId,
        expectedFolderId,
        maxBytes: loadPublicIntakeEnvironment().MAX_UPLOAD_MB * 1024 * 1024,
      });
    } catch (error) {
      if (error instanceof UploadVerificationError) {
        // Tệp không đạt phải rời khỏi Drive ngay, không để tích rác trong kho của quản trị viên.
        await discardIfOrphan(repository, folderScope, driveFileId);
        return fail("VALIDATION_FAILED", error.message, requestId, 400);
      }
      throw error;
    }

    try {
      const { summary } = await repository.commitOfficerFileUpload({
        submissionId,
        actorEmail: user.email,
        requestId,
        idempotencyKey,
        mutationHash,
        documentType,
        ownerId,
        replaceFileId,
        file: {
          fileId: randomUUID(),
          driveFileId: verified.driveFileId,
          mimeType: verified.mimeType,
          sizeBytes: verified.sizeBytes,
          checksum: verified.checksum,
          fileName: verified.fileName,
        },
      });

      return NextResponse.json(
        { ok: true, fileId: summary.fileId, requestId },
        { headers: { "cache-control": "no-store" } },
      );
    } catch (error) {
      if (error instanceof OfficerFileMutationRejectedError) {
        await discardIfOrphan(repository, folderScope, verified.driveFileId);
        const { code, status } = REJECTION_HTTP[error.reason];
        return fail(code, error.message, requestId, status);
      }
      if (error instanceof SubmissionIdempotencyConflictError) {
        await discardIfOrphan(repository, folderScope, verified.driveFileId);
        return fail(
          "IDEMPOTENCY_CONFLICT",
          "Khóa chống gửi trùng đã dùng cho thao tác khác.",
          requestId,
          409,
        );
      }
      // Ghi cơ sở dữ liệu hỏng sau khi tệp đã nằm trên Drive: không dọn thì mỗi lần hỏng để lại một
      // tệp mồ côi không ai biết thuộc hồ sơ nào. `discardIfOrphan` chỉ xóa khi chắc chưa ai nhận.
      await discardIfOrphan(repository, folderScope, verified.driveFileId);
      throw error;
    }
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return fail(
        error.kind,
        error.message,
        requestId,
        error.kind === "UNAUTHENTICATED" ? 401 : 403,
      );
    }
    return fail("INTERNAL_ERROR", "Không nhận được ảnh vừa tải lên.", requestId, 500);
  }
}
