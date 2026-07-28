import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { getPublicIntakeRepository } from "@/modules/public-intake/repository";
import { publicError, resolvePublicRequest } from "@/modules/public-intake/route-context";
import {
  buildUploadAttemptMetric,
  reportUploadMetricFailure,
  uploadFailureMetricSchema,
} from "@/modules/public-intake/upload-metrics";

export const runtime = "nodejs";

/**
 * Số đo cho các lượt tải **không** thành công.
 *
 * Vì sao cần endpoint riêng thay vì gộp vào `complete`: lượt hỏng thì không có `complete` nào để
 * bám vào. Mà chính những lượt đó mới là dữ liệu quan trọng nhất — nếu chỉ đo lượt thành công thì
 * mọi biểu đồ đều đẹp, kể cả khi một nửa số hộ dân không tải nổi ảnh nào lên.
 *
 * Endpoint này **luôn** trả 204, kể cả khi nội dung sai định dạng. Không phải để giấu lỗi mà vì
 * nó không có tác dụng gì với người dùng: client bắn số đo rồi đi tiếp, không đọc kết quả, và một
 * mã lỗi ở đây chỉ có thể làm hỏng luồng đang chạy chứ không sửa được gì. Nội dung sai bị bỏ
 * lặng lẽ; kiểm soát thật nằm ở `strict()` schema và ở các CHECK constraint trong migration.
 *
 * Vẫn giữ nguyên phiên + CSRF như mọi endpoint ghi khác: không để bảng số đo thành nơi bất kỳ ai
 * cũng bơm hàng loạt bản ghi rác vào cơ sở dữ liệu.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const context = await resolvePublicRequest(request, { requireCsrf: true });
  if (context instanceof NextResponse) return context;

  const { record, requestId } = context;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return publicError("VALIDATION_FAILED", "Nội dung yêu cầu không hợp lệ.", requestId);
  }

  const parsed = uploadFailureMetricSchema.safeParse(raw);
  if (!parsed.success) {
    // Không trả chi tiết lỗi Zod: đường dẫn trường của một payload do client dựng không nói lên
    // điều gì hữu ích, và trả lại nội dung đã nhận là cách vô tình phản chiếu dữ liệu ra log.
    return new NextResponse(null, { status: 204, headers: { "cache-control": "no-store" } });
  }

  const input = parsed.data;
  await getPublicIntakeRepository()
    .appendUploadAttempt(
      buildUploadAttemptMetric({
        attemptId: input.clientUpload?.attemptId ?? randomUUID(),
        submissionId: record.submissionId,
        documentType: input.documentType,
        outcome: input.outcome,
        // Lượt hỏng chưa có tệp nào được Drive xác minh, nên không có dung lượng đáng tin để ghi.
        verifiedUploadSizeBytes: 0,
        completeDurationMs: 0,
        telemetry: input.clientUpload,
        failureStage: input.failureStage ?? "",
        failureCode: input.failureCode ?? "",
      }),
    )
    .catch(reportUploadMetricFailure);

  return new NextResponse(null, { status: 204, headers: { "cache-control": "no-store" } });
}
