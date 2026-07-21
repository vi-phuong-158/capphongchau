import { randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { AuthorizationError, requireActiveUser } from "@/modules/auth/authorization";
import { createApiErrorPayload } from "@/modules/common/api-error";
import { getPublicIntakeRepository } from "@/modules/public-intake/repository";
import { maskPhone, SUBMISSION_READ_ROLES } from "@/modules/submissions/review";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function responseError(
  code: "ACCESS_DENIED" | "UNAUTHENTICATED" | "INTERNAL_ERROR",
  message: string,
  requestId: string,
) {
  return NextResponse.json(createApiErrorPayload({ code, message, requestId }), {
    status: code === "UNAUTHENTICATED" ? 401 : code === "ACCESS_DENIED" ? 403 : 500,
    headers: { "cache-control": "no-store" },
  });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const requestId = request.headers.get("x-request-id") ?? randomUUID();
  try {
    await requireActiveUser(SUBMISSION_READ_ROLES);
    const status = request.nextUrl.searchParams.get("status");
    const query = request.nextUrl.searchParams.get("q")?.trim().toLocaleLowerCase("vi") ?? "";
    const records = await getPublicIntakeRepository().list();
    const submissions = records
      .filter((record) => !status || record.status === status)
      .filter((record) => {
        if (!query) return true;
        return [
          record.receiptCode,
          record.draft?.certificate.issueNumber ?? "",
          record.draft?.owners[0]?.fullName ?? "",
        ]
          .join(" ")
          .toLocaleLowerCase("vi")
          .includes(query);
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((record) => ({
        submissionId: record.submissionId,
        receiptCode: record.receiptCode,
        status: record.status,
        phone: maskPhone(record.phone),
        issueNumber: record.draft?.certificate.issueNumber ?? "",
        ownerName: record.draft?.owners[0]?.fullName ?? "",
        claimedBy: record.claimedBy || null,
        updatedAt: record.updatedAt,
        version: record.version,
      }));
    return NextResponse.json(
      { submissions, requestId },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof AuthorizationError)
      return responseError(error.kind, error.message, requestId);
    return responseError("INTERNAL_ERROR", "Không thể tải hàng chờ hồ sơ.", requestId);
  }
}
