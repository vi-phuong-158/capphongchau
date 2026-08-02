import { randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { AuthorizationError, requireActiveUser } from "@/modules/auth/authorization";
import { createApiErrorPayload } from "@/modules/common/api-error";
import { getPublicIntakeRepository, PUBLIC_STATUSES, PUBLIC_BUCKETS } from "@/modules/public-intake/repository";
import { normalizeDashboardFilters } from "@/lib/validation";
import { InvalidQueueCursorError } from "@/modules/submissions/queue-pagination";
import { maskPhone, SUBMISSION_READ_ROLES } from "@/modules/submissions/review";

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

const PAGE_LIMIT = 100;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const requestId = request.headers.get("x-request-id") ?? randomUUID();
  const totalStartedAt = performance.now();
  try {
    const authStartedAt = performance.now();
    await requireActiveUser(SUBMISSION_READ_ROLES);
    const authMs = performance.now() - authStartedAt;
    
    let filters;
    try {
      filters = normalizeDashboardFilters({
        from: request.nextUrl.searchParams.get("from"),
        to: request.nextUrl.searchParams.get("to"),
        officer: request.nextUrl.searchParams.get("officer"),
        status: request.nextUrl.searchParams.get("status"),
        bucket: request.nextUrl.searchParams.get("bucket"),
        unassigned: request.nextUrl.searchParams.get("unassigned"),
        validStatuses: PUBLIC_STATUSES,
        validBuckets: PUBLIC_BUCKETS,
      });
    } catch (err: unknown) {
      const error = err as Error;
      return responseError("VALIDATION_FAILED", error.message || "Tham số lọc không hợp lệ.", requestId);
    }
    
    const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
    const cursor = request.nextUrl.searchParams.get("cursor");
    const unassigned = filters.unassigned === "1";
    const repository = getPublicIntakeRepository();
    const databaseStartedAt = performance.now();
    const page = await repository.listQueuePage({
      status: filters.status as (typeof PUBLIC_STATUSES)[number] | undefined,
      bucket: filters.bucket as (typeof PUBLIC_BUCKETS)[number] | undefined,
      fromDate: filters.fromDate,
      toDate: filters.toDate,
      query,
      cursor,
      officer: filters.officer,
      unassigned,
      limit: PAGE_LIMIT,
    });
    const databaseMs = performance.now() - databaseStartedAt;
    const submissions = page.items.map((summary) => ({
      submissionId: summary.submissionId,
      receiptCode: summary.receiptCode,
      status: summary.status,
      phone: maskPhone(summary.phone),
      issueNumber: summary.issueNumber,
      ownerName: summary.ownerName,
      claimedBy: summary.claimedBy || null,
      claimedByDisplayName: summary.claimedByDisplayName || null,
      updatedAt: summary.updatedAt,
      version: summary.version,
    }));
    return NextResponse.json(
      { submissions, nextCursor: page.nextCursor, requestId },
      {
        headers: {
          "cache-control": "no-store",
          "server-timing": `auth;dur=${authMs.toFixed(1)}, queue_db;dur=${databaseMs.toFixed(1)}, total;dur=${(performance.now() - totalStartedAt).toFixed(1)}`,
        },
      },
    );
  } catch (error) {
    if (error instanceof AuthorizationError)
      return responseError(error.kind, error.message, requestId);
    if (error instanceof InvalidQueueCursorError)
      return responseError("VALIDATION_FAILED", error.message, requestId);
    return responseError("INTERNAL_ERROR", "Không thể tải hàng chờ hồ sơ.", requestId);
  }
}
