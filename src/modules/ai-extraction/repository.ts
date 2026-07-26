import { randomUUID } from "node:crypto";

import type { Sql } from "postgres";

import { getDatabase } from "@/modules/supabase/database";
import type { IntakeDraft } from "@/modules/public-intake/types";

import {
  aiExtractionPayloadSchema,
  buildAiFieldComparisons,
  type AiExtractionPayload,
  type AiFieldComparisonDraft,
} from "./draft";
import { computeInputFingerprint } from "./fingerprints";

export const AI_WORKER_TYPE = "ANTIGRAVITY";
export const AI_MODEL_NAME = "gemini-3.6-flash";
export const AI_PROMPT_VERSION = "v2.0";
export const AI_SCHEMA_VERSION = "v2.0";
export const AI_STATION_ACCESS_RISK = "ADMIN_BROAD_ACCESS";

interface AiJobRow {
  readonly job_id: string;
  readonly submission_id: string | null;
  readonly case_id: string | null;
  readonly subject_type: "PUBLIC_SUBMISSION" | "CASE";
  readonly citizen_payload_version: number;
  readonly status: string;
  readonly input_fingerprint: string;
  readonly prompt_version: string;
  readonly schema_version: string;
  readonly model_name: string;
  readonly created_at: Date;
  readonly completed_at: Date | null;
}

interface AiResultRow {
  readonly result_id: string;
  readonly job_id: string;
  readonly raw_json: unknown;
  readonly validation_status: "PASSED" | "REVIEW_REQUIRED" | "BLOCKED";
  readonly warning_count: number;
  readonly blocking_issue_count: number;
  readonly model_name: string;
  readonly prompt_version: string;
  readonly processed_at: Date | null;
  readonly created_at: Date;
}

function asIso(value: Date | null): string {
  return value ? value.toISOString() : "";
}

function parseJson<T>(value: unknown): T {
  if (typeof value === "string") return JSON.parse(value) as T;
  return value as T;
}

export interface AiDraftForSubmission {
  readonly jobId: string;
  readonly status: string;
  readonly resultId: string;
  readonly validationStatus: "PASSED" | "REVIEW_REQUIRED" | "BLOCKED";
  readonly warningCount: number;
  readonly modelName: string;
  readonly promptVersion: string;
  readonly processedAt: string;
  readonly inputFingerprint: string;
  readonly stationAccessRisk: typeof AI_STATION_ACCESS_RISK;
  readonly payload: AiExtractionPayload;
}

export async function enqueueAiDraftForSubmission(
  transaction: Sql,
  input: {
    submissionId: string;
    citizenPayloadVersion: number;
  },
): Promise<string | null> {
  const files = await transaction<
    { file_id: string; checksum_sha256: string; file_name: string }[]
  >`
    select file_id, checksum_sha256, file_name
    from public.public_files
    where submission_id = ${input.submissionId}
      and document_type = 'CERTIFICATE' and status = 'UPLOADED'
    order by created_at, file_id
  `;
  if (files.length === 0) return null;

  const inputFingerprint = computeInputFingerprint(
    input.submissionId,
    input.citizenPayloadVersion,
    files.map((file) => file.checksum_sha256),
  );
  const jobId = `aijob_${randomUUID()}`;
  const inputFiles = files.map((file, ordinal) => ({
    fileId: file.file_id,
    checksum: file.checksum_sha256,
    fileName: file.file_name,
    ordinal,
  }));
  const inserted = await transaction<{ job_id: string }[]>`
    insert into public.ai_extraction_jobs (
      job_id, submission_id, subject_type, citizen_payload_version, status, worker_type,
      schema_version, prompt_version, model_name, input_fingerprint, input_files_json,
      manifest_version, station_access_risk
    ) values (
      ${jobId}, ${input.submissionId}, 'PUBLIC_SUBMISSION', ${input.citizenPayloadVersion},
      'READY_FOR_AGENT', ${AI_WORKER_TYPE}, ${AI_SCHEMA_VERSION}, ${AI_PROMPT_VERSION},
      ${AI_MODEL_NAME}, ${inputFingerprint}, ${JSON.stringify(inputFiles)}::jsonb,
      'v1.0', ${AI_STATION_ACCESS_RISK}
    )
    on conflict (submission_id, input_fingerprint, prompt_version, schema_version)
    do update set updated_at = now()
    returning job_id
  `;
  const persistedJobId = inserted[0]?.job_id;
  if (!persistedJobId) return null;

  for (const file of inputFiles) {
    await transaction`
      insert into public.ai_extraction_job_files (job_id, file_id, checksum_sha256, file_name, ordinal)
      values (${persistedJobId}, ${file.fileId}, ${file.checksum}, ${file.fileName}, ${file.ordinal})
      on conflict (job_id, file_id) do nothing
    `;
  }
  return persistedJobId;
}

