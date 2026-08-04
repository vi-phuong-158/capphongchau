import { createHash, randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createApiErrorPayload } from "@/modules/common/api-error";
import {
  AI_MODEL_NAME,
  AI_PROMPT_VERSION,
  AI_SCHEMA_VERSION,
} from "@/modules/ai-extraction/repository";
import {
  aiExtractionPayloadAnySchema,
  buildAiFieldComparisons,
  findInvalidAnyAiEvidence,
  isGcnExtractionPayloadV2,
} from "@/modules/ai-extraction/draft";
import {
  buildGcnV2BackendComparisons,
  buildGcnV2LeafSuggestions,
  comparisonEvidenceForStorage,
  findGcnV2PersonalInfoInNotes,
  hydrateGcnV2ApplicationDraft,
  validateGcnV2RuntimeMetadata,
} from "@/modules/ai-extraction/gcn-v2-application-backend";
import {
  computeInputFingerprint,
  computeResultFingerprint,
} from "@/modules/ai-extraction/fingerprints";
import { loadServerEnvironment } from "@/modules/common/env";
import type { IntakeDraft } from "@/modules/public-intake/types";
import { getDatabase } from "@/modules/supabase/database";
import { validateAiResultPayload, type ValidationIssue } from "../../../../../scripts/ai/validator";

export const runtime = "nodejs";

const schema = z
  .object({
    jobId: z.string().trim().min(1).max(100),
    workerInstanceId: z.string().trim().min(1).max(100),
    inputFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    rawJson: aiExtractionPayloadAnySchema,
    modelName: z.literal(AI_MODEL_NAME),
    promptVersion: z.union([z.literal(AI_PROMPT_VERSION), z.literal("v2.0")]),
  })
  .strict();

