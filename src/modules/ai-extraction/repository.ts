import { randomUUID } from "node:crypto";

import type { Sql } from "postgres";

import { getDatabase } from "@/modules/supabase/database";
import type { IntakeDraft } from "@/modules/public-intake/types";
import type { SubmissionRecord } from "@/modules/public-intake/repository";

import {
  aiExtractionPayloadSchema,
  buildAiFieldComparisons,
  findInvalidClearEvidence,
  type AiExtractionPayload,
  type AiFieldComparisonDraft,
} from "./draft";
import { computeInputFingerprint } from "./fingerprints";
import {
  GCN_V2_PROMPT_VERSION,
  GCN_V2_SCHEMA_VERSION,
  type GcnExtractionPayloadV2,
  type GcnFieldProvenance,
} from "./gcn-v2-contract";
import {
  buildGcnV2BackendComparisons,
  buildGcnV2LeafSuggestions,
  hydrateGcnV2ApplicationDraft,
  validateGcnV2RuntimeMetadata,
  type GcnV2BackendComparison,
} from "./gcn-v2-application-backend";
import {
  findInvalidGcnV2Evidence,
  gcnExtractionPayloadV2Schema,
  isGcnExtractionPayloadV2,
} from "./gcn-v2-schema";

export const AI_WORKER_TYPE = "ANTIGRAVITY";
export const AI_MODEL_NAME = "gemini-3.6-flash";
export const AI_PROMPT_VERSION = GCN_V2_PROMPT_VERSION;
export const AI_SCHEMA_VERSION = GCN_V2_SCHEMA_VERSION;
export const AI_STATION_ACCESS_RISK = "ADMIN_BROAD_ACCESS";
const LEGACY_AI_VERSION = "v2.0";

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
  readonly schemaVersion: string;
  readonly payload: AiExtractionPayload | GcnExtractionPayloadV2;
}

