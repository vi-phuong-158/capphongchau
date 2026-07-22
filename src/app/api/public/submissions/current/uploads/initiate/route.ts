import { NextResponse } from "next/server";

import { loadPublicIntakeEnvironment } from "@/modules/common/env";
import { getPublicIntakeRepository } from "@/modules/public-intake/repository";
import {
  isEditable,
  publicError,
  resolvePublicRequest,
} from "@/modules/public-intake/route-context";
import { canonicalImageMimeType } from "@/modules/public-intake/image-format";
import { getPublicIntakeStorage } from "@/modules/public-intake/storage";
import { requiresCitizenId } from "@/modules/public-intake/types";

export const runtime = "nodejs";

const MAX_CERTIFICATE_PHOTOS = 10;
/** Ngân sách byte mỗi bản kê khai — chống lạm dụng trên endpoint ẩn danh (PLAN_NL §6.1). */
const SUBMISSION_BYTE_BUDGET = 150 * 1024 * 1024;

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
  const files = await getPublicIntakeRepository().listFiles(record.submissionId);
  const usedBytes = files.reduce((sum, file) => sum + file.sizeBytes, 0);
  if (usedBytes + sizeBytes > SUBMISSION_BYTE_BUDGET) {
    return publicError(
      "SIZE_BUDGET_EXCEEDED",
      "Tổng dung lượng hồ sơ đã vượt giới hạn.",
      requestId,
    );
  }

  const ownerId = typeof body.ownerId === "string" ? body.ownerId : "";
  const replaceFileId = typeof body.replaceFileId === "string" ? body.replaceFileId : "";
  const identityImage = documentType === "CITIZEN_ID_FRONT" || documentType === "CITIZEN_ID_BACK";
  if (identityImage) {
    const owner = record.draft?.owners.find((candidate) => candidate.id === ownerId);
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
  } else if (
    files.filter((file) => file.documentType === "CERTIFICATE").length >= MAX_CERTIFICATE_PHOTOS
  ) {
    return publicError(
      "INVALID_STATE",
      `Tối đa ${MAX_CERTIFICATE_PHOTOS} ảnh Giấy chứng nhận.`,
      requestId,
    );
  }

  const fileName =
    typeof body.fileName === "string" && body.fileName.trim()
      ? `${documentType}-${Date.now()}-${body.fileName.trim().slice(-60)}`
      : `${documentType}-${Date.now()}`;

  const session = await getPublicIntakeStorage().createUploadSession({
    folderId: record.driveFolderId,
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
  return NextResponse.json({ uploadUrl: session.uploadUrl, mimeType });
}
