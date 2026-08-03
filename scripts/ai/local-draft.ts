/**
 * Trạm AI chạy tại máy quản trị — coding agent (Claude Code/Codex/Antigravity) tự đọc ảnh GCN đã
 * đồng bộ về My Drive rồi ghi nháp vào Supabase, không đi qua `/api/ai/*`.
 *
 *     npx tsx scripts/ai/local-draft.ts list
 *     npx tsx scripts/ai/local-draft.ts enqueue --submission=<submissionId>
 *     npx tsx scripts/ai/local-draft.ts submit --job=<jobId> --result=<duong-dan.json> --model=<ten-model>
 *
 * `list` in ra job đang chờ kèm đường dẫn ảnh cục bộ và kết quả đối chiếu checksum: agent chỉ được
 * mở ảnh có trạng thái `OK`. `enqueue` tạo job mới theo bộ ảnh GCN **hiện tại** của một hồ sơ — cần
 * khi cán bộ bổ sung ảnh sau lúc gửi, làm job cũ lệch fingerprint. `submit` nhận file JSON đúng
 * schema v2 do agent viết ra, chạy lại toàn bộ guard của `POST /api/ai/results` (quét chuỗi giống
 * CCCD, quét prompt injection, đối chiếu manifest và fingerprint) rồi ghi `ai_extraction_results` +
 * `ai_field_comparisons` trong một transaction.
 *
 * Script này thay đường ghi, **không** nới quyền: AI vẫn chỉ tạo nháp, cán bộ vẫn là người duy nhất
 * nạp giá trị vào hồ sơ. Không in tên chủ sử dụng, CCCD, Drive ID hay chuỗi kết nối.
 */

import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { loadEnvConfig } from "@next/env";
import type { Sql } from "postgres";

import {
  findInvalidGcnV2Evidence,
  gcnExtractionPayloadV2Schema,
  type GcnExtractionPayloadV2,
} from "../../src/modules/ai-extraction/draft";
import {
  buildGcnV2BackendComparisons,
  buildGcnV2LeafSuggestions,
  comparisonEvidenceForStorage,
  findGcnV2PersonalInfoInNotes,
  hydrateGcnV2ApplicationDraft,
  validateGcnV2RuntimeMetadata,
} from "../../src/modules/ai-extraction/gcn-v2-application-backend";
import {
  computeInputFingerprint,
  computeResultFingerprint,
} from "../../src/modules/ai-extraction/fingerprints";
import {
  decideResultOutcome,
  parseLocalDraftOptions,
  parseStoredLocalResult,
  resolveManifestFilePath,
  type LocalDraftOptions,
} from "../../src/modules/ai-extraction/local-draft-support";
import {
  AI_PROMPT_VERSION,
  AI_SCHEMA_VERSION,
  enqueueAiDraftForSubmission,
} from "../../src/modules/ai-extraction/repository";
import {
  aiJobCoverageKey,
  aiJobExpectedMetadata,
} from "../../src/modules/ai-extraction/gcn-v2-repository-job-key";
import type { IntakeDraft } from "../../src/modules/public-intake/types";
import { getDatabase } from "../../src/modules/supabase/database";
import { validateAiResultPayload } from "./validator";

loadEnvConfig(process.cwd());

/**
 * Chỉ những file vừa nằm trong manifest vừa còn khớp `public_files` mới được coi là hợp lệ — cùng
 * điều kiện mà `POST /api/ai/results` dùng, để đường ghi cục bộ không dễ dãi hơn đường API.
 */
function selectManifestFiles(sql: Sql, jobId: string, submissionId: string) {
  return sql<{ file_id: string; file_name: string; checksum_sha256: string; ordinal: number }[]>`
    select jf.file_id, jf.file_name, jf.checksum_sha256, jf.ordinal
    from public.ai_extraction_job_files jf
    join public.public_files pf on pf.file_id = jf.file_id
    where jf.job_id = ${jobId}
      and pf.submission_id = ${submissionId}
      and pf.document_type = 'CERTIFICATE'
      and pf.variant = 'ORIGINAL'
      and pf.status = 'UPLOADED'
      and pf.checksum_sha256 = jf.checksum_sha256
      and pf.file_name = jf.file_name
    order by jf.ordinal
  `;
}

async function checksumStateOf(filePath: string, expected: string): Promise<string> {
  let bytes: Buffer;
  try {
    bytes = await readFile(filePath);
  } catch {
    return "MISSING";
  }
  return createHash("sha256").update(bytes).digest("hex") === expected ? "OK" : "CHECKSUM_MISMATCH";
}

