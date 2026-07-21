import { NextResponse } from "next/server";

import { getPublicIntakeRepository } from "@/modules/public-intake/repository";
import {
  isEditable,
  publicError,
  resolvePublicRequest,
} from "@/modules/public-intake/route-context";
import type { IntakeDraft } from "@/modules/public-intake/types";
import { validateDraftForSave } from "@/modules/public-intake/validation";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<NextResponse> {
  const context = await resolvePublicRequest(request, { requireCsrf: false });
  if (context instanceof NextResponse) {
    return context;
  }

  const { record } = context;
  return NextResponse.json({
    receiptCode: record.receiptCode,
    status: record.status,
    version: record.version,
    draft: record.draft,
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

  let body: { draft?: unknown; version?: unknown };
  try {
    body = (await request.json()) as { draft?: unknown; version?: unknown };
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
