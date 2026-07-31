import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { loadPublicIntakeEnvironment } from "@/modules/common/env";
import { extensionFromMimeType } from "@/modules/public-intake/file-naming";
import { getPublicIntakeRepository } from "@/modules/public-intake/repository";
import {
  isEditable,
  publicError,
  publicPrivateJson,
  resolvePublicRequest,
} from "@/modules/public-intake/route-context";
import { canonicalImageMimeType } from "@/modules/public-intake/image-format";
import { getPublicIntakeStorage } from "@/modules/public-intake/storage";
import {
  ensureSubmissionFolderReady,
  SubmissionFolderBusyError,
  SubmissionFolderUnavailableError,
} from "@/modules/public-intake/submission-folder";
import { requiresCitizenId } from "@/modules/public-intake/types";
import {
  MAX_CERTIFICATE_PHOTOS,
  SUBMISSION_BYTE_BUDGET,
} from "@/modules/public-intake/upload-commit";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  const context = await resolvePublicRequest(request, { requireCsrf: true });
  if (context instanceof NextResponse) {
    return context;
  }

  const { record, requestId } = context;
  if (!isEditable(record)) {
    return publicError(
      "INVALID_STATE",
      "Bản kê khai đang bị khóa, không tải thêm tệp được.",
      requestId,
    );
  }

  let body: {
    documentType?: unknown;
    ownerId?: unknown;
    replaceFileId?: unknown;
    fileName?: unknown;
    mimeType?: unknown;
    sizeBytes?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return publicError("VALIDATION_FAILED", "Nội dung yêu cầu không hợp lệ.", requestId);
  }

  const documentType = body.documentType;
  if (
    documentType !== "CITIZEN_ID_FRONT" &&
    documentType !== "CITIZEN_ID_BACK" &&
    documentType !== "CERTIFICATE"
  ) {
    return publicError("VALIDATION_FAILED", "Loại giấy tờ không hợp lệ.", requestId);
  }

  // Quy bí danh (`image/jpg`) và trường hợp trình duyệt không khai được loại về tên chuẩn trước
  // khi kiểm. Ảnh nhận qua Zalo/Messenger thường rơi vào hai trường hợp này dù vẫn là JPEG hợp lệ.
  const mimeType = canonicalImageMimeType(
    typeof body.mimeType === "string" ? body.mimeType : "",
    typeof body.fileName === "string" ? body.fileName : "",
  );
  if (!mimeType) {
    return publicError(
      "VALIDATION_FAILED",
      "Chỉ chấp nhận ảnh JPEG, PNG, WebP hoặc HEIC.",
      requestId,
    );
  }

  const sizeBytes = typeof body.sizeBytes === "number" ? body.sizeBytes : 0;
  const environment = loadPublicIntakeEnvironment();
  const maxBytes = environment.MAX_UPLOAD_MB * 1024 * 1024;
  if (!Number.isInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes > maxBytes) {
    return publicError(
      "SIZE_BUDGET_EXCEEDED",
      `Mỗi ảnh không vượt quá ${environment.MAX_UPLOAD_MB} MB.`,
      requestId,
    );
  }

  // Ràng buộc số lượng và ngân sách kiểm ở server, không tin phía trình duyệt.
  const files = record.fileSummaries.length
    ? record.fileSummaries.filter((file) => file.status === "UPLOADED")
    : await getPublicIntakeRepository().listFiles(record.submissionId);
  const ownerId = typeof body.ownerId === "string" ? body.ownerId : "";
  const replaceFileId = typeof body.replaceFileId === "string" ? body.replaceFileId : "";
  const replaceTarget = replaceFileId
    ? files.find((file) => file.fileId === replaceFileId)
    : undefined;
  if (replaceFileId && !replaceTarget) {
    return publicError("VALIDATION_FAILED", "Ảnh cần thay không hợp lệ.", requestId);
  }
  const usedBytes =
    files.reduce((sum, file) => sum + file.sizeBytes, 0) - (replaceTarget?.sizeBytes ?? 0);
  if (usedBytes + sizeBytes > SUBMISSION_BYTE_BUDGET) {
    return publicError(
      "SIZE_BUDGET_EXCEEDED",
      "Tổng dung lượng hồ sơ đã vượt giới hạn.",
      requestId,
    );
  }

  if (record.status === "NEEDS_SUPPLEMENT") {
    const supplement = await getPublicIntakeRepository().getOpenSupplementRequest(
      record.submissionId,
    );
    const allowed = supplement?.items.some(
      (item) =>
        item.itemType === "FILE" &&
        item.documentType === documentType &&
        (!item.targetEntityId || item.targetEntityId === ownerId),
    );
    if (!allowed) {
      return publicError(
        "ACCESS_DENIED",
        "Tài liệu này không nằm trong nội dung cán bộ yêu cầu bổ sung.",
        requestId,
      );
    }
  }
  const identityImage = documentType === "CITIZEN_ID_FRONT" || documentType === "CITIZEN_ID_BACK";
  if (identityImage) {
    // Một số nháp legacy đã được nhập trước khi schema có cặp CCCD theo từng chủ. Không để
    // dữ liệu cũ thiếu `owners` biến thành lỗi 500; migration sẽ bổ sung nháp đó, còn request
    // đang dùng phiên cũ nhận lỗi có thể hiểu và tải lại trang.
    const owners = record.draft?.owners;
    if (!Array.isArray(owners)) {
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
    const existing = files.find(
      (file) => file.ownerId === ownerId && file.documentType === documentType,
    );
    if (existing && existing.fileId !== replaceFileId) {
      return publicError(
        "INVALID_STATE",
        "Mỗi người chỉ có một ảnh cho từng mặt CCCD. Dùng chức năng thay ảnh nếu cần đổi.",
        requestId,
      );
    }
    if (!existing && replaceFileId) {
      return publicError("VALIDATION_FAILED", "Ảnh CCCD cần thay không hợp lệ.", requestId);
    }
  } else {
    if (replaceTarget && replaceTarget.documentType !== "CERTIFICATE") {
      return publicError(
        "VALIDATION_FAILED",
        "Ảnh Giấy chứng nhận cần thay không hợp lệ.",
        requestId,
      );
    }
    if (
      !replaceFileId &&
      files.filter((file) => file.documentType === "CERTIFICATE").length >= MAX_CERTIFICATE_PHOTOS
    ) {
      return publicError(
        "INVALID_STATE",
        `Tối đa ${MAX_CERTIFICATE_PHOTOS} ảnh Giấy chứng nhận.`,
        requestId,
      );
    }
  }

  // Tên tệp trong kho do **máy chủ** đặt, không ghép bất cứ mảnh nào của tên client gửi lên.
  //
  // Tên do máy ảnh sinh hoặc do người dân đặt rất hay mang số CCCD, họ tên, ngày giờ, đôi khi cả
  // toạ độ; tên đó đi thẳng vào tên tệp trên Drive và vào cột `public_files.file_name`. Trình
  // duyệt của app đã gửi tên trung tính, nhưng đó là biện pháp phía client — ranh giới tin cậy
  // nằm ở đây, và bất kỳ ai gọi thẳng endpoint cũng gửi được tên tùy ý.
  //
  // `body.fileName` vẫn được đọc ở trên để suy ra loại ảnh khi trình duyệt không khai được
  // `mimeType`; chỉ phần mở rộng đã kiểm mới được dùng lại, không phải phần thân tên.
  const fileName = `${documentType}-${Date.now()}-${randomUUID().slice(0, 8)}.${extensionFromMimeType(mimeType)}`;

  let folderId: string;
  try {
    folderId = await ensureSubmissionFolderReady(record);
  } catch (error) {
    if (
      error instanceof SubmissionFolderBusyError ||
      error instanceof SubmissionFolderUnavailableError
    ) {
      const response = publicError(
        "SERVICE_UNAVAILABLE",
        "Kho ảnh đang được chuẩn bị. Vui lòng thử lại sau ít giây.",
        requestId,
      );
      response.headers.set(
        "Retry-After",
        String(error instanceof SubmissionFolderBusyError ? error.retryAfterSeconds : 2),
      );
      return response;
    }
    throw error;
  }

  const session = await getPublicIntakeStorage().createUploadSession({
    folderId,
    fileName,
    mimeType,
    sizeBytes,
    // Lấy từ URL của chính request, không lấy từ header `Origin` do client gửi — tránh
    // phản chiếu origin của bên thứ ba vào phiên upload.
    browserOrigin: new URL(request.url).origin,
  });

  // URL phiên là bí mật: trả cho đúng trình duyệt đang giữ cookie, không ghi vào log hay audit.
  // Trả kèm loại đã chuẩn hóa: lệnh PUT của trình duyệt phải khai đúng loại đã đăng ký với phiên,
  // nếu không Google từ chối phần thân tệp.
  return publicPrivateJson({ uploadUrl: session.uploadUrl, mimeType });
}