async function list(options: LocalDraftOptions): Promise<void> {
  const database = getDatabase();
  const jobs = await database<
    {
      job_id: string;
      submission_id: string;
      status: string;
      input_fingerprint: string;
      prompt_version: string;
      schema_version: string;
    }[]
  >`
    select job_id, submission_id, status, input_fingerprint, prompt_version, schema_version
    from public.ai_extraction_jobs
    where subject_type = 'PUBLIC_SUBMISSION'
      and submission_id is not null
      and status in ('READY_FOR_AGENT', 'PROCESSING')
      and prompt_version = ${AI_PROMPT_VERSION}
      and schema_version = ${AI_SCHEMA_VERSION}
    order by created_at
    limit ${options.limit}
  `;
  if (jobs.length === 0) {
    console.log("Không có job AI nào đang chờ.");
  } else {
    console.log(`${jobs.length} job đang chờ đọc GCN:\n`);
  }
  for (const job of jobs) {
    const files = await selectManifestFiles(database, job.job_id, job.submission_id);
    console.log(`job ${job.job_id}  [${job.status}]  submission ${job.submission_id}`);
    console.log(
      `  expectedMetadata=${JSON.stringify(
        aiJobExpectedMetadata({
          inputFingerprint: job.input_fingerprint,
          promptVersion: job.prompt_version,
          schemaVersion: job.schema_version,
        }),
      )}`,
    );
    if (files.length === 0) {
      console.log("  (manifest rỗng hoặc không còn khớp public_files — chạy lại `enqueue`)");
    }
    for (const file of files) {
      let filePath: string;
      try {
        filePath = resolveManifestFilePath(options.driveRoot, job.submission_id, file.file_name);
      } catch (error) {
        console.log(`  [REJECTED] fileId=${file.file_id}`);
        console.log(
          `           ${error instanceof Error ? error.message : "Đường dẫn không hợp lệ."}`,
        );
        continue;
      }
      console.log(
        `  [${await checksumStateOf(filePath, file.checksum_sha256)}] fileId=${file.file_id}`,
      );
      console.log(`           ${filePath}`);
    }
    console.log("");
  }

  // Ảnh GCN cán bộ bổ sung sau lúc gửi không tự sinh job mới: hồ sơ có ảnh vẫn có thể không có job
  // nào phủ đúng bộ ảnh hiện tại. So bằng fingerprint chứ không chỉ theo trạng thái job, vì một job
  // đã COMPLETED cho bộ ảnh cũ vẫn không hiển thị được cho cán bộ.
  const rows = await database<
    { submission_id: string; citizen_payload_version: number; checksum_sha256: string }[]
  >`
    select pf.submission_id, s.citizen_payload_version, pf.checksum_sha256
    from public.public_files pf
    join public.public_submissions s on s.submission_id = pf.submission_id
    where pf.document_type = 'CERTIFICATE' and pf.variant = 'ORIGINAL' and pf.status = 'UPLOADED'
  `;
  const covered = await database<
    {
      submission_id: string;
      input_fingerprint: string;
      prompt_version: string;
      schema_version: string;
    }[]
  >`
    select submission_id, input_fingerprint, prompt_version, schema_version
    from public.ai_extraction_jobs
    where submission_id is not null
      and status in ('READY_FOR_AGENT', 'PROCESSING', 'COMPLETED', 'NEEDS_REVIEW', 'QUARANTINED')
  `;
  const coveredKeys = new Set(
    covered.map((job) =>
      aiJobCoverageKey({
        submissionId: job.submission_id,
        inputFingerprint: job.input_fingerprint,
        promptVersion: job.prompt_version,
        schemaVersion: job.schema_version,
      }),
    ),
  );
  const bySubmission = new Map<string, { version: number; checksums: string[] }>();
  for (const row of rows) {
    const entry = bySubmission.get(row.submission_id) ?? {
      version: row.citizen_payload_version,
      checksums: [],
    };
    entry.checksums.push(row.checksum_sha256);
    bySubmission.set(row.submission_id, entry);
  }
  const needEnqueue = [...bySubmission.entries()]
    .filter(
      ([submissionId, entry]) =>
        !coveredKeys.has(
          aiJobCoverageKey({
            submissionId,
            inputFingerprint: computeInputFingerprint(submissionId, entry.version, entry.checksums),
            promptVersion: AI_PROMPT_VERSION,
            schemaVersion: AI_SCHEMA_VERSION,
          }),
        ),
    )
    .map(([submissionId]) => submissionId)
    .sort();
  if (needEnqueue.length > 0) {
    console.log(
      `${needEnqueue.length} hồ sơ có ảnh GCN nhưng chưa có job phủ đúng bộ ảnh hiện tại:`,
    );
    for (const submissionId of needEnqueue.slice(0, options.limit)) {
      console.log(`  npm run ai:enqueue -- --submission=${submissionId}`);
    }
    console.log("");
  }
  console.log("Chỉ mở ảnh có trạng thái OK. Không mở ảnh CCCD, không đọc QR.");
}

