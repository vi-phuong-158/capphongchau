import { NextResponse } from "next/server";

import { getPublicIntakeRepository } from "@/modules/public-intake/repository";
import {
  isEditable,
  publicError,
  resolvePublicRequest,
} from "@/modules/public-intake/route-context";
import type { IntakeDraft } from "@/modules/public-intake/types";
import { validateDraftForSubmit } from "@/modules/public-intake/validation";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  const context = await resolvePublicRequest(request, { requireCsrf: true });
  if (context instanceof NextResponse) {
    return context;
  }

  const { record, requestId } = context;
  if (!isEditable(record)) {
    return publicError("INVALID_STATE", "Bản kê khai này đã được gửi.", requestId);
  }

  let body: { draft?: unknown };
  try {
    body = (await request.json()) as { draft?: unknown };
  } catch {
    return publicError("VALIDATION_FAILED", "Nội dung yêu cầu không hợp lệ.", requestId);
  }

  const draft = (body.draft ?? record.draft) as IntakeDraft | null;
  if (!draft) {
    return publicError("VALIDATION_FAILED", "Chưa có dữ liệu kê khai.", requestId);
  }

  // Gửi chính thức là điểm dữ liệu rời khỏi tay người dân — kiểm đủ 15 trường Phụ lục 8 ở đây,
  // không tin việc trình duyệt đã kiểm theo từng bước.
  const draftError = validateDraftForSubmit(draft);
  if (draftError) {
    return publicError("VALIDATION_FAILED", draftError, requestId);
  }

  // Không tin dòng PUBLIC_FILES của client: đọc lại từ kho trước khi cho gửi.
  const files = await getPublicIntakeRepository().listFiles(record.submissionId);
  const hasCitizenId = files.some((file) => file.documentType === "CITIZEN_ID_FRONT");
  const certificateCount = files.filter((file) => file.documentType === "CERTIFICATE").length;

  if (!hasCitizenId || certificateCount < 1) {
    return publicError(
      "UPLOAD_INCOMPLETE",
      "Cần đúng một ảnh CCCD mặt trước và ít nhất một ảnh Giấy chứng nhận.",
      requestId,
    );
  }

  await getPublicIntakeRepository().submit(record, draft);

  return NextResponse.json({ receiptCode: record.receiptCode, status: "SUBMITTED" });
}
