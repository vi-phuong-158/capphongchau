import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { AuthorizationError, requireActiveUser } from "@/modules/auth/authorization";
import { createApiErrorPayload } from "@/modules/common/api-error";
import { normalizeDashboardFilters } from "@/lib/validation";
import { getPublicIntakeRepository } from "@/modules/public-intake/repository";
import { DASHBOARD_VIEW_ROLES } from "@/modules/submissions/review";
import { PUBLIC_STATUSES, PUBLIC_BUCKETS } from "@/modules/public-intake/workflow";

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
    await requireActiveUser(DASHBOARD_VIEW_ROLES);
    const authMs = performance.now() - authStartedAt;

    let filters;
    try {
      filters = normalizeDashboardFilters({
        from: request.nextUrl.searchParams.get("from"),
        to: request.nextUrl.searchParams.get("to"),
        officer: request.nextUrl.searchParams.get("officer"),
        status: request.nextUrl.searchParams.get("status"),
        validStatuses: PUBLIC_STATUSES,
        validBuckets: PUBLIC_BUCKETS,
      });
    } catch (err: unknown) {
      const error = err as Error;
      return responseError("VALIDATION_FAILED", error.message || "Tham số lọc không hợp lệ.", requestId);
    }

    const repository = getPublicIntakeRepository();
    const databaseStartedAt = performance.now();
    const summary = await repository.getDashboardSummary({
      fromDate: filters.fromDate,
      toDate: filters.toDate,
      officer: filters.officer,
      status: filters.status as (typeof PUBLIC_STATUSES)[number] | undefined,
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
