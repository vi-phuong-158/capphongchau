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

  let body: { driveFileId?: unknown; documentType?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return publicError("VALIDATION_FAILED", "Nội dung yêu cầu không hợp lệ.", requestId);
  }

  const driveFileId = typeof body.driveFileId === "string" ? body.driveFileId : "";
  const documentType = body.documentType;
  if (!driveFileId || (documentType !== "CITIZEN_ID_FRONT" && documentType !== "CERTIFICATE")) {
    return publicError("VALIDATION_FAILED", "Thiếu thông tin tệp vừa tải lên.", requestId);
  }

  const environment = loadPublicIntakeEnvironment();
  const storage = getPublicIntakeStorage();

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

  await getPublicIntakeRepository().appendFile({
    fileId: randomUUID(),
    submissionId: record.submissionId,
    documentType,
    driveFileId: verified.driveFileId,
    mimeType: verified.mimeType,
    sizeBytes: verified.sizeBytes,
    checksum: verified.checksum,
  });

  // Không trả Drive ID ra ngoài — người dân không cần và không được biết.
  return NextResponse.json({ ok: true, sizeBytes: verified.sizeBytes });
}
