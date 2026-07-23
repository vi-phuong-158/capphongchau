import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { loadPublicIntakeEnvironment } from "@/modules/common/env";
import { isTrustedEdgeRequest } from "@/modules/public-intake/edge-guard";
import { getPublicIntakeRepository } from "@/modules/public-intake/repository";
import { publicError } from "@/modules/public-intake/route-context";
import {
  TURNSTILE_HEADER,
  turnstileHostname,
  verifyTurnstileToken,
} from "@/modules/public-intake/turnstile";
import { identityHmac, maskCertificateNumber } from "@/modules/public-intake/workflow";

export const runtime = "nodejs";

const CITIZEN_ID_PATTERN = /^\d{12}$/;

/**
 * Tra cứu công khai "đã nộp Giấy chứng nhận chưa" từ trang chủ — không gắn phiên kê khai, không
 * tạo hay lưu hồ sơ nào. Ảnh CCCD không rời trình duyệt: số định danh chỉ đến từ QR đã giải mã cục
 * bộ (`citizen-id-qr.client.ts`); route này không có ô nhập tay số CCCD, giữ đúng lớp chống dò đã
 * chốt cho tra cứu GCN đã có (`hasCompleteExistingRecordLookupIdentity`, 03-decisions.md
 * 2026-07-23). Số GCN trả về bị che theo cùng quyết định đó.
 */
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
    expectedHostname: turnstileHostname(environment.APP_BASE_URL),
  });
  if (!turnstile.ok) {
    return publicError(
      "ACCESS_DENIED",
      "Chưa xác minh được thao tác này do người thật thực hiện. Tải lại trang và thử lại.",
      requestId,
    );
  }

  let body: { identityNumber?: unknown; fullName?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return publicError("VALIDATION_FAILED", "Nội dung yêu cầu không hợp lệ.", requestId);
  }

  const identityNumber = typeof body.identityNumber === "string" ? body.identityNumber.trim() : "";
  const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
  if (!CITIZEN_ID_PATTERN.test(identityNumber) || !fullName) {
    return publicError(
      "VALIDATION_FAILED",
      "Cần quét mã QR trên căn cước trước khi kiểm tra.",
      requestId,
    );
  }

  const repository = getPublicIntakeRepository();
  const citizenHash = identityHmac(environment.DATA_HASH_PEPPER, identityNumber);
  const [matches, pendingWarning] = await Promise.all([
    repository.findExistingCertificates(citizenHash),
    repository.hasPendingIdentityMatch(citizenHash, ""),
  ]);

  // Không ghi số CCCD hay HMAC vào audit — chỉ số lượng khớp, đủ để cán bộ thấy tính năng có
  // đang được dùng và có phát hiện trùng hay không.
  await repository.appendAudit({
    actorEmail: "PUBLIC",
    action: "PUBLIC_HOME_CERTIFICATE_LOOKUP",
    entityId: "HOME_LOOKUP",
    requestId,
    metadata: { matchCount: matches.length },
  });

  return NextResponse.json(
    {
      matched: matches.length > 0,
      pendingWarning,
      certificates: matches.map((match) => ({
        issueNumberMasked: maskCertificateNumber(match.issueNumber),
        issueDate: match.issueDate,
      })),
      requestId,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
