import { randomUUID } from "node:crypto";

import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { loadPublicIntakeEnvironment } from "@/modules/common/env";
import { isValidPublicIdempotencyKey } from "@/modules/public-intake/creation-idempotency";
import { isTrustedEdgeRequest } from "@/modules/public-intake/edge-guard";
import { getPublicIntakeRepository } from "@/modules/public-intake/repository";
import { publicError, publicPrivateJson } from "@/modules/public-intake/route-context";
import {
  accessSecretMatches,
  createPublicCsrfToken,
  createSessionToken,
  PUBLIC_SESSION_COOKIE,
  SESSION_COOKIE_OPTIONS,
} from "@/modules/public-intake/session";
import {
  TURNSTILE_HEADER,
  turnstileHostnames,
  verifyTurnstileToken,
} from "@/modules/public-intake/turnstile";
import {
  publicAssignedOfficer,
  publicHasAssignedOfficer,
} from "@/modules/submissions/assigned-officer";

export const runtime = "nodejs";

const MAX_FAILURES = 5;
const LOCK_MINUTES = 15;
const RECEIPT_PATTERN = /^PC-KK-\d{4}-[A-Z0-9]{8}$/;

export async function POST(request: Request): Promise<NextResponse> {
  const requestId = randomUUID();
  const environment = loadPublicIntakeEnvironment();
  if (!isTrustedEdgeRequest(request.headers, environment.ORIGIN_SHARED_SECRET)) {
    return publicError("ACCESS_DENIED", "Yêu cầu không hợp lệ.", requestId);
  }
  if (!isValidPublicIdempotencyKey(request.headers.get("idempotency-key"))) {
    return publicError(
      "VALIDATION_FAILED",
      "Thiếu khóa chống gửi trùng. Tải lại trang và thử lại.",
      requestId,
    );
  }

  const turnstile = await verifyTurnstileToken({
    token: request.headers.get(TURNSTILE_HEADER),
    action: "recover",
    secretKey: environment.TURNSTILE_SECRET_KEY,
    expectedHostnames: turnstileHostnames(environment.APP_BASE_URL),
  });
  if (!turnstile.ok) {
    return publicError("ACCESS_DENIED", "Không xác minh được thao tác truy cập.", requestId);
  }

  let body: { receiptCode?: unknown; accessSecret?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return publicError("VALIDATION_FAILED", "Nội dung yêu cầu không hợp lệ.", requestId);
  }
  const receiptCode =
    typeof body.receiptCode === "string" ? body.receiptCode.trim().toUpperCase() : "";
  const accessSecret = typeof body.accessSecret === "string" ? body.accessSecret.trim() : "";
  if (!RECEIPT_PATTERN.test(receiptCode) || accessSecret.length < 16 || accessSecret.length > 32) {
    return invalidAccess(requestId);
  }

  const repository = getPublicIntakeRepository();
  const record = await repository.findByReceiptCode(receiptCode);
  if (!record) return invalidAccess(requestId);

  const now = new Date();
  if (record.lockedUntil && new Date(record.lockedUntil).getTime() > now.getTime()) {
    return publicError(
      "SUBMISSION_LOCKED",
      "Đã nhập sai quá 5 lần. Vui lòng thử lại sau 15 phút.",
      requestId,
    );
  }

  if (
    !accessSecretMatches(environment.PUBLIC_ACCESS_CODE_PEPPER, accessSecret, record.accessCodeHash)
  ) {
    const result = await repository.registerFailedAccessAttempt(
      record.submissionId,
      MAX_FAILURES,
      LOCK_MINUTES,
    );
    const isLocked = result.failedAttempts >= MAX_FAILURES || result.lockedUntil !== null;
    return isLocked
      ? publicError(
          "SUBMISSION_LOCKED",
          "Đã nhập sai quá 5 lần. Vui lòng thử lại sau 15 phút.",
          requestId,
        )
      : invalidAccess(requestId);
  }

  const activeRecord =
    record.failedAttempts > 0 || record.lockedUntil
      ? await repository.updateAccessState(record, { failedAttempts: 0, lockedUntil: "" })
      : record;
  await repository.appendAudit({
    actorEmail: "PUBLIC",
    action: "PUBLIC_SUBMISSION_ACCESSED",
    entityId: activeRecord.submissionId,
    requestId,
  });

  const issuedAt = Math.floor(now.getTime() / 1000);
  const cookieStore = await cookies();
  cookieStore.set(
    PUBLIC_SESSION_COOKIE,
    createSessionToken(environment.PUBLIC_SESSION_SECRET, {
      submissionId: activeRecord.submissionId,
      rowIndex: activeRecord.rowIndex,
      accessVersion: activeRecord.accessVersion,
      issuedAt,
    }),
    {
      ...SESSION_COOKIE_OPTIONS,
      secure: process.env.NODE_ENV === "production",
    },
  );

  return publicPrivateJson({
    receiptCode: activeRecord.receiptCode,
    status: activeRecord.status,
    // Chỉ TÊN cán bộ, không bao giờ email: email công vụ đưa ra cổng công khai là địa chỉ thật
    // có thể bị thu thập để gửi thư rác hoặc lừa đảo nhân danh phường. Hồ sơ nhận trước khi có
    // cột tên trả `null`, giao diện hiển thị "Đã phân công cán bộ".
    assignedOfficer: publicAssignedOfficer(activeRecord),
    hasAssignedOfficer: publicHasAssignedOfficer(activeRecord),
    csrfToken: createPublicCsrfToken(
      environment.PUBLIC_SESSION_SECRET,
      activeRecord.submissionId,
      now,
    ),
    requestId,
  });
}

function invalidAccess(requestId: string): NextResponse {
  return publicError("INVALID_ACCESS_CODE", "Mã tiếp nhận hoặc mã bí mật không đúng.", requestId);
}