export class AiExtractionRepository {
  async findLatestDraftForSubmission(submissionId: string): Promise<AiDraftForSubmission | null> {
    const database = getDatabase();
    const rows = await database<(AiJobRow & AiResultRow)[]>`
      select j.job_id, j.submission_id, j.case_id, j.subject_type, j.citizen_payload_version,
        j.status, j.input_fingerprint, j.prompt_version as job_prompt_version,
        j.schema_version, j.model_name as job_model_name, j.created_at as job_created_at,
        j.completed_at, r.result_id, r.raw_json, r.validation_status, r.warning_count,
        r.blocking_issue_count, r.model_name, r.prompt_version, r.processed_at,
        r.created_at as result_created_at
      from public.ai_extraction_jobs j
      join public.ai_extraction_results r on r.job_id = j.job_id
      where j.submission_id = ${submissionId}
        and j.status in ('COMPLETED', 'NEEDS_REVIEW', 'QUARANTINED')
        and j.citizen_payload_version = (
          select citizen_payload_version from public.public_submissions where submission_id = ${submissionId}
        )
      order by r.created_at desc
      limit 1
    `;
    const row = rows[0];
    if (!row) return null;
    const parsed = aiExtractionPayloadSchema.safeParse(parseJson(row.raw_json));
    if (!parsed.success) return null;
    return {
      jobId: row.job_id,
      status: row.status,
      resultId: row.result_id,
      validationStatus: row.validation_status,
      warningCount: row.warning_count,
      modelName: row.model_name,
      promptVersion: row.prompt_version,
      processedAt: asIso(row.processed_at),
      inputFingerprint: row.input_fingerprint,
      stationAccessRisk: AI_STATION_ACCESS_RISK,
      payload: parsed.data,
    };
  }

  async getCurrentComparisons(
    submissionId: string,
    draft: IntakeDraft,
  ): Promise<{ draft: AiDraftForSubmission; comparisons: AiFieldComparisonDraft[] } | null> {
    const aiDraft = await this.findLatestDraftForSubmission(submissionId);
    if (!aiDraft) return null;
    const database = getDatabase();
    const current = await database<{ citizen_payload_version: number }[]>`
      select citizen_payload_version from public.public_submissions where submission_id = ${submissionId}
    `;
    const files = await database<{ checksum_sha256: string }[]>`
      select checksum_sha256 from public.public_files
      where submission_id = ${submissionId} and document_type = 'CERTIFICATE' and status = 'UPLOADED'
    `;
    if (
      !current[0] ||
      computeInputFingerprint(
        submissionId,
        current[0].citizen_payload_version,
        files.map((file) => file.checksum_sha256),
      ) !== aiDraft.inputFingerprint
    ) {
      return null;
    }
    return { draft: aiDraft, comparisons: buildAiFieldComparisons(draft, aiDraft.payload) };
  }
}

let repository: AiExtractionRepository | undefined;
export function getAiExtractionRepository(): AiExtractionRepository {
  repository ??= new AiExtractionRepository();
  return repository;
}
