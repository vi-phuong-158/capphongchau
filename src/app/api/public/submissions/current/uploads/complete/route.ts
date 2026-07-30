import { createHash, randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { loadPublicIntakeEnvironment } from "@/modules/common/env";
import { isValidPublicIdempotencyKey } from "@/modules/public-intake/creation-idempotency";
import {
  getPublicIntakeRepository,
  PublicFileMutationRejectedError,
  SubmissionIdempotencyConflictError,
  type PublicFileRejectionReason,
} from "@/modules/public-intake/repository";
import {
  publicError,
  resolvePublicRequest,
  type PublicErrorCode,
} from "@/modules/public-intake/route-context";
import { getPublicIntakeStorage, UploadVerificationError } from "@/modules/public-intake/storage";
import { discardIfOrphan } from "@/modules/public-intake/upload-commit";

import {
  buildFileNormalizationMetadata,
  buildUploadAttemptMetric,
  clientUploadTelemetrySchema,
  reportUploadMetricFailure,
} from "@/modules/public-intake/upload-metrics";

export const runtime = "nodejs";

/**
 * Vì sao lượt ghi bị từ chối → mã lỗi HTTP nào.
 */
const REJECTION_HTTP: Record<
  PublicFileRejectionReason,
  { readonly code: PublicErrorCode; readonly status: number }
> = {
  NOT_FOUND: { code: "NOT_FOUND", status: 404 },
  INVALID_STATE: { code: "INVALID_STATE", status: 409 },
  OWNER_INVALID: { code: "VALIDATION_FAILED", status: 400 },
  REPLACE_TARGET_INVALID: { code: "VERSION_CONFLICT", status: 409 },
  SLOT_CONFLICT: { code: "VERSION_CONFLICT", status: 409 },
  CERTIFICATE_LIMIT: { code: "VERSION_CONFLICT", status: 409 },
  BYTE_BUDGET: { code: "VALIDATION_FAILED", status: 400 },
  FILE_NOT_FOUND: { code: "NOT_FOUND", status: 404 },
  FILE_INACTIVE: { code: "VERSION_CONFLICT", status: 409 },
  DOCUMENT_TYPE_INVALID: { code: "VALIDATION_FAILED", status: 400 },
};

export async function POST(request: Request): Promise<NextResponse> {
  const requestId = request.headers.get("x-request-id") ?? randomUUID();
  const rawIdempotencyKey = request.headers.get("idempotency-key");
  if (!isValidPublicIdempotencyKey(rawIdempotencyKey)) {
    return publicError("VALIDATION_FAILED", "Idempotency key không hợp lệ.", requestId);
  }

  const context = await resolvePublicRequest(request, { requireCsrf: true });
  if (context instanceof NextResponse) {
    return context;
  }

  const { record } = context;

  let body: {
    driveFileId?: unknown;
    documentType?: unknown;
    ownerId?: unknown;
    replaceFileId?: unknown;
    clientUpload?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return publicError("VALIDATION_FAILED", "Nội dung yêu cầu không hợp lệ.", requestId);
  }

  // Telemetry sai định dạng bị **bỏ qua**, không làm hỏng việc tải ảnh: người dân không mất công
  // chụp lại vì một con số đo lệch. Trường lạ bị `strict()` loại chứ không đi tiếp xuống dưới.
  const telemetryParse = clientUploadTelemetrySchema.safeParse(body.clientUpload ?? {});
  const telemetry = telemetryParse.success ? telemetryParse.data : undefined;
  const startedAt = Date.now();

  const driveFileId = typeof body.driveFileId === "string" ? body.driveFileId : "";
  const documentType = body.documentType;
  if (
    !driveFileId ||
    (documentType !== "CITIZEN_ID_FRONT" &&
      documentType !== "CITIZEN_ID_BACK" &&
      documentType !== "CERTIFICATE")
  ) {
    return publicError("VALIDATION_FAILED", "Thiếu thông tin tệp vừa tải lên.", requestId);
  }

  const environment = loadPublicIntakeEnvironment();
  const storage = getPublicIntakeStorage();
  const repository = getPublicIntakeRepository();
  const ownerId = typeof body.ownerId === "string" ? body.ownerId : "";
  const replaceFileId = typeof body.replaceFileId === "string" ? body.replaceFileId : "";
  const idempotencyKey = `PUBLIC_UPLOAD_COMPLETE:${record.submissionId}:${rawIdempotencyKey}`;
  const mutationHash = createHash("sha256")
    .update(
      JSON.stringify({
        submissionId: record.submissionId,
        driveFileId,
        documentType,
        ownerId,
        replaceFileId,
      }),
    )
    .digest("hex");

  if (!record.driveFolderId) {
    return publicError(
      "INVALID_STATE",
      "Thư mục tải ảnh chưa sẵn sàng. Vui lòng tải lại ảnh từ đầu.",
      requestId,
    );
  }
  const driveFolderId = record.driveFolderId;

  /* ── Replay nhanh TRƯỚC khi gọi Drive ──────────────────────────────────────
   * Nếu server đã commit nhưng response mất, retry phải trả kết quả cũ trước
   * mọi kiểm tra Drive hoặc trạng thái mới. Advisory lock bên trong
   * `commitPublicFileUpload` vẫn xử lý hai request đồng thời.                */
  const earlyReplay = await repository.findCompletedUploadReplay(idempotencyKey, mutationHash);
  if (earlyReplay) {
    return NextResponse.json({
      ok: true,
      fileId: earlyReplay.summary.fileId,
      sizeBytes: earlyReplay.summary.sizeBytes,
    });
  }

  let verified;
  try {
    verified = await storage.verifyUploadedFile({
      driveFileId,
      expectedFolderId: driveFolderId,
      maxBytes: environment.MAX_UPLOAD_MB * 1024 * 1024,
    });
  } catch (error) {
    if (error instanceof UploadVerificationError) {
      await discardIfOrphan(repository, record, driveFileId);
      return publicError("VALIDATION_FAILED", error.message, requestId);
    }
    throw error;
  }

  const fileId = randomUUID();
  try {
    const { summary, replayed } = await repository.commitPublicFileUpload({
      submissionId: record.submissionId,
      requestId,
      idempotencyKey,
      mutationHash,
      documentType,
      ownerId,
      replaceFileId,
      file: {
        fileId,
        driveFileId: verified.driveFileId,
        mimeType: verified.mimeType,
        sizeBytes: verified.sizeBytes,
        checksum: verified.checksum,
        fileName: verified.fileName,
      },
      normalization: buildFileNormalizationMetadata(telemetry),
    });

    if (!replayed) {
      await repository
        .appendUploadAttempt(
          buildUploadAttemptMetric({
            attemptId: telemetry?.attemptId ?? randomUUID(),
            submissionId: record.submissionId,
            documentType,
            outcome: "COMPLETED",
            verifiedUploadSizeBytes: verified.sizeBytes,
            completeDurationMs: Date.now() - startedAt,
            telemetry,
          }),
        )
        .catch(reportUploadMetricFailure);
    }

    return NextResponse.json({ ok: true, fileId: summary.fileId, sizeBytes: verified.sizeBytes });
  } catch (error) {
    if (error instanceof PublicFileMutationRejectedError) {
      await discardIfOrphan(repository, record, verified.driveFileId);
      const { code } = REJECTION_HTTP[error.reason];
      return publicError(code, error.message, requestId);
    }
    if (error instanceof SubmissionIdempotencyConflictError) {
      await discardIfOrphan(repository, record, verified.driveFileId);
      return publicError(
        "IDEMPOTENCY_CONFLICT",
        "Yêu cầu hoàn tất tải lên bị xung đột.",
        requestId,
      );
    }

    /*
     * Ghi cơ sở dữ liệu hỏng (mất kết nối, constraint, hết kết nối pool) sau khi tệp đã nằm trên
     * Drive. Không dọn thì mỗi lần hỏng để lại một tệp mồ côi trong kho của quản trị viên, không
     * ai biết nó thuộc hồ sơ nào.
     *
     * Nhưng dọn sai còn tệ hơn nhiều: xóa mất tệp mà cơ sở dữ liệu **đã** nhận là hồ sơ trỏ vào
     * một Drive ID không còn tồn tại, và không cách nào lấy lại. Vì vậy chỉ xóa khi chắc chắn
     * chưa ai nhận, và mọi tình huống không chắc đều nghiêng về **giữ lại**.
     */
    await discardIfOrphan(repository, record, verified.driveFileId);
    throw error;
  }
}

