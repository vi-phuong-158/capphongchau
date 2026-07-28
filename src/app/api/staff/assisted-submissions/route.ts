import { randomUUID } from "node:crypto";

import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { AuthorizationError, requireActiveUser } from "@/modules/auth/authorization";
import { verifyCsrfToken } from "@/modules/auth/csrf";
import { createApiErrorPayload, type ApiErrorCode } from "@/modules/common/api-error";
import { loadPublicIntakeEnvironment, loadServerEnvironment } from "@/modules/common/env";
import {
  isValidPublicIdempotencyKey,
  publicRequestLogKey,
} from "@/modules/public-intake/creation-idempotency";
import {
  createIntakeSubmission,
  creationFingerprint,
  CreationConflictError,
} from "@/modules/public-intake/create-submission";
import { getPublicIntakeRepository } from "@/modules/public-intake/repository";
import {
  createPublicCsrfToken,
  createSessionToken,
  PUBLIC_SESSION_COOKIE,
  SESSION_COOKIE_OPTIONS,
} from "@/modules/public-intake/session";
import { ASSISTED_INTAKE_ROLES } from "@/modules/submissions/review";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Cán bộ tạo bản kê khai **hộ người dân** khi đi cơ sở.
 *
 * Góp ý: "Làm phần mềm được ko để anh em đi làm cho dân". Không xây app native riêng — cán bộ
 * dùng chính PWA này ở `/ke-khai-ho`, và route này là đường tạo hồ sơ cho chế độ đó.
 *
 * Khác biệt duy nhất so với cổng công khai, và cả hai đều do **máy chủ** quyết định:
 *
 *   - không đòi Turnstile (đã có phiên đăng nhập và CSRF, mạnh hơn hẳn một bài kiểm tra bot);
 *   - gán `OFFICER_ASSISTED` cùng email/tên/thời điểm lấy từ phiên đăng nhập.
 *
 * Client **không** gửi được `channel` hay `assistedBy`: nhận từ client là để bất kỳ ai cũng gắn
 * nhãn "cán bộ đã nhập hộ" cho hồ sơ của mình.
 *
 * Sau khi tạo, route đặt đúng cookie phiên công khai như cổng thường, nên toàn bộ wizard, upload
 * và submit dùng lại y nguyên — không có nhánh mã song song nào phải bảo trì thêm.
 */
function fail(code: ApiErrorCode, message: string, requestId: string, status: number) {
  return NextResponse.json(createApiErrorPayload({ code, message, requestId }), {
    status,
    headers: { "cache-control": "no-store" },
  });
}

export async function POST(request: Request): Promise<NextResponse> {
  const requestId = randomUUID();

  try {
    const user = await requireActiveUser(ASSISTED_INTAKE_ROLES);
    const serverEnvironment = loadServerEnvironment();
    if (
      !verifyCsrfToken(
        serverEnvironment.AUTH_SECRET,
        user.email,
        request.headers.get("x-csrf-token"),
      )
    ) {
      return fail("ACCESS_DENIED", "Yêu cầu bảo mật không hợp lệ hoặc đã hết hạn.", requestId, 403);
    }

    const environment = loadPublicIntakeEnvironment();
    if (environment.PUBLIC_INTAKE_MODE === "PAUSED") {
      return fail(
        "SERVICE_UNAVAILABLE",
        "Hệ thống đang tạm dừng tiếp nhận hồ sơ mới.",
        requestId,
        503,
      );
    }

    const rawIdempotencyKey = request.headers.get("idempotency-key");
    if (!isValidPublicIdempotencyKey(rawIdempotencyKey)) {
      return fail("VALIDATION_FAILED", "Thiếu hoặc sai khóa chống gửi trùng.", requestId, 400);
    }

    let body: { phone?: unknown };
    try {
      body = (await request.json()) as { phone?: unknown };
    } catch {
      return fail("VALIDATION_FAILED", "Nội dung yêu cầu không hợp lệ.", requestId, 400);
    }

    const phone = typeof body.phone === "string" ? body.phone.trim() : "";
    if (!/^0\d{9}$/.test(phone)) {
      return fail(
        "VALIDATION_FAILED",
        "Số điện thoại phải gồm 10 chữ số và bắt đầu bằng 0.",
        requestId,
        400,
      );
    }

    const idempotencyKey = publicRequestLogKey(rawIdempotencyKey);
    const result = await createIntakeSubmission({
      rawIdempotencyKey,
      idempotencyKey,
      mutationHash: creationFingerprint(
        environment.PUBLIC_ACCESS_CODE_PEPPER,
        phone,
        environment.CONSENT_NOTICE_VERSION,
      ),
      phone,
      requestId,
      sessionSecret: environment.PUBLIC_SESSION_SECRET,
      accessPepper: environment.PUBLIC_ACCESS_CODE_PEPPER,
      // Không có Turnstile nên không có khái niệm "token đã dùng"; phiên đăng nhập là hàng rào.
      replayOnly: false,
      consentVersion: environment.CONSENT_NOTICE_VERSION,
      channel: "OFFICER_ASSISTED",
      assistedBy: { email: user.email, displayName: user.displayName },
    });

    await getPublicIntakeRepository().appendAudit({
      actorEmail: user.email,
      action: "ASSISTED_SUBMISSION_CREATED",
      entityId: result.submissionId,
      requestId,
    });

    // Cùng cookie phiên với cổng công khai: wizard, upload và submit dùng lại nguyên vẹn.
    const cookieStore = await cookies();
    cookieStore.set(
      PUBLIC_SESSION_COOKIE,
      createSessionToken(environment.PUBLIC_SESSION_SECRET, {
        submissionId: result.submissionId,
        rowIndex: 0,
        accessVersion: 1,
        issuedAt: Math.floor(Date.now() / 1000),
      }),
      { ...SESSION_COOKIE_OPTIONS, secure: process.env.NODE_ENV === "production" },
    );

    return NextResponse.json(
      {
        receiptCode: result.receiptCode,
        accessSecret: result.accessSecret,
        csrfToken: createPublicCsrfToken(environment.PUBLIC_SESSION_SECRET, result.submissionId),
        assistedBy: { displayName: user.displayName },
        requestId,
        recovered: result.recovered,
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof AuthorizationError) {
      // Phân biệt "chưa đăng nhập" với "đăng nhập rồi nhưng không đủ quyền": gộp cả hai vào 401
      // sẽ khiến giao diện đá người dùng về trang đăng nhập trong khi họ đã đăng nhập sẵn.
      return error.kind === "UNAUTHENTICATED"
        ? fail(
            "UNAUTHENTICATED",
            "Cần đăng nhập bằng tài khoản cán bộ để dùng chế độ hỗ trợ kê khai.",
            requestId,
            401,
          )
        : fail(
            "ACCESS_DENIED",
            "Tài khoản của bạn không có quyền kê khai hộ người dân.",
            requestId,
            403,
          );
    }
    if (error instanceof CreationConflictError) {
      return fail(
        "IDEMPOTENCY_CONFLICT",
        "Lần thử trước dùng số điện thoại khác. Kiểm tra lại số và thử lần nữa.",
        requestId,
        409,
      );
    }
    // Không trả stack, Drive ID hay PII; cùng idempotency key ở lần sau sẽ tiếp tục đúng bản nháp.
    return fail("INTERNAL_ERROR", "Chưa tạo được bản kê khai. Vui lòng thử lại.", requestId, 500);
  }
}
