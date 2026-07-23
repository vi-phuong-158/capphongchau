import { NextResponse } from "next/server";

import { loadPublicIntakeEnvironment } from "@/modules/common/env";
import { getPublicIntakeRepository } from "@/modules/public-intake/repository";
import {
  isEditable,
  publicError,
  resolvePublicRequest,
} from "@/modules/public-intake/route-context";
import {
  TURNSTILE_HEADER,
  turnstileHostname,
  verifyTurnstileToken,
} from "@/modules/public-intake/turnstile";
import { requiresCitizenId, type IntakeDraft } from "@/modules/public-intake/types";
import { validateDraftForSubmit } from "@/modules/public-intake/validation";
import { identityHmac, newTimelineEvent } from "@/modules/public-intake/workflow";

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

  // Gửi chính thức cần token Turnstile mới, không dùng lại token của bước tạo nháp: đây là hành
  // động sinh ra nhiều dòng Sheets nhất trong toàn luồng công khai.
  const environment = loadPublicIntakeEnvironment();
  const turnstile = await verifyTurnstileToken({
    token: request.headers.get(TURNSTILE_HEADER),
    action: "submit",
    secretKey: environment.TURNSTILE_SECRET_KEY,
    expectedHostname: turnstileHostname(environment.APP_BASE_URL),
  });
  if (!turnstile.ok) {
    return publicError(
      "ACCESS_DENIED",
      "Chưa xác minh được thao tác này do người thật thực hiện. Tải lại trang và gửi lại.",
      requestId,
    );
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

  // `file_summary_json` chỉ là cache phục vụ giao diện và có thể chậm một nhịp khi nhiều lượt
  // upload hoàn tất gần nhau. Chỉ PUBLIC_FILES là nguồn thật để quyết định có được nộp hay không.
  const files = await getPublicIntakeRepository().listFiles(record.submissionId);
  // Người trên GCN đã mất / đã sang tên (hasDistinctCurrentUser) được miễn ảnh CCCD; chỉ những chủ
  // còn phải tự chứng minh danh tính mới cần đủ cặp ảnh.
  const identityOwners = draft.owners.filter(
    (owner) => requiresCitizenId(owner.ownerType) && !owner.hasDistinctCurrentUser,
  );
  const hasEveryCitizenIdPair = identityOwners.every((owner) =>
    ["CITIZEN_ID_FRONT", "CITIZEN_ID_BACK"].every((documentType) =>
      files.some((file) => file.ownerId === owner.id && file.documentType === documentType),
    ),
  );
  const certificateCount = files.filter((file) => file.documentType === "CERTIFICATE").length;

  if (!hasEveryCitizenIdPair || certificateCount < 1) {
    return publicError(
      "UPLOAD_INCOMPLETE",
      "Cần đủ ảnh CCCD mặt trước/mặt sau cho từng cá nhân và ít nhất một ảnh Giấy chứng nhận.",
      requestId,
    );
  }

  const repository = getPublicIntakeRepository();
  const status = record.status === "NEEDS_SUPPLEMENT" ? "RESUBMITTED" : "SUBMITTED";
  await repository.submit(record, draft, status);
  if (status === "RESUBMITTED") {
    await repository.resolveOpenSupplementRequest(record.submissionId);
  }
  if (status === "SUBMITTED") {
    await Promise.all(
      identityOwners.map((owner) =>
        repository.appendPendingIdentityIndex({
          record,
          citizenIdHmac: identityHmac(environment.DATA_HASH_PEPPER, owner.identityNumber),
        }),
      ),
    );
  }
  await Promise.all([
    repository.appendTimelineEvent(
      record.submissionId,
      newTimelineEvent({
        eventType: status,
        label: status === "RESUBMITTED" ? "Đã gửi bổ sung" : "Đã gửi hồ sơ",
        actorDisplayName: "Người nộp",
      }),
      "PUBLIC",
      requestId,
    ),
    repository.appendAudit({
      actorEmail: "PUBLIC",
      action:
        status === "RESUBMITTED" ? "PUBLIC_SUBMISSION_RESUBMITTED" : "PUBLIC_SUBMISSION_SUBMITTED",
      entityId: record.submissionId,
      requestId,
    }),
  ]);

  return NextResponse.json({ receiptCode: record.receiptCode, status });
}
