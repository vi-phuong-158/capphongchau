import { createHash, randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { AI_WORKER_TYPE } from "@/modules/ai-extraction/repository";
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

interface AiManifest {
  readonly jobId: string;
  readonly submissionId: string;
  readonly inputFingerprint: string;
  readonly modelName: string;
  readonly promptVersion: string;
  readonly schemaVersion: string;
  readonly stationAccessRisk: "ADMIN_BROAD_ACCESS";
  readonly allowedFiles: readonly {
    readonly fileId: string;
    readonly checksum: string;
    readonly fileName: string;
    readonly ordinal: number;
  }[];
}

type ClaimOutcome =
  | { readonly kind: "NOT_FOUND" }
  | { readonly kind: "STALE" }
  | { readonly kind: "SUCCESS"; readonly manifest: AiManifest };

function fail(
  code:
    | "UNAUTHENTICATED"
    | "VALIDATION_FAILED"
    | "NOT_FOUND"
    | "VERSION_CONFLICT"
    | "IDEMPOTENCY_CONFLICT"
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

class AiClaimUnavailableError extends Error {}
class AiIdempotencyConflictError extends Error {}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = request.headers.get("x-request-id") ?? randomUUID();
  try {
    const environment = loadServerEnvironment();
    if (!environment.AI_EXTRACTION_ENABLED) {
      return fail("SERVICE_UNAVAILABLE", "Tính năng trích xuất AI chưa được bật.", requestId, 503);
    }
    if (
      !environment.AI_WORKER_API_KEY ||
      request.headers.get("x-ai-worker-key") !== environment.AI_WORKER_API_KEY
    ) {
      return fail("UNAUTHENTICATED", "Khóa xác thực worker AI không hợp lệ.", requestId, 401);
    }
    const idempotencyKey = request.headers.get("idempotency-key");
    const body = schema.safeParse(await request.json());
    if (!body.success || !idempotencyKey || idempotencyKey.length > 256) {
      return fail("VALIDATION_FAILED", "Yêu cầu nhận job không hợp lệ.", requestId, 400);
    }

    const scopedKey = `AI_CLAIM:${body.data.jobId}:${idempotencyKey}`;
    const mutationHash = createHash("sha256").update(JSON.stringify(body.data)).digest("hex");
    const outcome = await getDatabase().begin<ClaimOutcome>(async (transaction) => {
      await transaction`select pg_advisory_xact_lock(hashtextextended(${scopedKey}, 0))`;
      const cached = await transaction<{ mutation_hash: string; response_json: unknown }[]>`
        select mutation_hash, response_json from public.request_log where idempotency_key = ${scopedKey}
      `;
      if (cached[0]) {
        if (cached[0].mutation_hash !== mutationHash) throw new AiIdempotencyConflictError();
        const replay = cached[0].response_json as { manifest?: AiManifest; outcome?: string };
        if (replay?.outcome === "STALE") return { kind: "STALE" };
        if (replay?.manifest) return { kind: "SUCCESS", manifest: replay.manifest };
        throw new AiIdempotencyConflictError();
      }

      const jobs = await transaction<
        {
          job_id: string;
          submission_id: string | null;
          input_fingerprint: string;
          prompt_version: string;
          schema_version: string;
          model_name: string;
          status: string;
          worker_type: string;
          worker_instance_id: string;
          lease_expired: boolean;
        }[]
      >`
        select job_id, submission_id, input_fingerprint, prompt_version, schema_version, model_name,
          status, worker_type, worker_instance_id,
          (lease_expires_at is null or lease_expires_at <= now()) as lease_expired
        from public.ai_extraction_jobs where job_id = ${body.data.jobId} for update
      `;
      const job = jobs[0];
      if (!job || !job.submission_id || job.worker_type !== AI_WORKER_TYPE)
        return { kind: "NOT_FOUND" };

      const isInitialClaim = job.status === "READY_FOR_AGENT";
      const isReclaim = job.status === "PROCESSING" && job.lease_expired;
      const isSameLiveWorker =
        job.status === "PROCESSING" &&
        !job.lease_expired &&
        job.worker_instance_id === body.data.workerInstanceId;
      if (!isInitialClaim && !isReclaim && !isSameLiveWorker) throw new AiClaimUnavailableError();

      const counts = await transaction<{ declared_count: string | number }[]>`
        select count(*) as declared_count from public.ai_extraction_job_files where job_id = ${job.job_id}
      `;
      const files = await transaction<
        { file_id: string; checksum_sha256: string; file_name: string; ordinal: number }[]
      >`
        select jf.file_id, jf.checksum_sha256, jf.file_name, jf.ordinal
        from public.ai_extraction_job_files jf
        join public.public_files pf on pf.file_id = jf.file_id
        where jf.job_id = ${job.job_id}
          and pf.submission_id = ${job.submission_id}
          and pf.document_type = 'CERTIFICATE'
          and pf.variant = 'ORIGINAL'
          and pf.status = 'UPLOADED'
          and pf.checksum_sha256 = jf.checksum_sha256
          and pf.file_name = jf.file_name
        order by jf.ordinal
      `;
      const declaredCount = Number(counts[0]?.declared_count ?? 0);
      if (declaredCount === 0 || files.length !== declaredCount) {
        await transaction`
          update public.ai_extraction_jobs
          set status = 'STALE', error_code = 'MANIFEST_INVALID',
            error_message_redacted = 'Manifest GCN không còn khớp dữ liệu nguồn.',
            lease_expires_at = null, updated_at = now()
          where job_id = ${job.job_id}
        `;
        await transaction`
          insert into public.audit_logs (actor_email, action, entity_type, entity_id, request_id, metadata)
          values ('AI_STATION', 'AI_EXTRACTION_STALE', 'AI_EXTRACTION_JOB', ${job.job_id}, ${requestId},
            '{"reason":"MANIFEST_INVALID"}'::jsonb)
        `;
        await transaction`
          insert into public.request_log (idempotency_key, request_id, kind, mutation_hash, response_json, expires_at)
          values (${scopedKey}, ${requestId}, 'AI_CLAIM', ${mutationHash},
            '{"outcome":"STALE"}'::jsonb, now() + interval '24 hours')
        `;
        return { kind: "STALE" };
      }

      if (isInitialClaim || isReclaim) {
        await transaction`
          update public.ai_extraction_jobs
          set status = 'PROCESSING', worker_instance_id = ${body.data.workerInstanceId},
            claimed_at = now(), started_at = coalesce(started_at, now()),
            lease_expires_at = now() + interval '20 minutes', attempt_count = attempt_count + 1,
            updated_at = now()
          where job_id = ${job.job_id}
        `;
        await transaction`
          insert into public.audit_logs (actor_email, action, entity_type, entity_id, request_id, metadata)
          values ('AI_STATION', ${isReclaim ? "AI_EXTRACTION_RECLAIMED" : "AI_EXTRACTION_CLAIMED"},
            'AI_EXTRACTION_JOB', ${job.job_id}, ${requestId},
            ${JSON.stringify({ workerInstanceId: body.data.workerInstanceId, attempt: "incremented" })}::jsonb)
        `;
      }

      const manifest: AiManifest = {
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
      await transaction`
        insert into public.request_log (idempotency_key, request_id, kind, mutation_hash, response_json, expires_at)
        values (${scopedKey}, ${requestId}, 'AI_CLAIM', ${mutationHash},
          ${JSON.stringify({ manifest })}::jsonb, now() + interval '24 hours')
      `;
      return { kind: "SUCCESS", manifest };
    });

    if (outcome.kind === "NOT_FOUND")
      return fail("NOT_FOUND", "Không tìm thấy job AI tương ứng.", requestId, 404);
    if (outcome.kind === "STALE")
      return fail(
        "VERSION_CONFLICT",
        "Manifest GCN đã thay đổi; job không thể được nhận.",
        requestId,
        409,
      );
    return NextResponse.json(
      { manifest: outcome.manifest, requestId },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof AiClaimUnavailableError) {
      return fail(
        "VERSION_CONFLICT",
        "Job đã được trạm khác xử lý hoặc không còn sẵn sàng.",
        requestId,
        409,
      );
    }
    if (error instanceof AiIdempotencyConflictError) {
      return fail(
        "IDEMPOTENCY_CONFLICT",
        "Khóa chống gửi trùng đã dùng cho yêu cầu khác.",
        requestId,
        409,
      );
    }
    return fail("INTERNAL_ERROR", "Không thể nhận job AI.", requestId, 500);
  }
}
