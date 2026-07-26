import { randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createApiErrorPayload } from "@/modules/common/api-error";
import { loadServerEnvironment } from "@/modules/common/env";
import { getDatabase } from "@/modules/supabase/database";

export const runtime = "nodejs";

const schema = z
  .object({
    jobId: z.string().trim().min(1).max(100),
    workerInstanceId: z.string().trim().min(1).max(100),
  })
  .strict();

function fail(
  code:
    | "UNAUTHENTICATED"
    | "VALIDATION_FAILED"
    | "NOT_FOUND"
    | "VERSION_CONFLICT"
    | "SERVICE_UNAVAILABLE"
    | "INTERNAL_ERROR",
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
    const environment = loadServerEnvironment();
    if (!environment.AI_EXTRACTION_ENABLED)
      return fail("SERVICE_UNAVAILABLE", "Tính năng trích xuất AI chưa được bật.", requestId, 503);
    const expectedKey = process.env.AI_WORKER_API_KEY;
    if (!expectedKey || request.headers.get("x-ai-worker-key") !== expectedKey) {
      return fail("UNAUTHENTICATED", "Khóa xác thực worker AI không hợp lệ.", requestId, 401);
    }
    const body = schema.safeParse(await request.json());
    if (!body.success)
      return fail("VALIDATION_FAILED", "Yêu cầu nhận job không hợp lệ.", requestId, 400);
    const database = getDatabase();
    const manifest = await database.begin(async (transaction) => {
      const jobs = await transaction<
        {
          job_id: string;
          submission_id: string;
          input_fingerprint: string;
          prompt_version: string;
          schema_version: string;
          model_name: string;
          status: string;
          worker_instance_id: string;
        }[]
      >`
        select job_id, submission_id, input_fingerprint, prompt_version, schema_version, model_name, status, worker_instance_id
        from public.ai_extraction_jobs where job_id = ${body.data.jobId} for update
      `;
      const job = jobs[0];
      if (!job || !job.submission_id) return null;
      const canClaim =
        job.status === "READY_FOR_AGENT" ||
        (job.status === "PROCESSING" && job.worker_instance_id === body.data.workerInstanceId);
      if (!canClaim) throw new Error("JOB_UNAVAILABLE");
      await transaction`
        update public.ai_extraction_jobs
        set status = 'PROCESSING', worker_instance_id = ${body.data.workerInstanceId},
          claimed_at = coalesce(claimed_at, now()), started_at = coalesce(started_at, now()),
          lease_expires_at = now() + interval '20 minutes', attempt_count = attempt_count + 1, updated_at = now()
        where job_id = ${job.job_id}
      `;
      const files = await transaction<
        { file_id: string; checksum_sha256: string; file_name: string; ordinal: number }[]
      >`
        select file_id, checksum_sha256, file_name, ordinal
        from public.ai_extraction_job_files where job_id = ${job.job_id} order by ordinal
      `;
      return {
        jobId: job.job_id,
        submissionId: job.submission_id,
        inputFingerprint: job.input_fingerprint,
        modelName: job.model_name,
        promptVersion: job.prompt_version,
        schemaVersion: job.schema_version,
        stationAccessRisk: "ADMIN_BROAD_ACCESS",
        allowedFiles: files.map((file) => ({
          fileId: file.file_id,
          checksum: file.checksum_sha256,
          fileName: file.file_name,
          ordinal: file.ordinal,
        })),
      };
    });
    if (!manifest) return fail("NOT_FOUND", "Không tìm thấy job AI tương ứng.", requestId, 404);
    return NextResponse.json({ manifest, requestId }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message === "JOB_UNAVAILABLE") {
      return fail(
        "VERSION_CONFLICT",
        "Job đã được trạm khác xử lý hoặc không còn sẵn sàng.",
        requestId,
        409,
      );
    }
    return fail("INTERNAL_ERROR", "Không thể nhận job AI.", requestId, 500);
  }
}
