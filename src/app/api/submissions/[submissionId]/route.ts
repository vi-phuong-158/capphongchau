import { randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { AuthorizationError, requireActiveUser } from "@/modules/auth/authorization";
import { createApiErrorPayload } from "@/modules/common/api-error";
import { getPublicIntakeRepository } from "@/modules/public-intake/repository";
import { maskPhone, SUBMISSION_READ_ROLES } from "@/modules/submissions/review";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _: NextRequest,
  context: { params: Promise<{ submissionId: string }> },
): Promise<NextResponse> {
  const requestId = randomUUID();
  try {
    await requireActiveUser(SUBMISSION_READ_ROLES);
    const { submissionId } = await context.params;
    const record = await getPublicIntakeRepository().findById(submissionId);
    if (!record) {
      return NextResponse.json(
        createApiErrorPayload({
          code: "NOT_FOUND",
          message: "Không tìm thấy bản kê khai.",
          requestId,
        }),
        { status: 404 },
      );
    }
    return NextResponse.json(
      {
        submission: {
          submissionId: record.submissionId,
          receiptCode: record.receiptCode,
          status: record.status,
          phone: maskPhone(record.phone),
          version: record.version,
          claimedBy: record.claimedBy || null,
          claimedAt: record.claimedAt || null,
          createdAt: record.createdAt,
          updatedAt: record.updatedAt,
          draft: record.draft,
        },
        requestId,
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    const code = error instanceof AuthorizationError ? error.kind : "INTERNAL_ERROR";
    const message =
      error instanceof AuthorizationError ? error.message : "Không thể tải bản kê khai.";
    return NextResponse.json(createApiErrorPayload({ code, message, requestId }), {
      status: code === "UNAUTHENTICATED" ? 401 : code === "ACCESS_DENIED" ? 403 : 500,
    });
  }
}