export type AiDraftComparison = AiFieldComparisonDraft | GcnV2BackendComparison;

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
      and document_type = 'CERTIFICATE' and variant = 'ORIGINAL' and status = 'UPLOADED'
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
    const rawPayload = parseJson<unknown>(row.raw_json);
    const parsedV2 = gcnExtractionPayloadV2Schema.safeParse(rawPayload);
    const parsedLegacy = aiExtractionPayloadSchema.safeParse(rawPayload);
    const payload =
      row.schema_version === GCN_V2_SCHEMA_VERSION && parsedV2.success
        ? parsedV2.data
        : row.schema_version === LEGACY_AI_VERSION && parsedLegacy.success
          ? parsedLegacy.data
          : null;
    if (!payload) return null;
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
      schemaVersion: row.schema_version,
      payload,
    };
  }

  async getCurrentComparisons(
    submissionId: string,
    record: SubmissionRecord,
  ): Promise<{ draft: AiDraftForSubmission; comparisons: AiDraftComparison[] } | null> {
    const aiDraft = await this.findLatestDraftForSubmission(submissionId);
    if (!aiDraft) return null;
    const currentDraft = hydrateGcnV2ApplicationDraft(record.workingPayload ?? record.draft);
    if (!currentDraft) return null;
    const citizenDraft = hydrateGcnV2ApplicationDraft(record.citizenPayload);
    const database = getDatabase();
    const current = await database<{ citizen_payload_version: number }[]>`
      select citizen_payload_version from public.public_submissions where submission_id = ${submissionId}
    `;
    const files = await database<{ checksum_sha256: string }[]>`
      select checksum_sha256 from public.public_files
      where submission_id = ${submissionId}
        and document_type = 'CERTIFICATE' and variant = 'ORIGINAL' and status = 'UPLOADED'
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
    const manifestFiles = await database<{ file_id: string; ordinal: number }[]>`
      select jf.file_id, jf.ordinal
      from public.ai_extraction_job_files jf
      join public.public_files pf on pf.file_id = jf.file_id
      where jf.job_id = ${aiDraft.jobId}
        and pf.submission_id = ${submissionId}
        and pf.document_type = 'CERTIFICATE'
        and pf.variant = 'ORIGINAL'
        and pf.status = 'UPLOADED'
        and pf.checksum_sha256 = jf.checksum_sha256
        and pf.file_name = jf.file_name
    `;
    const declaredFiles = await database<{ count: string | number }[]>`
      select count(*) as count from public.ai_extraction_job_files where job_id = ${aiDraft.jobId}
    `;
    if (
      Number(declaredFiles[0]?.count ?? 0) === 0 ||
      manifestFiles.length !== Number(declaredFiles[0]?.count ?? 0)
    ) {
      return null;
    }
    const allowedFileIds = new Set(manifestFiles.map((file) => file.file_id));
    if (isGcnExtractionPayloadV2(aiDraft.payload)) {
      if (
        findInvalidGcnV2Evidence(aiDraft.payload, allowedFileIds).length > 0 ||
        validateGcnV2RuntimeMetadata({
          payload: aiDraft.payload,
          expectedSchemaVersion: aiDraft.schemaVersion,
          expectedPromptVersion: aiDraft.promptVersion,
          expectedModelIdentifier: aiDraft.modelName,
          expectedSourceHash: aiDraft.inputFingerprint,
          allowedFileIds,
        }).length > 0
      ) {
        return null;
      }
      const priorRows = await database<{ field_path: string; ai_value: string | null }[]>`
        select c.field_path, c.ai_value
        from public.ai_field_comparisons c
        join public.ai_extraction_jobs j on j.job_id = c.job_id
        where j.submission_id = ${submissionId} and c.decision = 'APPLIED'
        order by c.decided_at desc nulls last, c.created_at desc
      `;
      const priorAppliedValues = new Map<string, string>();
      for (const row of priorRows) {
        if (row.ai_value !== null && !priorAppliedValues.has(row.field_path)) {
          priorAppliedValues.set(row.field_path, row.ai_value);
        }
      }
      return {
        draft: aiDraft,
        comparisons: buildGcnV2BackendComparisons({
          current: currentDraft,
          citizen: citizenDraft,
          payload: aiDraft.payload,
          suggestions: buildGcnV2LeafSuggestions(
            aiDraft.payload,
            new Map(manifestFiles.map((file) => [file.file_id, file.ordinal + 1])),
          ),
          priorAppliedValues,
        }),
      };
    }
    if (findInvalidClearEvidence(aiDraft.payload, allowedFileIds).length > 0) return null;
    const comparisons = buildAiFieldComparisons(currentDraft, aiDraft.payload).map((comparison) => {
      const citizenValue = legacyCertificateValue(citizenDraft, comparison.fieldPath);
      const provenance: GcnFieldProvenance = comparison.currentValue.trim()
        ? citizenValue.trim() === comparison.currentValue.trim()
          ? "CITIZEN_PROVIDED"
          : "OFFICER_EDITED"
        : "EMPTY";
      const applyable =
        provenance === "EMPTY" &&
        comparison.fieldStatus === "CLEAR" &&
        !!comparison.aiValue?.trim();
      return { ...comparison, provenance, applyable, canApply: applyable };
    });
    return { draft: aiDraft, comparisons };
  }
}

function legacyCertificateValue(
  citizen: IntakeDraft | null | undefined,
  fieldPath: AiFieldComparisonDraft["fieldPath"],
): string {
  if (!citizen) return "";
  if (fieldPath === "certificate.issueNumber") return citizen.certificate.issueNumber;
  if (fieldPath === "certificate.issueDate") return citizen.certificate.issueDate;
  return citizen.certificate.registryNumber;
}

let repository: AiExtractionRepository | undefined;
export function getAiExtractionRepository(): AiExtractionRepository {
  repository ??= new AiExtractionRepository();
  return repository;
}
