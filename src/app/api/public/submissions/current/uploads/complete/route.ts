import { createHash, randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { loadPublicIntakeEnvironment } from "@/modules/common/env";
import { isValidPublicIdempotencyKey } from "@/modules/public-intake/creation-idempotency";
import {
  getPublicIntakeRepository,
  SubmissionIdempotencyConflictError,
} from "@/modules/public-intake/repository";
import {
  isEditable,
  publicError,
  resolvePublicRequest,
} from "@/modules/public-intake/route-context";
import { getPublicIntakeStorage, UploadVerificationError } from "@/modules/public-intake/storage";
import { requiresCitizenId } from "@/modules/public-intake/types";
import {
  buildFileNormalizationMetadata,
  buildUploadAttemptMetric,
  clientUploadTelemetrySchema,
  reportUploadMetricFailure,
} from "@/modules/public-intake/upload-metrics";

export const runtime = "nodejs";

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

  // Replay phải đứng trước mọi kiểm tra trạng thái của một lượt upload mới. Sau lần đầu commit,
  // chính file vừa adopt làm các kiểm tra "đã có ảnh" bên dưới thất bại; cleanup khi đó sẽ xóa
  // bằng chứng mà DB đang trỏ tới nếu response đầu bị mất.
  const replay = await repository.findStoredMutation(idempotencyKey, "PUBLIC_UPLOAD_COMPLETE");
  if (replay) {
    if (replay.mutationHash !== mutationHash) {
      await discardIfOrphan(repository, record, driveFileId);
      return publicError(
        "IDEMPOTENCY_CONFLICT",
        "Yêu cầu hoàn tất tải lên bị xung đột.",
        requestId,
      );
    }
    const replayFileId = replay.response.fileId;
    const replaySizeBytes = replay.response.sizeBytes;
    if (typeof replayFileId === "string" && typeof replaySizeBytes === "number") {
      return NextResponse.json({ ok: true, fileId: replayFileId, sizeBytes: replaySizeBytes });
    }
    return publicError("INTERNAL_ERROR", "Kết quả tải lên đã lưu không hợp lệ.", requestId);
  }

  if (!isEditable(record)) {
    await discardIfOrphan(repository, record, driveFileId);
    return publicError("INVALID_STATE", "Bản kê khai đang bị khóa.", requestId);
  }
  if (!record.driveFolderId) {
    return publicError(
      "INVALID_STATE",
      "Thư mục tải ảnh chưa sẵn sàng. Vui lòng tải lại ảnh từ đầu.",
      requestId,
    );
  }
  const driveFolderId = record.driveFolderId;

  const identityImage = documentType === "CITIZEN_ID_FRONT" || documentType === "CITIZEN_ID_BACK";
  if (identityImage) {
    const owners = record.draft?.owners;
    if (!Array.isArray(owners)) {
      await discardIfOrphan(repository, record, driveFileId);
      return publicError(
        "INVALID_STATE",
        "Dữ liệu bản kê khai chưa đầy đủ. Tải lại trang và thử lại.",
        requestId,
      );
    }
    const owner = owners.find((candidate) => candidate.id === ownerId);
    if (!owner || !requiresCitizenId(owner.ownerType)) {
      return publicError("VALIDATION_FAILED", "Chủ sử dụng của ảnh CCCD không hợp lệ.", requestId);
    }
    // Kiểm tra thay ảnh phải đọc nguồn thật, không dùng cache có thể bị trễ sau upload trước đó.
    const currentFiles = await repository.listFiles(record.submissionId);
    const existing = currentFiles.find(
      (file) => file.ownerId === ownerId && file.documentType === documentType,
    );
    if ((existing && existing.fileId !== replaceFileId) || (!existing && replaceFileId)) {
      await discardIfOrphan(repository, record, driveFileId);
      return publicError("INVALID_STATE", "Trạng thái thay ảnh CCCD không còn hợp lệ.", requestId);
    }
  } else if (replaceFileId) {
    const currentFiles = await repository.listFiles(record.submissionId);
    const existing = currentFiles.find(
      (file) =>
        file.fileId === replaceFileId &&
        file.documentType === "CERTIFICATE" &&
        file.status === "UPLOADED",
    );
    if (!existing) {
      await discardIfOrphan(repository, record, driveFileId);
      return publicError(
        "INVALID_STATE",
        "Ảnh Giấy chứng nhận cần thay không còn hợp lệ.",
        requestId,
      );
    }
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
      // Tệp không đạt phải rời khỏi Drive ngay, không để tích rác trong kho của quản trị viên.
      await discardIfOrphan(repository, record, driveFileId);
      return publicError("VALIDATION_FAILED", error.message, requestId);
    }
    throw error;
  }

  const fileId = randomUUID();
  try {
    const summary = await repository.appendFile(
      {
        fileId,
        submissionId: record.submissionId,
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
      },
      buildFileNormalizationMetadata(telemetry),
    );

    // Số đo là việc phụ: bảng metric hỏng không được làm hỏng một lượt tải đã thành công. Người
    // dân đã chụp, đã chờ tải xong; trả lỗi ở đây là bắt họ làm lại vì chuyện không liên quan.
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

    // Không trả Drive ID ra ngoài — người dân không cần và không được biết.
    return NextResponse.json({ ok: true, fileId: summary.fileId, sizeBytes: verified.sizeBytes });
  } catch (error) {
    if (error instanceof SubmissionIdempotencyConflictError) {
      // Xung đột idempotency nghĩa là khóa này đã dùng cho nội dung khác — tệp vừa xác minh
      // KHÔNG phải tệp đã được nhận, nhưng cũng không chắc chưa ai nhận nó. Đi qua cùng một cửa
      // dọn dẹp an toàn bên dưới thay vì xóa thẳng.
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

/**
 * Xóa tệp trên Drive **chỉ khi** cả hai điều kiện dưới đây cùng đúng.
 *
 * 1. Chưa hồ sơ nào nhận tệp này (`isDriveFileAdopted`, hỏi toàn bảng chứ không lọc theo hồ sơ
 *    đang gọi).
 * 2. Tệp nằm đúng trong thư mục Drive của chính hồ sơ đang gọi.
 *
 * Vì sao cần điều kiện 2: phần lớn nhánh gọi hàm này truyền thẳng `body.driveFileId` — dữ liệu
 * client, chưa qua `verifyUploadedFile`. Chỉ với điều kiện 1, một `driveFileId` trỏ sang thư mục
 * hộ khác mà chưa kịp `complete` vẫn thỏa "chưa ai nhận" và sẽ bị xóa. Hai điều kiện cộng lại thu
 * hẹp phạm vi xóa về đúng những gì hộ dân đang gọi tự tải lên.
 *
 * `.catch(() => true)` / `.catch(() => false)` không phải là nuốt lỗi cho gọn: hỏi mà không hỏi
 * được thì mặc định coi như **đã nhận** và **không xác nhận được thư mục**, tức là không xóa. Sai
 * theo hướng để lại một tệp thừa thì có `scripts/audit-orphan-public-files.ts` dọn sau; sai theo
 * hướng kia thì mất bằng chứng của hồ sơ, vĩnh viễn.
 */
async function discardIfOrphan(
  repository: ReturnType<typeof getPublicIntakeRepository>,
  record: { readonly driveFolderId: string | null },
  driveFileId: string,
): Promise<void> {
  if (!driveFileId || !record.driveFolderId) return;
  const adopted = await repository.isDriveFileAdopted(driveFileId).catch(() => true);
  if (adopted) return;

  const storage = getPublicIntakeStorage();
  const ownedByCaller = await storage
    .isFileInFolder(driveFileId, record.driveFolderId)
    .catch(() => false);
  if (!ownedByCaller) return;

  await storage.discardFile(driveFileId).catch(() => undefined);
}
