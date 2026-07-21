import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { AuthorizationError, requireActiveUser } from "@/modules/auth/authorization";
import { createCsrfToken } from "@/modules/auth/csrf";
import { createApiErrorPayload } from "@/modules/common/api-error";
import { loadServerEnvironment } from "@/modules/common/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const requestId = randomUUID();
  try {
    const user = await requireActiveUser();
    const environment = loadServerEnvironment();
    return NextResponse.json(
      { csrfToken: createCsrfToken(environment.AUTH_SECRET, user.email), expiresInSeconds: 600 },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json(
        createApiErrorPayload({ code: error.kind, message: error.message, requestId }),
        { status: error.kind === "UNAUTHENTICATED" ? 401 : 403 },
      );
    }
    return NextResponse.json(
      createApiErrorPayload({
        code: "INTERNAL_ERROR",
        message: "Không thể tạo mã bảo vệ yêu cầu.",
        requestId,
      }),
      { status: 500 },
    );
  }
}