async function enqueue(options: LocalDraftOptions): Promise<void> {
  const jobId = await getDatabase().begin<string | null>(async (transaction) => {
    const rows = await transaction<{ citizen_payload_version: number }[]>`
      select citizen_payload_version from public.public_submissions
      where submission_id = ${options.submissionId}
    `;
    if (!rows[0]) throw new Error("Không tìm thấy hồ sơ tương ứng.");
    return enqueueAiDraftForSubmission(transaction, {
      submissionId: options.submissionId,
      citizenPayloadVersion: rows[0].citizen_payload_version,
    });
  });
  if (!jobId) {
    console.error("Hồ sơ chưa có ảnh GCN gốc nào ở trạng thái UPLOADED; không tạo job.");
    process.exitCode = 1;
    return;
  }
  console.log(`Đã có job ${jobId}. Chạy \`list\` để lấy đường dẫn ảnh.`);
}

/** Đối chiếu lại từng ảnh trong manifest với bản trên đĩa; lệch một file là dừng, không ghi gì. */
async function verifyLocalImages(sql: Sql, options: LocalDraftOptions): Promise<void> {
  const jobs = await sql<{ submission_id: string | null }[]>`
    select submission_id from public.ai_extraction_jobs where job_id = ${options.jobId}
  `;
  const submissionId = jobs[0]?.submission_id;
  if (!submissionId) throw new Error("Không tìm thấy job AI tương ứng.");
  const files = await selectManifestFiles(sql, options.jobId, submissionId);
  if (files.length === 0) {
    throw new Error("Manifest rỗng hoặc không còn khớp public_files; chạy lại `enqueue`.");
  }
  for (const file of files) {
    const filePath = resolveManifestFilePath(options.driveRoot, submissionId, file.file_name);
    const state = await checksumStateOf(filePath, file.checksum_sha256);
    if (state !== "OK") {
      throw new Error(`Ảnh ${file.file_id} đang ở trạng thái ${state}; không ghi kết quả.`);
    }
  }
}

interface SubmitOutcome {
  readonly kind: "STALE" | "REPLAY" | "SUCCESS";
  readonly resultId: string;
  readonly resultVersion: number;
  readonly validationStatus: string;
  readonly warningCount: number;
  readonly blockingCount: number;
}

