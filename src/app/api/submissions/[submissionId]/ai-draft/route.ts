import { randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { AuthorizationError, requireActiveUser } from "@/modules/auth/authorization";
import { createApiErrorPayload } from "@/modules/common/api-error";
import { getAiExtractionRepository } from "@/modules/ai-extraction/repository";
import { getPublicIntakeRepository } from "@/modules/public-intake/repository";
import { SUBMISSION_READ_ROLES } from "@/modules/submissions/review";

export const runtime = "nodejs";

export async function GET(
  _: NextRequest,
  context: { params: Promise<{ submissionId: string }> },
): Promise<NextResponse> {
  const requestId = randomUUID();
  try {
    const user = await requireActiveUser(SUBMISSION_READ_ROLES);
    const { submissionId } = await context.params;
    const repository = getPublicIntakeRepository();
    const submission = await repository.findById(submissionId);
    if (!submission || !submission.draft) {
      return NextResponse.json(
        createApiErrorPayload({
          code: "NOT_FOUND",
          message: "Không tìm thấy bản kê khai.",
          requestId,
        }),
        { status: 404 },
      );
    }
    const aiDraft = await getAiExtractionRepository().getCurrentComparisons(
      submissionId,
      submission.draft,
    );
    await repository.appendAudit({
      actorEmail: user.email,
      action: "AI_DRAFT_VIEWED",
      entityId: submissionId,
      requestId,
    });
    return NextResponse.json(
      {
        aiDraft: aiDraft
          ? {
              ...aiDraft.draft,
              comparisons: aiDraft.comparisons,
            }
          : null,
        requestId,
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    const code = error instanceof AuthorizationError ? error.kind : "INTERNAL_ERROR";
    const message =
      error instanceof AuthorizationError ? error.message : "Không thể tải bản nháp AI.";
    return NextResponse.json(createApiErrorPayload({ code, message, requestId }), {
      status: code === "UNAUTHENTICATED" ? 401 : code === "ACCESS_DENIED" ? 403 : 500,
    });
  }
}
