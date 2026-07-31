import { createHash } from "node:crypto";

import { NextResponse } from "next/server";

import { loadPublicIntakeEnvironment } from "@/modules/common/env";
import { isValidPublicIdempotencyKey } from "@/modules/public-intake/creation-idempotency";
import {
  getPublicIntakeRepository,
  SubmissionIdempotencyConflictError,
  SubmissionVersionConflictError,
} from "@/modules/public-intake/repository";
import {
  isEditable,
  isHeldByOfficer,
  publicError,
  publicPrivateJson,
  resolvePublicRequest,
} from "@/modules/public-intake/route-context";
import {
  TURNSTILE_HEADER,
  turnstileHostnames,
  verifyTurnstileToken,
} from "@/modules/public-intake/turnstile";
import type { IntakeDraft } from "@/modules/public-intake/types";
import {
  citizenIdsForLookup,
  validateCitizenRequiredFiles,
  validateCitizenSubmitDraft,
  type CitizenSubmitIssue,
} from "@/modules/public-intake/validation";
import { identityHmac, newTimelineEvent } from "@/modules/public-intake/workflow";

/**
 * Lỗi trả về chỉ gồm mã, đường dẫn trường và thông báo — **không** lặp lại giá trị người dân nhập,
 * để log/monitor không vô tình chứa CCCD hay số điện thoại.
 */
function issuesDetails(issues: readonly CitizenSubmitIssue[]) {
  return {
    issues: issues.map((item) => ({
      code: item.code,
      fieldPath: item.fieldPath,
      message: item.message,
    })),
  };
}

