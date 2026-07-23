import { NextResponse } from "next/server";

import { getPublicIntakeRepository } from "@/modules/public-intake/repository";
import {
  isEditable,
  publicError,
  resolvePublicRequest,
} from "@/modules/public-intake/route-context";
import type { IntakeDraft } from "@/modules/public-intake/types";
import { validateDraftForSave } from "@/modules/public-intake/validation";
import {
  completionChecklist,
  PUBLIC_STATUS_LABELS,
  unauthorizedSupplementChanges,
} from "@/modules/public-intake/workflow";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<NextResponse> {
  const context = await resolvePublicRequest(request, { requireCsrf: false });
  if (context instanceof NextResponse) {
    return context;
  }

  const { record } = context;
  const repository = getPublicIntakeRepository();
  // Không dùng cache tóm tắt khi khôi phục nháp: nếu cache bị trễ sau upload, người dân sẽ thấy
  // thiếu giấy tờ dù PUBLIC_FILES đã có đủ. Kho file là nguồn thật.
  const storedFiles = (await repository.listFiles(record.submissionId, true)).map((file) => ({
    fileId: file.fileId,
    ownerId: file.ownerId,
    documentType: file.documentType,
    status: file.status,
    sizeBytes: file.sizeBytes,
    checksum: file.checksum,
    createdAt: file.createdAt ?? "",
    updatedAt: file.updatedAt ?? "",
  }));
  const [storedTimeline, supplementRequest] = await Promise.all([
    repository.listTimeline(record.submissionId),
    repository.getOpenSupplementRequest(record.submissionId),
  ]);
  const timeline = storedTimeline.length
    ? storedTimeline
    : [
        {
          eventId: `initial-${record.submissionId}`,
          eventType: record.status,
          label: PUBLIC_STATUS_LABELS[record.status],
          actorDisplayName: "Hệ thống",
          message: "",
          occurredAt: record.updatedAt || record.createdAt,
        },
      ];
  return NextResponse.json({
    receiptCode: record.receiptCode,
    status: record.status,
    statusLabel: PUBLIC_STATUS_LABELS[record.status],
    updatedAt: record.updatedAt,
    officialCaseId: record.officialCaseId || null,
    version: record.version,
    draft: record.draft,
    files: storedFiles.map((file) => ({
      fileId: file.fileId,
      ownerId: file.ownerId,
      ownerDisplayName:
        record.draft?.owners.find((owner) => owner.id === file.ownerId)?.fullName || "",
      documentType: file.documentType,
      status: file.status,
      sizeBytes: file.sizeBytes,
      uploadedAt: file.createdAt,
    })),
    checklist: completionChecklist(record.draft, storedFiles),
    supplementRequest,
    timeline,
  });
}

/** Lưu nháp. Bản khai đã gửi thì khóa cho tới khi cán bộ yêu cầu bổ sung. */
export async function PATCH(request: Request): Promise<NextResponse> {
  const context = await resolvePublicRequest(request, { requireCsrf: true });
  if (context instanceof NextResponse) {
    return context;
  }

  const { record, requestId } = context;
  if (!isEditable(record)) {
    return publicError(
      "INVALID_STATE",
      "Bản kê khai đã gửi và đang được cán bộ xử lý nên không sửa được.",
      requestId,
    );
  }

  let environment;
  try {
    const { loadPublicIntakeEnvironment } = await import("@/modules/common/env");
    environment = loadPublicIntakeEnvironment();
  } catch {
    return publicError("INTERNAL_ERROR", "Hệ thống chưa sẵn sàng.", requestId);
  }

  let body: { draft?: unknown; version?: unknown };
  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).length > environment.MAX_DRAFT_JSON_BYTES) {
      return publicError(
        "VALIDATION_FAILED",
        `Kích thước dữ liệu vượt quá giới hạn (${environment.MAX_DRAFT_JSON_BYTES} bytes).`,
        requestId,
      );
    }
    body = JSON.parse(text) as { draft?: unknown; version?: unknown };
  } catch {
    return publicError("VALIDATION_FAILED", "Nội dung yêu cầu không hợp lệ.", requestId);
  }

  if (!body.draft || typeof body.draft !== "object") {
    return publicError("VALIDATION_FAILED", "Thiếu dữ liệu bản kê khai.", requestId);
  }

  // Nháp được lưu từng bước nên chưa đầy đủ, nhưng trường nào đã có thì phải đúng định dạng —
  // không để dữ liệu rác lọt vào kho rồi mới phát hiện lúc cán bộ duyệt.
  const draftError = validateDraftForSave(body.draft as IntakeDraft);
  if (draftError) {
    return publicError("VALIDATION_FAILED", draftError, requestId);
  }

  if (record.status === "NEEDS_SUPPLEMENT") {
    const supplement = await getPublicIntakeRepository().getOpenSupplementRequest(
      record.submissionId,
    );
    if (!record.draft || !supplement) {
      return publicError(
        "INVALID_STATE",
        "Chưa có yêu cầu bổ sung hợp lệ. Vui lòng liên hệ cán bộ phường.",
        requestId,
      );
    }
    if (
      unauthorizedSupplementChanges(record.draft, body.draft as IntakeDraft, supplement.items)
        .length
    ) {
      return publicError(
        "ACCESS_DENIED",
        "Chỉ được sửa các nội dung cán bộ đã yêu cầu bổ sung.",
        requestId,
      );
    }
  }

  // `version` chỉ để phát hiện một thiết bị thứ hai đang sửa cùng bản khai. Trong cùng phiên
  // thì ghi đè theo lần lưu mới nhất, tránh 409 giả trên mạng yếu (PLAN_NL §8.4).
  if (typeof body.version === "number" && body.version < record.version - 1) {
    return publicError(
      "VERSION_CONFLICT",
      "Bản kê khai này đang được mở ở một thiết bị khác. Tải lại trang để lấy bản mới nhất.",
      requestId,
    );
  }

  const nextVersion = await getPublicIntakeRepository().saveDraft(
    record,
    body.draft as IntakeDraft,
    record.status,
  );

  return NextResponse.json({ version: nextVersion, savedAt: new Date().toISOString() });
}