async function submit(options: LocalDraftOptions): Promise<void> {
  // PowerShell trên Windows ghi UTF-8 kèm BOM; không bỏ thì `JSON.parse` báo lỗi khó hiểu và agent
  // sẽ đi sửa nội dung JSON vốn đã đúng.
  const resultText = (await readFile(options.resultPath, "utf8")).replace(/^﻿/, "");
  let parsedFile: unknown;
  try {
    parsedFile = JSON.parse(resultText);
  } catch {
    throw new Error("File kết quả không phải JSON hợp lệ; kiểm tra lại dấu phẩy và ngoặc.");
  }
  const issues = validateAiResultPayload(parsedFile);
  if (issues.some((issue) => issue.code === "CITIZEN_ID_LIKE_VALUE")) {
    throw new Error("Kết quả có chuỗi giống số CCCD nên không được ghi.");
  }
  const parsed = gcnExtractionPayloadV2Schema.safeParse(parsedFile);
  if (!parsed.success) {
    throw new Error("Kết quả không đúng schema đọc GCN được phép.");
  }
  const payload: GcnExtractionPayloadV2 = parsed.data;
  if (payload.metadata.modelIdentifier !== options.modelName) {
    throw new Error("Metadata model không khớp tham số --model.");
  }
  const personalInfoFields = findGcnV2PersonalInfoInNotes(payload);
  if (personalInfoFields.length > 0) {
    throw new Error(
      `Ghi chú có dấu hiệu chứa thông tin định danh cá nhân (${personalInfoFields.join(", ")}); ` +
        "viết lại ghi chú chỉ mô tả chất lượng ảnh rồi chạy lại.",
    );
  }
  const requestId = `local-station-${randomUUID()}`;
  const database = getDatabase();

  // Đọc lại ảnh trên đĩa **trước** khi mở transaction: `list` chỉ đối chiếu checksum lúc phát việc,
  // giữa lúc đó và lúc ghi thì Drive vẫn có thể đồng bộ đè một bản khác. Kiểm ở đây không chứng minh
  // được agent đã nhìn đúng file — điều đó nằm ngoài tầm của script — nhưng chặn được việc ghi kết
  // quả gắn với một bộ ảnh đã đổi.
  await verifyLocalImages(database, options);

  const outcome = await database.begin<SubmitOutcome>(async (transaction) => {
    const jobs = await transaction<
      {
        submission_id: string | null;
        citizen_payload_version: number;
        input_fingerprint: string;
        prompt_version: string;
        schema_version: string;
        status: string;
      }[]
    >`
      select submission_id, citizen_payload_version, input_fingerprint, prompt_version,
        schema_version, status
      from public.ai_extraction_jobs where job_id = ${options.jobId} for update
    `;
    const job = jobs[0];
    if (!job || !job.submission_id) throw new Error("Không tìm thấy job AI tương ứng.");
    const resultFingerprint = computeResultFingerprint(options.jobId, payload);
    const idempotencyKey = `AI_LOCAL_RESULT:${options.jobId}:${resultFingerprint}`;
    const mutationHash = createHash("sha256")
      .update(JSON.stringify({ jobId: options.jobId, resultFingerprint, model: options.modelName }))
      .digest("hex");
    await transaction`select pg_advisory_xact_lock(hashtextextended(${idempotencyKey}, 0))`;
    const cached = await transaction<{ mutation_hash: string; response_json: unknown }[]>`
      select mutation_hash, response_json from public.request_log
      where idempotency_key = ${idempotencyKey} and kind = 'AI_LOCAL_RESULT'
    `;
    if (cached[0]) {
      if (cached[0].mutation_hash !== mutationHash) {
        throw new Error(
          "Job này đã được ghi bằng model khác với cùng nội dung kết quả; kiểm tra lại --model.",
        );
      }
      const replay = parseStoredLocalResult(cached[0].response_json);
      if (!replay) {
        throw new Error("Bản ghi chống trùng cũ không đọc được; dừng để người dùng kiểm tra.");
      }
      return { ...replay, kind: "REPLAY" };
    }
    if (job.status !== "READY_FOR_AGENT" && job.status !== "PROCESSING") {
      throw new Error(`Job đang ở trạng thái ${job.status}, không nhận kết quả mới.`);
    }
    if (job.schema_version !== AI_SCHEMA_VERSION) {
      throw new Error("Job dùng schema khác phiên bản script đang hỗ trợ.");
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
    const declared = await transaction<{ count: string | number }[]>`
      select count(*) as count from public.ai_extraction_job_files where job_id = ${options.jobId}
    `;
    const manifestFiles = await selectManifestFiles(transaction, options.jobId, job.submission_id);
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
      Number(declared[0]?.count ?? 0) === 0 ||
      manifestFiles.length !== Number(declared[0]?.count ?? 0);

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
        where job_id = ${options.jobId}
      `;
      await transaction`
        insert into public.audit_logs (actor_email, action, entity_type, entity_id, request_id, metadata)
        values ('AI_LOCAL_STATION', 'AI_EXTRACTION_STALE', 'AI_EXTRACTION_JOB', ${options.jobId},
          ${requestId}, ${JSON.stringify({ reason: errorCode })}::jsonb)
      `;
      return {
        kind: "STALE",
        resultId: "",
        resultVersion: 0,
        validationStatus: "",
        warningCount: 0,
        blockingCount: 0,
      };
    }

    const evidenceIssues = findInvalidGcnV2Evidence(
      payload,
      new Set(manifestFiles.map((file) => file.file_id)),
    ).filter((issue) => issue.code === "V2_EVIDENCE_NOT_IN_MANIFEST");
    const metadataIssues = validateGcnV2RuntimeMetadata({
      payload,
      expectedSchemaVersion: job.schema_version,
      expectedPromptVersion: job.prompt_version,
      expectedModelIdentifier: options.modelName,
      expectedSourceHash: job.input_fingerprint,
      allowedFileIds: new Set(manifestFiles.map((file) => file.file_id)),
    });
    if (metadataIssues.length > 0) {
      throw new Error("Metadata kết quả không khớp job hoặc manifest hiện hành.");
    }
    const decision = decideResultOutcome(issues, evidenceIssues.length);

    const versions = await transaction<{ next_version: number }[]>`
      select coalesce(max(result_version), 0) + 1 as next_version
      from public.ai_extraction_results where job_id = ${options.jobId}
    `;
    const resultVersion = versions[0]?.next_version ?? 1;
    const resultId = `aires_${randomUUID()}`;
    await transaction`
      insert into public.ai_extraction_results (
        result_id, job_id, result_version, raw_json, normalized_json, validation_status,
        warning_count, blocking_issue_count, result_fingerprint, model_name, prompt_version, processed_at
      ) values (
        ${resultId}, ${options.jobId}, ${resultVersion}, ${JSON.stringify(payload)}::jsonb,
        ${JSON.stringify(payload)}::jsonb, ${decision.validationStatus}, ${decision.warningCount},
        ${decision.blockingCount}, ${resultFingerprint}, ${options.modelName},
        (select prompt_version from public.ai_extraction_jobs where job_id = ${options.jobId}), now()
      )
    `;
    const draft = parseDraft(submission.working_payload_json ?? submission.draft_json);
    const citizenDraft = submission.citizen_payload_json
      ? parseDraft(submission.citizen_payload_json)
      : null;
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
      payload,
      suggestions: buildGcnV2LeafSuggestions(
        payload,
        new Map(manifestFiles.map((file) => [file.file_id, file.ordinal + 1])),
      ),
      priorAppliedValues,
    });
    for (const comparison of comparisons) {
      await transaction`
        insert into public.ai_field_comparisons (
          job_id, result_id, field_path, current_value, ai_value, source_value, field_status, evidence_json
        ) values (
          ${options.jobId}, ${resultId}, ${comparison.fieldPath}, ${comparison.currentValue},
          ${comparison.aiValue}, ${comparison.sourceValue}, ${comparison.fieldStatus},
          ${JSON.stringify(comparisonEvidenceForStorage(comparison))}::jsonb
        )
      `;
    }
    await transaction`
      update public.ai_extraction_jobs
      set status = ${decision.nextJobStatus}, model_name = ${options.modelName},
        worker_instance_id = ${`LOCAL_AGENT:${options.modelName}`},
        started_at = coalesce(started_at, now()), completed_at = now(),
        lease_expires_at = null, attempt_count = attempt_count + 1, updated_at = now()
      where job_id = ${options.jobId}
    `;
    await transaction`
      insert into public.audit_logs (actor_email, action, entity_type, entity_id, request_id, metadata)
      values ('AI_LOCAL_STATION', 'AI_EXTRACTION_RESULT_IMPORTED', 'AI_EXTRACTION_JOB',
        ${options.jobId}, ${requestId},
        ${JSON.stringify({
          validationStatus: decision.validationStatus,
          warningCount: decision.warningCount,
          blockingCount: decision.blockingCount,
          resultVersion,
          modelName: options.modelName,
          via: "LOCAL_SCRIPT",
        })}::jsonb)
    `;
    const result: SubmitOutcome = {
      kind: "SUCCESS",
      resultId,
      resultVersion,
      validationStatus: decision.validationStatus,
      warningCount: decision.warningCount,
      blockingCount: decision.blockingCount,
    };
    await transaction`
      insert into public.request_log (idempotency_key, request_id, kind, mutation_hash, response_json, expires_at)
      values (${idempotencyKey}, ${requestId}, 'AI_LOCAL_RESULT', ${mutationHash},
        ${JSON.stringify(result)}::jsonb, now() + interval '24 hours')
    `;
    return result;
  });

  if (outcome.kind === "STALE") {
    console.error(
      "Ảnh GCN, dữ liệu nguồn hoặc manifest đã thay đổi; job bị đánh dấu STALE. " +
        "Chạy `enqueue --submission=` để tạo job theo bộ ảnh hiện tại.",
    );
    process.exitCode = 1;
    return;
  }
  for (const issue of issues) {
    console.log(`  ${issue.severity}\t${issue.code}\t${issue.message}`);
  }
  console.log(
    `${outcome.kind === "REPLAY" ? "Đã ghi trước đó" : "Đã ghi"}: result ${outcome.resultId} ` +
      `v${outcome.resultVersion}, ${outcome.validationStatus}, ` +
      `${outcome.warningCount} cảnh báo, ${outcome.blockingCount} lỗi chặn.`,
  );
  console.log("Cán bộ mở màn hình đối chiếu AI để duyệt; script không nạp giá trị vào hồ sơ.");
}

async function main(): Promise<void> {
  const options = parseLocalDraftOptions(
    process.argv.slice(2),
    process.env.AI_LOCAL_DRIVE_ROOT ?? "",
  );
  if (options.mode === "list") return list(options);
  if (options.mode === "enqueue") return enqueue(options);
  return submit(options);
}

function parseDraft(value: unknown): IntakeDraft {
  const draft = hydrateGcnV2ApplicationDraft(value);
  if (!draft) throw new Error("Payload hồ sơ đã lưu không hợp lệ.");
  return draft;
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Lỗi không rõ.");
    process.exit(1);
  });