function fail(
  code:
    | "ACCESS_DENIED"
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

class AiIdempotencyConflictError extends Error {}
class AiJobNotFoundError extends Error {}
class AiJobUnavailableError extends Error {}
class AiResultMetadataInvalidError extends Error {}

interface AiResultResponse {
  readonly resultId: string;
  readonly resultVersion: number;
  readonly validationStatus: "PASSED" | "REVIEW_REQUIRED" | "BLOCKED";
  readonly warningCount: number;
}

type ResultTransactionOutcome =
  { readonly kind: "STALE" } | { readonly kind: "SUCCESS"; readonly response: AiResultResponse };

export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = request.headers.get("x-request-id") ?? randomUUID();
  try {
    const environment = loadServerEnvironment();
    if (!environment.AI_EXTRACTION_ENABLED) {
      return fail("SERVICE_UNAVAILABLE", "Tính năng trích xuất AI chưa được bật.", requestId, 503);
    }

    const workerKey = request.headers.get("x-ai-worker-key");
    const expectedKey = environment.AI_WORKER_API_KEY;
    if (!expectedKey || !workerKey || workerKey !== expectedKey) {
      return fail("UNAUTHENTICATED", "Khóa xác thực worker AI không hợp lệ.", requestId, 401);
    }
    const idempotencyKey = request.headers.get("idempotency-key");
    const body = schema.safeParse(await request.json());
    if (!body.success || !idempotencyKey || idempotencyKey.length > 256) {
      return fail(
        "VALIDATION_FAILED",
        "Kết quả AI hoặc khóa chống gửi trùng không hợp lệ.",
        requestId,
        400,
      );
    }

    const { jobId, workerInstanceId, inputFingerprint, rawJson, modelName, promptVersion } =
      body.data;
    if (
      isGcnExtractionPayloadV2(rawJson) &&
      (rawJson.metadata.modelIdentifier !== modelName ||
        rawJson.metadata.sourceDocumentHash !== inputFingerprint)
    ) {
      return fail(
        "VALIDATION_FAILED",
        "Metadata kết quả AI không khớp request hiện hành.",
        requestId,
        400,
      );
    }
    if (isGcnExtractionPayloadV2(rawJson) && findGcnV2PersonalInfoInNotes(rawJson).length > 0) {
      return fail(
        "VALIDATION_FAILED",
        "Ghi chú kết quả AI chứa dữ liệu định danh không được phép.",
        requestId,
        400,
      );
    }
    const issues = validateAiResultPayload(rawJson);
    const blockingCount = issues.filter(
      (issue: ValidationIssue) => issue.severity === "BLOCKING",
    ).length;
    const warningCount = issues.filter(
      (issue: ValidationIssue) => issue.severity === "WARNING",
    ).length;
    if (issues.some((issue) => issue.code === "CITIZEN_ID_LIKE_VALUE")) {
      return fail(
        "VALIDATION_FAILED",
        "Kết quả AI có dữ liệu giống CCCD nên không được lưu.",
        requestId,
        400,
      );
    }
    const resultFingerprint = computeResultFingerprint(jobId, rawJson);
    const scopedIdempotencyKey = `AI_RESULT:${jobId}:${idempotencyKey}`;
    const mutationHash = createHash("sha256")
      .update(
        JSON.stringify({
          jobId,
          workerInstanceId,
          inputFingerprint,
          modelName,
          promptVersion,
          resultFingerprint,
        }),
      )
      .digest("hex");

    const database = getDatabase();
    const outcome = await database.begin<ResultTransactionOutcome>(async (transaction) => {
      await transaction`select pg_advisory_xact_lock(hashtextextended(${scopedIdempotencyKey}, 0))`;
      const cached = await transaction<{ mutation_hash: string; response_json: unknown }[]>`
        select mutation_hash, response_json from public.request_log
        where idempotency_key = ${scopedIdempotencyKey}
      `;
      if (cached[0]) {
        if (cached[0].mutation_hash !== mutationHash) throw new AiIdempotencyConflictError();
        const replay = (
          typeof cached[0].response_json === "string"
            ? JSON.parse(cached[0].response_json)
            : cached[0].response_json
        ) as unknown;
        if (
          replay &&
          typeof replay === "object" &&
          !Array.isArray(replay) &&
          "outcome" in replay &&
          replay.outcome === "STALE"
        ) {
          return { kind: "STALE" };
        }
        return {
          kind: "SUCCESS",
          response: replay as AiResultResponse,
        };
      }

      const jobs = await transaction<
        {
          job_id: string;
          submission_id: string | null;
          citizen_payload_version: number;
          input_fingerprint: string;
          prompt_version: string;
          schema_version: string;
          model_name: string;
          status: string;
          worker_instance_id: string;
          lease_expires_at: Date | string | null;
        }[]
      >`
        select job_id, submission_id, citizen_payload_version, input_fingerprint, prompt_version,
          schema_version, model_name, status, worker_instance_id, lease_expires_at
        from public.ai_extraction_jobs where job_id = ${jobId} for update
      `;
      const job = jobs[0];
      if (!job || !job.submission_id) throw new AiJobNotFoundError();
      const leaseExpiresAt = job.lease_expires_at ? new Date(job.lease_expires_at).getTime() : 0;
      if (
        job.status !== "PROCESSING" ||
        job.worker_instance_id !== workerInstanceId ||
        !leaseExpiresAt ||
        leaseExpiresAt <= Date.now()
      ) {
        throw new AiJobUnavailableError();
      }
      if (
        job.input_fingerprint !== inputFingerprint ||
        job.prompt_version !== promptVersion ||
        job.model_name !== modelName ||
        !(
          (job.schema_version === AI_SCHEMA_VERSION && isGcnExtractionPayloadV2(rawJson)) ||
          (job.schema_version === "v2.0" && !isGcnExtractionPayloadV2(rawJson))
        )
      ) {
        throw new AiJobUnavailableError();
      }

      const submissions = await transaction<
        {
          citizen_payload_version: number;
          citizen_payload_json: unknown;
          working_payload_json: unknown;
          draft_json: unknown;
        }[]
      >`
        select citizen_payload_version, citizen_payload_json, working_payload_json, draft_json
        from public.public_submissions where submission_id = ${job.submission_id}
      `;
      const submission = submissions[0];
      const declaredFiles = await transaction<{ count: string | number }[]>`
        select count(*) as count from public.ai_extraction_job_files where job_id = ${jobId}
      `;
      const verifiedManifestFiles = await transaction<{ file_id: string; ordinal: number }[]>`
        select jf.file_id, jf.ordinal
        from public.ai_extraction_job_files jf
        join public.public_files pf on pf.file_id = jf.file_id
        where jf.job_id = ${jobId}
          and pf.submission_id = ${job.submission_id}
          and pf.document_type = 'CERTIFICATE'
          and pf.variant = 'ORIGINAL'
          and pf.status = 'UPLOADED'
          and pf.checksum_sha256 = jf.checksum_sha256
          and pf.file_name = jf.file_name
      `;
      const currentFiles = await transaction<{ checksum_sha256: string }[]>`
        select checksum_sha256 from public.public_files
        where submission_id = ${job.submission_id}
          and document_type = 'CERTIFICATE' and variant = 'ORIGINAL' and status = 'UPLOADED'
      `;
      const currentFingerprint = submission
        ? computeInputFingerprint(
            job.submission_id,
            submission.citizen_payload_version,
            currentFiles.map((file) => file.checksum_sha256),
          )
        : "";
      const manifestInvalid =
        Number(declaredFiles[0]?.count ?? 0) === 0 ||
        verifiedManifestFiles.length !== Number(declaredFiles[0]?.count ?? 0);
      const evidenceInvalid = findInvalidAnyAiEvidence(
        rawJson,
        new Set(verifiedManifestFiles.map((file) => file.file_id)),
      ).filter(
        (issue) =>
          issue.code === "V2_EVIDENCE_NOT_IN_MANIFEST" ||
          issue.code === "CLEAR_EVIDENCE_NOT_IN_MANIFEST",
      );
      if (
        !submission ||
        !submission.draft_json ||
        submission.citizen_payload_version !== job.citizen_payload_version ||
        manifestInvalid ||
        currentFingerprint !== job.input_fingerprint
      ) {
        const errorCode = manifestInvalid ? "MANIFEST_INVALID" : "INPUT_CHANGED";
        await transaction`
          update public.ai_extraction_jobs
          set status = 'STALE', error_code = ${errorCode},
            error_message_redacted = 'Dữ liệu, ảnh GCN hoặc manifest đã thay đổi.',
            lease_expires_at = null, updated_at = now()
          where job_id = ${jobId}
        `;
        await transaction`
          insert into public.audit_logs (actor_email, action, entity_type, entity_id, request_id, metadata)
          values ('AI_STATION', 'AI_EXTRACTION_STALE', 'AI_EXTRACTION_JOB', ${jobId}, ${requestId}, '{}'::jsonb)
        `;
        await transaction`
          insert into public.request_log (idempotency_key, request_id, kind, mutation_hash, response_json, expires_at)
          values (${scopedIdempotencyKey}, ${requestId}, 'AI_RESULT', ${mutationHash},
            '{"outcome":"STALE"}'::jsonb, now() + interval '24 hours')
        `;
        return { kind: "STALE" };
      }

      if (isGcnExtractionPayloadV2(rawJson)) {
        const runtimeMetadataIssues = validateGcnV2RuntimeMetadata({
          payload: rawJson,
          expectedSchemaVersion: job.schema_version,
          expectedPromptVersion: job.prompt_version,
          expectedModelIdentifier: modelName,
          expectedSourceHash: job.input_fingerprint,
          allowedFileIds: new Set(verifiedManifestFiles.map((file) => file.file_id)),
        });
        if (runtimeMetadataIssues.length > 0) throw new AiResultMetadataInvalidError();
      }

      const finalBlockingCount = blockingCount + evidenceInvalid.length;
      const finalValidationStatus =
        finalBlockingCount > 0 ? "BLOCKED" : warningCount > 0 ? "REVIEW_REQUIRED" : "PASSED";

      const versions = await transaction<{ next_version: number }[]>`
        select coalesce(max(result_version), 0) + 1 as next_version
        from public.ai_extraction_results where job_id = ${jobId}
      `;
      const resultVersion = versions[0]?.next_version ?? 1;
      const resultId = `aires_${randomUUID()}`;
      await transaction`
        insert into public.ai_extraction_results (
          result_id, job_id, result_version, raw_json, normalized_json, validation_status,
          warning_count, blocking_issue_count, result_fingerprint, model_name, prompt_version, processed_at
        ) values (
          ${resultId}, ${jobId}, ${resultVersion}, ${JSON.stringify(rawJson)}::jsonb,
          ${JSON.stringify(rawJson)}::jsonb, ${finalValidationStatus}, ${warningCount}, ${finalBlockingCount},
          ${resultFingerprint}, ${modelName}, ${promptVersion}, now()
        )
      `;
      const draft = parseDraft(submission.working_payload_json ?? submission.draft_json);
      const citizenDraft = submission.citizen_payload_json
        ? parseDraft(submission.citizen_payload_json)
        : null;
      if (isGcnExtractionPayloadV2(rawJson)) {
        const priorRows = await transaction<{ field_path: string; ai_value: string | null }[]>`
          select c.field_path, c.ai_value
          from public.ai_field_comparisons c
          join public.ai_extraction_jobs j on j.job_id = c.job_id
          where j.submission_id = ${job.submission_id} and c.decision = 'APPLIED'
          order by c.decided_at desc nulls last, c.created_at desc
        `;
        const priorAppliedValues = new Map<string, string>();
        for (const prior of priorRows) {
          if (prior.ai_value !== null && !priorAppliedValues.has(prior.field_path)) {
            priorAppliedValues.set(prior.field_path, prior.ai_value);
          }
        }
        const comparisons = buildGcnV2BackendComparisons({
          current: draft,
          citizen: citizenDraft,
          payload: rawJson,
          suggestions: buildGcnV2LeafSuggestions(
            rawJson,
            new Map(verifiedManifestFiles.map((file) => [file.file_id, file.ordinal + 1])),
          ),
          priorAppliedValues,
        });
        for (const comparison of comparisons) {
          await transaction`
            insert into public.ai_field_comparisons (
              job_id, result_id, field_path, current_value, ai_value, source_value, field_status, evidence_json
            ) values (
              ${jobId}, ${resultId}, ${comparison.fieldPath}, ${comparison.currentValue},
              ${comparison.aiValue}, ${comparison.sourceValue}, ${comparison.fieldStatus},
              ${JSON.stringify(comparisonEvidenceForStorage(comparison))}::jsonb
            )
          `;
        }
      } else {
        for (const comparison of buildAiFieldComparisons(draft, rawJson)) {
          await transaction`
            insert into public.ai_field_comparisons (
              job_id, result_id, field_path, current_value, ai_value, source_value, field_status, evidence_json
            ) values (
              ${jobId}, ${resultId}, ${comparison.fieldPath}, ${comparison.currentValue},
              ${comparison.aiValue}, ${comparison.sourceValue}, ${comparison.fieldStatus},
              ${JSON.stringify(comparison.evidence)}::jsonb
            )
          `;
        }
      }
      const newStatus =
        finalValidationStatus === "PASSED"
          ? "COMPLETED"
          : finalValidationStatus === "BLOCKED"
            ? "QUARANTINED"
            : "NEEDS_REVIEW";
      await transaction`
        update public.ai_extraction_jobs
        set status = ${newStatus}, completed_at = now(), lease_expires_at = null, updated_at = now()
        where job_id = ${jobId}
      `;
      await transaction`
        insert into public.audit_logs (actor_email, action, entity_type, entity_id, request_id, metadata)
        values (
          'AI_STATION', 'AI_EXTRACTION_RESULT_IMPORTED', 'AI_EXTRACTION_JOB', ${jobId}, ${requestId},
          ${JSON.stringify({
            validationStatus: finalValidationStatus,
            warningCount,
            blockingCount: finalBlockingCount,
            evidenceInvalidCount: evidenceInvalid.length,
            resultVersion,
            modelName,
          })}::jsonb
        )
      `;
      const result: AiResultResponse = {
        resultId,
        resultVersion,
        validationStatus: finalValidationStatus,
        warningCount,
      };
      await transaction`
        insert into public.request_log (idempotency_key, request_id, kind, mutation_hash, response_json, expires_at)
        values (${scopedIdempotencyKey}, ${requestId}, 'AI_RESULT', ${mutationHash}, ${JSON.stringify(result)}::jsonb, now() + interval '24 hours')
      `;
      return { kind: "SUCCESS", response: result };
    });
    if (outcome.kind === "STALE") {
      return fail(
        "VERSION_CONFLICT",
        "Ảnh GCN, dữ liệu nguồn hoặc manifest đã thay đổi; không nhận kết quả AI cũ.",
        requestId,
        409,
      );
    }
    return NextResponse.json(
      { result: outcome.response, requestId },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error: unknown) {
    if (error instanceof AiJobNotFoundError) {
      return fail("NOT_FOUND", "Không tìm thấy job AI tương ứng.", requestId, 404);
    }
    if (error instanceof AiJobUnavailableError) {
      return fail(
        "VERSION_CONFLICT",
        "Job không còn do worker này giữ hoặc lease đã hết hạn.",
        requestId,
        409,
      );
    }
    if (error instanceof AiIdempotencyConflictError) {
      return fail(
        "IDEMPOTENCY_CONFLICT",
        "Khóa chống gửi trùng đã dùng cho kết quả khác.",
        requestId,
        409,
      );
    }
    if (error instanceof AiResultMetadataInvalidError) {
      return fail(
        "VALIDATION_FAILED",
        "Metadata kết quả AI không khớp job hoặc manifest hiện hành.",
        requestId,
        400,
      );
    }
    return fail("INTERNAL_ERROR", "Không thể lưu kết quả trích xuất AI.", requestId, 500);
  }
}

function parseDraft(value: unknown): IntakeDraft {
  const draft = hydrateGcnV2ApplicationDraft(value);
  if (!draft) throw new Error("Stored submission payload is invalid.");
  return draft;
}