export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  const context = await resolvePublicRequest(request, { requireCsrf: true });
  if (context instanceof NextResponse) return context;

  const { record, requestId } = context;
  const rawIdempotencyKey = request.headers.get("idempotency-key");
  if (!isValidPublicIdempotencyKey(rawIdempotencyKey)) {
    return publicError("VALIDATION_FAILED", "Thiếu hoặc sai khóa chống gửi trùng.", requestId);
  }

  const environment = loadPublicIntakeEnvironment();
  let body: { draft?: unknown };
  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).length > environment.MAX_DRAFT_JSON_BYTES) {
      return publicError(
        "VALIDATION_FAILED",
        `Kích thước dữ liệu vượt quá giới hạn (${environment.MAX_DRAFT_JSON_BYTES} bytes).`,
        requestId,
      );
    }
    body = JSON.parse(text) as { draft?: unknown };
  } catch {
    return publicError("VALIDATION_FAILED", "Nội dung yêu cầu không hợp lệ.", requestId);
  }

  const draft = (body.draft ?? record.draft) as IntakeDraft | null;
  if (!draft) return publicError("VALIDATION_FAILED", "Chưa có dữ liệu kê khai.", requestId);

  const status: "SUBMITTED" | "RESUBMITTED" =
    record.status === "NEEDS_SUPPLEMENT" || record.status === "RESUBMITTED"
      ? "RESUBMITTED"
      : "SUBMITTED";
  const idempotencyKey = `PUBLIC_SUBMIT:${record.submissionId}:${rawIdempotencyKey.toLowerCase()}`;
  const mutationHash = createHash("sha256")
    .update(JSON.stringify({ submissionId: record.submissionId, status, draft }))
    .digest("hex");
  const repository = getPublicIntakeRepository();

  // Nếu lần gửi trước đã commit nhưng response bị mất, trả lại đúng kết quả mà không yêu cầu Turnstile mới.
  const replay = await repository.findStoredMutation(idempotencyKey, "PUBLIC_SUBMIT");
  if (replay) {
    if (replay.mutationHash !== mutationHash) {
      return publicError(
        "IDEMPOTENCY_CONFLICT",
        "Khóa chống gửi trùng đã được dùng cho nội dung khác.",
        requestId,
      );
    }
    const replayStatus = replay.response.status;
    return publicPrivateJson({
      receiptCode: record.receiptCode,
      status: replayStatus === "RESUBMITTED" ? "RESUBMITTED" : "SUBMITTED",
    });
  }

  // Tách khỏi `isEditable` để người dân nhận đúng lý do: hồ sơ đang có cán bộ xử lý thì bấm gửi
  // lại không phải "đã gửi rồi" mà là "đừng gửi nữa, cán bộ đang làm" (2026-07-29, Đợt 2A-3).
  if (isHeldByOfficer(record)) {
    return publicError(
      "INVALID_STATE",
      "Hồ sơ đang được cán bộ phường xử lý nên không gửi lại được. Cán bộ sẽ liên hệ nếu cần " +
        "thêm thông tin.",
      requestId,
    );
  }
  if (!isEditable(record)) {
    return publicError("INVALID_STATE", "Bản kê khai này đã được gửi.", requestId);
  }

  const turnstile = await verifyTurnstileToken({
    token: request.headers.get(TURNSTILE_HEADER),
    action: "submit",
    secretKey: environment.TURNSTILE_SECRET_KEY,
    expectedHostnames: turnstileHostnames(environment.APP_BASE_URL),
  });
  if (!turnstile.ok) {
    return publicError(
      "ACCESS_DENIED",
      "Chưa xác minh được thao tác này do người thật thực hiện. Tải lại trang và gửi lại.",
      requestId,
    );
  }

  // MỨC A (Public Intake V2): người dân chỉ bắt buộc số điện thoại, đồng ý, tên chủ sử dụng và
  // đủ ảnh. Toàn bộ dữ liệu PL3 sâu chuyển về gác cổng tiếp nhận chính thức
  // (`completionChecks`), không chặn ở đây nữa.
  const draftIssues = validateCitizenSubmitDraft(draft);
  if (draftIssues.length > 0) {
    return publicError(
      "VALIDATION_FAILED",
      "Bản kê khai còn thiếu thông tin bắt buộc.",
      requestId,
      issuesDetails(draftIssues),
    );
  }

  // Tài liệu kiểm trên file **máy chủ đã xác minh**, không tin trạng thái client.
  const files = await repository.listFiles(record.submissionId);
  const fileIssues = validateCitizenRequiredFiles(
    draft,
    files.map((file) => ({
      ownerId: file.ownerId,
      documentType: file.documentType,
      status: file.status,
    })),
  );
  if (fileIssues.length > 0) {
    return publicError(
      "UPLOAD_INCOMPLETE",
      "Cần đủ ảnh CCCD mặt trước/mặt sau cho từng cá nhân và ít nhất một ảnh Giấy chứng nhận.",
      requestId,
      issuesDetails(fileIssues),
    );
  }

  /*
   * Chỉ băm CCCD **hợp lệ**. Trước V2 mọi owner cá nhân đều được băm; khi CCCD được phép để trống,
   * băm chuỗi rỗng sẽ cho mọi hồ sơ không nhập CCCD cùng một khóa tra cứu — đụng nhau hàng loạt.
   *
   * Ghi cho CẢ `RESUBMITTED`, không riêng `SUBMITTED` (quyết định 2026-07-29). Ở MỨC A, CCCD là
   * tùy chọn, nên tình huống rất thường gặp là người dân gửi lần đầu không có CCCD, bị yêu cầu bổ
   * sung, rồi mới điền ở lần gửi lại — đúng lần mà điều kiện `=== "SUBMITTED"` cũ bỏ qua. Cùng dữ
   * liệu, cùng cửa vào, cùng người khai thì không có lý do gì phân biệt. Insert dùng
   * `on conflict do nothing` nên ghi lại ở mỗi lần gửi bổ sung là vô hại.
   */
  const pendingIdentityHmacs = citizenIdsForLookup(draft).map((identityNumber) =>
    identityHmac(environment.DATA_HASH_PEPPER, identityNumber),
  );

  try {
    await repository.submit({
      record,
      draft,
      status,
      timelineEvent: newTimelineEvent({
        eventType: status,
        label: status === "RESUBMITTED" ? "Đã gửi bổ sung" : "Đã gửi hồ sơ",
        actorDisplayName: "Người nộp",
      }),
      actorEmail: "PUBLIC",
      requestId,
      idempotencyKey,
      mutationHash,
      pendingIdentityHmacs,
    });
  } catch (error) {
    if (error instanceof SubmissionIdempotencyConflictError) {
      return publicError(
        "IDEMPOTENCY_CONFLICT",
        "Khóa chống gửi trùng đã được dùng cho nội dung khác.",
        requestId,
      );
    }
    if (error instanceof SubmissionVersionConflictError) {
      return publicError(
        "VERSION_CONFLICT",
        "Bản kê khai đã thay đổi ở một phiên khác. Vui lòng tải lại trước khi gửi.",
        requestId,
      );
    }
    throw error;
  }

  return publicPrivateJson({ receiptCode: record.receiptCode, status });
}
