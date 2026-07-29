import { NextResponse } from "next/server";

import { loadPublicIntakeEnvironment } from "@/modules/common/env";
import {
  certificateLookupFingerprint,
  certificateLookupRateLimitKey,
} from "@/modules/public-intake/certificate-lookup";
import {
  isValidCertificateLookupInput,
  normalizeCertificateIssueNumber,
} from "@/modules/public-intake/certificate-normalization";
import { isValidPublicIdempotencyKey } from "@/modules/public-intake/creation-idempotency";
import {
  CertificateLookupRateLimitError,
  getPublicIntakeRepository,
} from "@/modules/public-intake/repository";
import { publicError, resolvePublicRequest } from "@/modules/public-intake/route-context";

export const runtime = "nodejs";

/**
 * Kiểm tra trùng trong lúc kê khai. Chỉ phiên sở hữu bản nháp mới gọi được (session + CSRF), nên
 * không dùng Turnstile thêm lần nữa; route công khai không có phiên vẫn bắt Turnstile riêng.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const context = await resolvePublicRequest(request, { requireCsrf: true });
  if (context instanceof NextResponse) return context;
  if (!isValidPublicIdempotencyKey(request.headers.get("idempotency-key"))) {
    return publicError("VALIDATION_FAILED", "Thiếu khóa chống gửi trùng.", context.requestId);
  }

  let body: { issueNumber?: unknown; issueDate?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return publicError("VALIDATION_FAILED", "Nội dung yêu cầu không hợp lệ.", context.requestId);
  }
  const issueNumber = typeof body.issueNumber === "string" ? body.issueNumber.trim() : "";
  const issueDate = typeof body.issueDate === "string" ? body.issueDate.trim() : "";
  if (!isValidCertificateLookupInput(issueNumber, issueDate)) {
    return publicError(
      "VALIDATION_FAILED",
      "Số phát hành GCN chỉ gồm chữ và số; ngày cấp phải là một ngày hợp lệ.",
      context.requestId,
    );
  }

  const normalizedIssueNumber = normalizeCertificateIssueNumber(issueNumber);
  const environment = loadPublicIntakeEnvironment();
  try {
    const result = await getPublicIntakeRepository().lookupCertificateByIssue({
      normalizedIssueNumber,
      issueDate,
      excludeSubmissionId: context.record.submissionId,
      rateLimitKey: certificateLookupRateLimitKey(
        environment.DATA_HASH_PEPPER,
        context.record.submissionId,
      ),
      lookupFingerprint: certificateLookupFingerprint(
        environment.DATA_HASH_PEPPER,
        normalizedIssueNumber,
        issueDate,
      ),
      source: "SUBMISSION",
      requestId: context.requestId,
    });
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof CertificateLookupRateLimitError) {
      return publicError("RATE_LIMITED", error.message, context.requestId);
    }
    throw error;
  }
}
