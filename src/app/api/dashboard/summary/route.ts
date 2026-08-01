import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { AuthorizationError, requireActiveUser } from "@/modules/auth/authorization";
import { createApiErrorPayload } from "@/modules/common/api-error";
import { getPublicIntakeRepository, PUBLIC_STATUSES } from "@/modules/public-intake/repository";
import { SUBMISSION_READ_ROLES } from "@/modules/submissions/review";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function responseError(
  code: "ACCESS_DENIED" | "UNAUTHENTICATED" | "VALIDATION_FAILED" | "INTERNAL_ERROR",
  message: string,
  requestId: string,
) {
  return NextResponse.json(createApiErrorPayload({ code, message, requestId }), {
    status:
      code === "UNAUTHENTICATED"
        ? 401
        : code === "ACCESS_DENIED"
          ? 403
          : code === "VALIDATION_FAILED"
            ? 400
            : 500,
    headers: { "cache-control": "no-store" },
  });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const requestId = request.headers.get("x-request-id") ?? randomUUID();
  const totalStartedAt = performance.now();
  try {
    const authStartedAt = performance.now();
    await requireActiveUser(SUBMISSION_READ_ROLES);
    const authMs = performance.now() - authStartedAt;

    const fromDate = request.nextUrl.searchParams.get("from") ?? undefined;
    const toDate = request.nextUrl.searchParams.get("to") ?? undefined;
    const officer = request.nextUrl.searchParams.get("officer") ?? undefined;
    const statusParam = request.nextUrl.searchParams.get("status");

    if (statusParam && !PUBLIC_STATUSES.includes(statusParam as (typeof PUBLIC_STATUSES)[number])) {
      return responseError("VALIDATION_FAILED", "Trạng thái lọc không hợp lệ.", requestId);
    }
    const status = statusParam as (typeof PUBLIC_STATUSES)[number] | undefined;

    const repository = getPublicIntakeRepository();
    const databaseStartedAt = performance.now();
    const summary = await repository.getDashboardSummary({
      fromDate,
      toDate,
      officer,
      status,
    });
    const databaseMs = performance.now() - databaseStartedAt;

    return NextResponse.json(
      { summary, requestId },
      {
        headers: {
          "cache-control": "private, no-store",
          "server-timing": `auth;dur=${authMs.toFixed(1)}, db;dur=${databaseMs.toFixed(1)}, total;dur=${(performance.now() - totalStartedAt).toFixed(1)}`,
        },
      },
    );
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return responseError(error.kind, error.message, requestId);
    }
    return responseError("INTERNAL_ERROR", "Không thể tải tổng quan dữ liệu.", requestId);
  }
}
