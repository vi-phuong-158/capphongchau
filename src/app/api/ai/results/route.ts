import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createApiErrorPayload } from "@/modules/common/api-error";
import { computeResultFingerprint } from "@/modules/ai-extraction/fingerprints";
import { getDatabase } from "@/modules/supabase/database";
import { validateAiResultPayload, type ValidationIssue } from "../../../../../scripts/ai/validator";

export const runtime = "nodejs";

const schema = z.object({
  jobId: z.string().min(1),
  rawJson: z.record(z.string(), z.unknown()),
  modelName: z.string().default("gemini-3.6-flash"),
  promptVersion: z.string().default("v1.0"),
});

function fail(
  code: "ACCESS_DENIED" | "UNAUTHENTICATED" | "VALIDATION_FAILED" | "NOT_FOUND" | "INTERNAL_ERROR",
  message: string,
  requestId: string,
  status: number,
) {
  return NextResponse.json(createApiErrorPayload({ code, message, requestId }), {
    status,
    headers: { "cache-control": "no-store" },
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = request.headers.get("x-request-id") ?? randomUUID();
  try {
    const workerKey = request.headers.get("x-ai-worker-key");
    const expectedKey = process.env.AI_WORKER_API_KEY;
    if (!expectedKey || !workerKey || workerKey !== expectedKey) {
      return fail("UNAUTHENTICATED", "Khóa xác thực worker AI không hợp lệ.", requestId, 401);
    }

    const body = schema.safeParse(await request.json());
    if (!body.success) {
      return fail("VALIDATION_FAILED", "Dữ liệu kết quả AI không đúng định dạng.", requestId, 400);
    }

    const { jobId, rawJson, modelName, promptVersion } = body.data;
    const issues = validateAiResultPayload(rawJson);
    const blockingCount = issues.filter((i: ValidationIssue) => i.severity === "BLOCKING").length;
    const warningCount = issues.filter((i: ValidationIssue) => i.severity === "WARNING").length;

    const validationStatus =
      blockingCount > 0 ? "BLOCKED" : warningCount > 0 ? "REVIEW_REQUIRED" : "PASSED";
    const fingerprint = computeResultFingerprint(jobId, rawJson);

    const database = getDatabase();
    const resultId = `res_${randomUUID()}`;

    await database.begin(async (transaction) => {
      const jobRows = await transaction<{ submission_id: string }[]>`
        select submission_id from public.ai_extraction_jobs where job_id = ${jobId}
      `;
      if (!jobRows[0]) throw new Error("JOB_NOT_FOUND");

      await transaction`
        insert into public.ai_extraction_results (
          result_id, job_id, result_version, raw_json, normalized_json,
          validation_status, warning_count, blocking_issue_count, result_fingerprint,
          model_name, prompt_version, processed_at
        ) values (
          ${resultId}, ${jobId}, 1, ${JSON.stringify(rawJson)}::jsonb, ${JSON.stringify(rawJson)}::jsonb,
          ${validationStatus}, ${warningCount}, ${blockingCount}, ${fingerprint},
          ${modelName}, ${promptVersion}, now()
        )
      `;

      const newJobStatus = validationStatus === "PASSED" ? "COMPLETED" : "NEEDS_REVIEW";
      await transaction`
        update public.ai_extraction_jobs
        set status = ${newJobStatus}, completed_at = now(), updated_at = now()
        where job_id = ${jobId}
      `;
    });

    return NextResponse.json(
      { result: { resultId, validationStatus }, requestId },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error: unknown) {
    if (error instanceof Error && error.message === "JOB_NOT_FOUND") {
      return fail("NOT_FOUND", "Không tìm thấy job AI tương ứng.", requestId, 404);
    }
    return fail("INTERNAL_ERROR", "Không thể lưu kết quả trích xuất AI.", requestId, 500);
  }
}
