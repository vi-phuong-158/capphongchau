import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { loadPublicIntakeEnvironment } from "@/modules/common/env";
import { getPublicIntakeRepository } from "@/modules/public-intake/repository";
import {
  isEditable,
  publicError,
  resolvePublicRequest,
} from "@/modules/public-intake/route-context";
import { getPublicIntakeStorage, UploadVerificationError } from "@/modules/public-intake/storage";
import { requiresCitizenId } from "@/modules/public-intake/types";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  const context = await resolvePublicRequest(request, { requireCsrf: true });
  if (context instanceof NextResponse) {
    return context;
  }

  const { record, requestId } = context;
  if (!isEditable(record)) {
    return publicError("INVALID_STATE", "Bản kê khai đang bị khóa.", requestId);
  }

  let body: {
    driveFileId?: unknown;
    documentType?: unknown;
    ownerId?: unknown;
    replaceFileId?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return publicError("VALIDATION_FAILED", "Nội dung yêu cầu không hợp lệ.", requestId);
  }

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
  const ownerId = typeof body.ownerId === "string" ? body.ownerId : "";
  const replaceFileId = typeof body.replaceFileId === "string" ? body.replaceFileId : "";
  const identityImage = documentType === "CITIZEN_ID_FRONT" || documentType === "CITIZEN_ID_BACK";
  if (identityImage) {
    const owners = record.draft?.owners;
    if (!Array.isArray(owners)) {
      await storage.discardFile(driveFileId).catch(() => undefined);
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
    const currentFiles = await getPublicIntakeRepository().listFiles(record.submissionId);
    const existing = currentFiles.find(
      (file) => file.ownerId === ownerId && file.documentType === documentType,
    );
    if ((existing && existing.fileId !== replaceFileId) || (!existing && replaceFileId)) {
      await storage.discardFile(driveFileId).catch(() => undefined);
      return publicError("INVALID_STATE", "Trạng thái thay ảnh CCCD không còn hợp lệ.", requestId);
    }
  } else if (replaceFileId) {
    const currentFiles = await getPublicIntakeRepository().listFiles(record.submissionId);
    const existing = currentFiles.find(
      (file) =>
        file.fileId === replaceFileId &&
        file.documentType === "CERTIFICATE" &&
        file.status === "UPLOADED",
    );
    if (!existing) {
      await storage.discardFile(driveFileId).catch(() => undefined);
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
      expectedFolderId: record.driveFolderId,
      maxBytes: environment.MAX_UPLOAD_MB * 1024 * 1024,
    });
  } catch (error) {
    if (error instanceof UploadVerificationError) {
      // Tệp không đạt phải rời khỏi Drive ngay, không để tích rác trong kho của quản trị viên.
      await storage.discardFile(driveFileId).catch(() => undefined);
      return publicError("VALIDATION_FAILED", error.message, requestId);
    }
    throw error;
  }

  const fileId = randomUUID();
  await getPublicIntakeRepository().appendFile(
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
  );
  if (replaceFileId) {
    await getPublicIntakeRepository().markFileReplaced(record.submissionId, replaceFileId);
  }

  // Không trả Drive ID ra ngoài — người dân không cần và không được biết.
  return NextResponse.json({ ok: true, fileId, sizeBytes: verified.sizeBytes });
}
