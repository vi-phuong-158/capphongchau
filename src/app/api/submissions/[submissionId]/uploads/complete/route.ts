import { createHash, randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { AuthorizationError, requireActiveUser } from "@/modules/auth/authorization";
import { verifyCsrfToken } from "@/modules/auth/csrf";
import { createApiErrorPayload } from "@/modules/common/api-error";
import { loadServerEnvironment, loadPublicIntakeEnvironment } from "@/modules/common/env";
import { effectivePayload } from "@/modules/public-intake/payload-layers";
import {
  getPublicIntakeRepository,
  SubmissionIdempotencyConflictError,
} from "@/modules/public-intake/repository";
import { getPublicIntakeStorage, UploadVerificationError } from "@/modules/public-intake/storage";
import { requiresCitizenId } from "@/modules/public-intake/types";
import { discardIfOrphan } from "@/modules/public-intake/upload-commit";
import { mayStaffEdit, SUBMISSION_DECISION_ROLES } from "@/modules/submissions/review";

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
  | "INTERNAL_ERROR";

function fail(code: FailCode, message: string, requestId: string, status: number): NextResponse {
  return NextResponse.json(createApiErrorPayload({ code, message, requestId }), {
    status,
    headers: { "cache-control": "no-store" },
  });
}

/**
 * Cán bộ tự tải ảnh giấy tờ vào hồ sơ (Đợt 2C) — bước nhận tệp đã nằm trên Drive vào hồ sơ.
 *
 * Cùng cửa quyền với `initiate` (`mayStaffEdit`) và cùng thứ tự xử lý với đường của người dân, kể
 * cả hai điểm dễ làm sai:
 *
 *   1. **Replay đứng trước mọi kiểm tra trạng thái.** Sau lần commit đầu, chính ảnh vừa nhận làm
 *      kiểm tra "đã có ảnh CCCD" bên dưới thất bại; nếu để nhánh đó chạy trước thì lần gọi lại
 *      (response đầu bị mất mạng) sẽ đi vào cửa dọn dẹp và xóa mất tệp mà cơ sở dữ liệu đang trỏ.
 *   2. **Mọi nhánh thất bại đều qua `discardIfOrphan`,** không xóa thẳng: tệp đã nằm trên Drive
 *      nhưng chưa chắc chưa ai nhận, và xóa sai là mất bằng chứng vĩnh viễn.
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

    const replay = await repository.findStoredMutation(idempotencyKey, "OFFICER_UPLOAD_COMPLETE");
    if (replay) {
      if (replay.mutationHash !== mutationHash) {
        await discardIfOrphan(repository, record, driveFileId);
        return fail(
          "IDEMPOTENCY_CONFLICT",
          "Khóa chống gửi trùng đã dùng cho thao tác khác.",
          requestId,
          409,
        );
      }
      const fileId = replay.response.fileId;
      if (typeof fileId !== "string") {
        return fail("INTERNAL_ERROR", "Kết quả tải lên đã lưu không hợp lệ.", requestId, 500);
      }
      return NextResponse.json(
        { ok: true, fileId, requestId },
        { headers: { "cache-control": "no-store" } },
      );
    }

    if (!mayStaffEdit(record, user.email)) {
      await discardIfOrphan(repository, record, driveFileId);
      return fail(
        "ACCESS_DENIED",
        "Chỉ cán bộ đang nhận xử lý hồ sơ ở trạng thái Đang kiểm tra mới tải thêm ảnh được.",
        requestId,
        403,
      );
    }

    // Kiểm lại trạng thái thay ảnh trên nguồn thật: giữa `initiate` và đây, cán bộ có thể đã thêm
    // ảnh ở tab khác, hoặc chính lượt này là lần thử thứ hai sau khi mạng đứt.
    const files = await repository.listFiles(submissionId);
    if (documentType === "CERTIFICATE") {
      if (
        replaceFileId &&
        !files.some(
          (file) => file.fileId === replaceFileId && file.documentType === "CERTIFICATE",
        )
      ) {
        await discardIfOrphan(repository, record, driveFileId);
        return fail(
          "VERSION_CONFLICT",
          "Ảnh Giấy chứng nhận cần thay không còn hợp lệ.",
          requestId,
          409,
        );
      }
    } else {
      const owners = effectivePayload(record)?.owners;
      const owner = Array.isArray(owners)
        ? owners.find((candidate) => candidate.id === ownerId)
        : undefined;
      if (!owner || !requiresCitizenId(owner.ownerType)) {
        await discardIfOrphan(repository, record, driveFileId);
        return fail("VALIDATION_FAILED", "Chủ sử dụng của ảnh CCCD không hợp lệ.", requestId, 400);
      }
      const existing = files.find(
        (file) => file.ownerId === ownerId && file.documentType === documentType,
      );
      if ((existing && existing.fileId !== replaceFileId) || (!existing && replaceFileId)) {
        await discardIfOrphan(repository, record, driveFileId);
        return fail("VERSION_CONFLICT", "Trạng thái thay ảnh CCCD không còn hợp lệ.", requestId, 409);
      }
    }

    let verified;
    try {
      verified = await getPublicIntakeStorage().verifyUploadedFile({
        driveFileId,
        expectedFolderId: record.driveFolderId,
        maxBytes: loadPublicIntakeEnvironment().MAX_UPLOAD_MB * 1024 * 1024,
      });
    } catch (error) {
      if (error instanceof UploadVerificationError) {
        // Tệp không đạt phải rời khỏi Drive ngay, không để tích rác trong kho của quản trị viên.
        await discardIfOrphan(repository, record, driveFileId);
        return fail("VALIDATION_FAILED", error.message, requestId, 400);
      }
      throw error;
    }

    const fileId = randomUUID();
    try {
      const summary = await repository.appendFile(
        {
          fileId,
          submissionId,
          ownerId,
          documentType,
          driveFileId: verified.driveFileId,
          mimeType: verified.mimeType,
          sizeBytes: verified.sizeBytes,
          checksum: verified.checksum,
          fileName: verified.fileName,
        },
        record,
        {
          idempotencyKey,
          mutationHash,
          requestId,
          replaceFileId: replaceFileId || undefined,
          kind: "OFFICER_UPLOAD_COMPLETE",
        },
      );

      /*
       * Dấu vết ai bổ sung ảnh nào. Metadata chỉ gồm danh mục đóng và số — `documentType`,
       * `fileId`, `sizeBytes` và có thay ảnh hay không. Không ghi tên tệp, không ghi `driveFileId`,
       * không ghi `ownerId` kèm bất cứ thông tin định danh nào (quy tắc log trong 02-coding-rules).
       */
      await repository.appendAudit({
        actorEmail: user.email,
        action: "SUBMISSION_OFFICER_FILE_UPLOADED",
        entityId: submissionId,
        requestId,
        metadata: {
          documentType,
          fileId: summary.fileId,
          sizeBytes: verified.sizeBytes,
          replaced: Boolean(replaceFileId),
        },
      });

      return NextResponse.json(
        { ok: true, fileId: summary.fileId, requestId },
        { headers: { "cache-control": "no-store" } },
      );
    } catch (error) {
      if (error instanceof SubmissionIdempotencyConflictError) {
        await discardIfOrphan(repository, record, verified.driveFileId);
        return fail(
          "IDEMPOTENCY_CONFLICT",
          "Khóa chống gửi trùng đã dùng cho thao tác khác.",
          requestId,
          409,
        );
      }
      // Ghi cơ sở dữ liệu hỏng sau khi tệp đã nằm trên Drive: không dọn thì mỗi lần hỏng để lại một
      // tệp mồ côi không ai biết thuộc hồ sơ nào. `discardIfOrphan` chỉ xóa khi chắc chưa ai nhận.
      await discardIfOrphan(repository, record, verified.driveFileId);
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
