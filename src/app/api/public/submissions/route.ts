import { randomUUID } from "node:crypto";

import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { loadPublicIntakeEnvironment } from "@/modules/common/env";
import { getPublicIntakeRepository } from "@/modules/public-intake/repository";
import { createAccessSecret, createReceiptCode } from "@/modules/public-intake/receipt-code";
import { publicError } from "@/modules/public-intake/route-context";
import {
  createPublicCsrfToken,
  createSessionToken,
  hashAccessSecret,
  PUBLIC_SESSION_COOKIE,
  SESSION_COOKIE_OPTIONS,
} from "@/modules/public-intake/session";
import { getPublicIntakeStorage } from "@/modules/public-intake/storage";
import { emptyDraft } from "@/modules/public-intake/types";

export const runtime = "nodejs";

/** Phiên bản thông báo bảo vệ dữ liệu mà người dân đã đồng ý — chờ văn bản chính thức. */
const CONSENT_VERSION = "draft-2026-07";

/**
 * Tạo bản kê khai nháp. Không cần đăng nhập.
 *
 * TODO trước khi deploy công khai: bắt buộc xác minh Turnstile ở đây, ở `access` và ở `submit`;
 * đặt Cloudflare rate limiting trước `/api/public/*` (PLAN_NL §10, §10.2). Chạy cục bộ thì
 * chưa có lớp này.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const requestId = randomUUID();

  let body: { phone?: unknown };
  try {
    body = (await request.json()) as { phone?: unknown };
  } catch {
    return publicError("VALIDATION_FAILED", "Nội dung yêu cầu không hợp lệ.", requestId);
  }

  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  if (!/^0\d{9}$/.test(phone)) {
    return publicError(
      "VALIDATION_FAILED",
      "Số điện thoại phải gồm 10 chữ số và bắt đầu bằng 0.",
      requestId,
    );
  }

  const environment = loadPublicIntakeEnvironment();
  const submissionId = randomUUID();
  const receiptCode = createReceiptCode();
  const accessSecret = createAccessSecret();

  const driveFolderId = await getPublicIntakeStorage().createSubmissionFolder(submissionId);

  const draft = emptyDraft(randomUUID(), randomUUID(), randomUUID());
  draft.phone = phone;
  draft.consentAccepted = true;

  await getPublicIntakeRepository().create({
    submissionId,
    receiptCode,
    accessCodeHash: hashAccessSecret(environment.PUBLIC_ACCESS_CODE_PEPPER, accessSecret),
    phone,
    driveFolderId,
    draft,
    consentVersion: CONSENT_VERSION,
  });

  const cookieStore = await cookies();
  cookieStore.set(
    PUBLIC_SESSION_COOKIE,
    createSessionToken(environment.PUBLIC_SESSION_SECRET, {
      submissionId,
      issuedAt: Math.floor(Date.now() / 1000),
    }),
    {
      ...SESSION_COOKIE_OPTIONS,
      secure: process.env.NODE_ENV === "production",
    },
  );

  // Mã bí mật trả về đúng một lần và không bao giờ được lưu dạng rõ.
  return NextResponse.json({
    receiptCode,
    accessSecret,
    csrfToken: createPublicCsrfToken(environment.PUBLIC_SESSION_SECRET, submissionId),
    requestId,
  });
}
