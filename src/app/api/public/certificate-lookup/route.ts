import { randomUUID } from "node:crypto";

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
import { isTrustedEdgeRequest } from "@/modules/public-intake/edge-guard";
import {
  CertificateLookupRateLimitError,
  getPublicIntakeRepository,
} from "@/modules/public-intake/repository";
import { publicError } from "@/modules/public-intake/route-context";
import {
  TURNSTILE_HEADER,
  turnstileHostnames,
  verifyTurnstileToken,
} from "@/modules/public-intake/turnstile";
import { identityHmac } from "@/modules/public-intake/workflow";

export const runtime = "nodejs";

const CITIZEN_ID_PATTERN = /^\d{12}$/;

function requestSource(request: Request): string {
  // Vercel đặt `x-vercel-forwarded-for`; local/test có thể chỉ có x-forwarded-for. Giá trị không
  // bao giờ log nguyên văn mà được HMAC ngay trước khi gọi repository.
  const forwarded =
    request.headers.get("x-vercel-forwarded-for") ?? request.headers.get("x-forwarded-for") ?? "";
  return forwarded.split(",")[0]?.trim() || "unknown";
}

/** Tra cứu công khai từ trang chủ, không tạo phiên/hồ sơ và chỉ trả DTO tối thiểu. */
export async function POST(request: Request): Promise<NextResponse> {
  const requestId = randomUUID();
  const environment = loadPublicIntakeEnvironment();

  if (!isTrustedEdgeRequest(request.headers, environment.ORIGIN_SHARED_SECRET)) {
    return publicError("ACCESS_DENIED", "Yêu cầu không hợp lệ.", requestId);
  }

  const turnstile = await verifyTurnstileToken({
    token: request.headers.get(TURNSTILE_HEADER),
    action: "lookup",
    secretKey: environment.TURNSTILE_SECRET_KEY,
    expectedHostnames: turnstileHostnames(environment.APP_BASE_URL),
  });
  if (!turnstile.ok) {
    return publicError(
      "ACCESS_DENIED",
      "Chưa xác minh được thao tác này do người thật thực hiện. Tải lại trang và thử lại.",
      requestId,
    );
  }

  let body: {
    method?: unknown;
    identityNumber?: unknown;
    fullName?: unknown;
    issueNumber?: unknown;
    issueDate?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return publicError("VALIDATION_FAILED", "Nội dung yêu cầu không hợp lệ.", requestId);
  }

  if (
    body.method !== undefined &&
    body.method !== "CITIZEN_ID_QR" &&
    body.method !== "CERTIFICATE_NUMBER"
  ) {
    return publicError("VALIDATION_FAILED", "Phương thức tra cứu không hợp lệ.", requestId);
  }
  // Giữ tương thích request QR đã phát hành trước khi có trường `method`.
  const method = body.method === "CERTIFICATE_NUMBER" ? "CERTIFICATE_NUMBER" : "CITIZEN_ID_QR";
  const repository = getPublicIntakeRepository();

  if (method === "CERTIFICATE_NUMBER") {
    const issueNumber = typeof body.issueNumber === "string" ? body.issueNumber.trim() : "";
    const issueDate = typeof body.issueDate === "string" ? body.issueDate.trim() : "";
    if (!isValidCertificateLookupInput(issueNumber, issueDate)) {
      return publicError(
        "VALIDATION_FAILED",
        "Số phát hành GCN chỉ gồm chữ và số; ngày cấp phải là một ngày hợp lệ.",
        requestId,
      );
    }
    const normalizedIssueNumber = normalizeCertificateIssueNumber(issueNumber);
    try {
      const result = await repository.lookupCertificateByIssue({
        normalizedIssueNumber,
        issueDate,
        rateLimitKey: certificateLookupRateLimitKey(
          environment.DATA_HASH_PEPPER,
          requestSource(request),
        ),
        lookupFingerprint: certificateLookupFingerprint(
          environment.DATA_HASH_PEPPER,
          normalizedIssueNumber,
          issueDate,
        ),
        source: "PUBLIC",
        requestId,
      });
      return NextResponse.json(
        { ...result, requestId },
        { headers: { "cache-control": "no-store" } },
      );
    } catch (error) {
      if (error instanceof CertificateLookupRateLimitError) {
        return publicError("RATE_LIMITED", error.message, requestId);
      }
      throw error;
    }
  }

  // Luồng QR hiện hữu không đổi: ảnh CCCD vẫn chỉ được giải mã cục bộ. Điều thay đổi duy nhất là
  // DTO trả về dùng cùng nguyên tắc tối thiểu với tra số GCN.
  const identityNumber = typeof body.identityNumber === "string" ? body.identityNumber.trim() : "";
  const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
  if (!CITIZEN_ID_PATTERN.test(identityNumber) || !fullName) {
    return publicError(
      "VALIDATION_FAILED",
      "Cần quét mã QR trên căn cước trước khi kiểm tra.",
      requestId,
    );
  }

  const citizenHash = identityHmac(environment.DATA_HASH_PEPPER, identityNumber);
  const [matches, pendingWarning] = await Promise.all([
    repository.findExistingCertificates(citizenHash),
    repository.hasPendingIdentityMatch(citizenHash, ""),
  ]);

  // Không ghi CCCD/HMAC hay số GCN vào audit — chỉ trạng thái allowlist.
  await repository.appendAudit({
    actorEmail: "PUBLIC",
    action: "PUBLIC_HOME_CERTIFICATE_LOOKUP",
    entityId: "HOME_LOOKUP",
    requestId,
    metadata: {
      found: matches.length > 0 || pendingWarning,
      status:
        matches.length > 0 ? "OFFICIALLY_RECEIVED" : pendingWarning ? "IN_PROCESSING" : "NOT_FOUND",
    },
  });

  return NextResponse.json(
    {
      found: matches.length > 0 || pendingWarning,
      status: matches.length > 0 ? "OFFICIALLY_RECEIVED" : pendingWarning ? "IN_PROCESSING" : null,
      guidance:
        matches.length > 0
          ? "Đã có dữ liệu Giấy chứng nhận được tiếp nhận. Không kê khai lại; nếu thông tin thay đổi, liên hệ cán bộ phường."
          : pendingWarning
            ? "Đang có hồ sơ được xử lý. Không kê khai lại; vui lòng chờ hoặc liên hệ cán bộ phường khi cần bổ sung."
            : "Chưa tìm thấy hồ sơ theo thông tin đã quét. Bạn có thể tiếp tục kê khai.",
      requestId,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
