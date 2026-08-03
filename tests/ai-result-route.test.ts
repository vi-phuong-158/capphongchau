import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { getDatabase } = vi.hoisted(() => ({ getDatabase: vi.fn() }));

vi.mock("@/modules/common/env", () => ({
  loadServerEnvironment: vi.fn().mockReturnValue({
    AI_EXTRACTION_ENABLED: true,
    AI_WORKER_API_KEY: "a".repeat(32),
  }),
}));

vi.mock("@/modules/supabase/database", () => ({ getDatabase }));

import { POST } from "@/app/api/ai/results/route";
import { POST as claimJob } from "@/app/api/ai/jobs/claim/route";
import { computeInputFingerprint } from "@/modules/ai-extraction/fingerprints";

function validRawJson() {
  return {
    quality: { documentType: "CERTIFICATE", imageStatus: "CLEAR", note: "" },
    data: {
      certificate: {
        issueNumber: "CS 123456",
        issueDate: "2026-07-26",
        registryNumber: "CH 00123",
      },
      owners: [],
      parcels: [],
      assets: [],
      registeredChanges: [],
    },
    pages: [
      {
        fileId: "file_gcn_1",
        pageNumber: 1,
        pageType: "COVER",
        rotationDegrees: 0,
        imageStatus: "CLEAR",
        ownerStableKeys: [],
        parcelStableKeys: [],
        registeredChangeStableKeys: [],
        warnings: [],
      },
    ],
    evidence: [
      {
        fieldPath: "certificate.issueNumber",
        rawText: "CS 123456",
        fileId: "file_gcn_1",
        pageNumber: 1,
        confidence: 0.99,
        status: "EXTRACTED",
      },
      {
        fieldPath: "certificate.issueDate",
        rawText: "26/07/2026",
        fileId: "file_gcn_1",
        pageNumber: 1,
        confidence: 0.99,
        status: "EXTRACTED",
      },
      {
        fieldPath: "certificate.registryNumber",
        rawText: "CH 00123",
        fileId: "file_gcn_1",
        pageNumber: 1,
        confidence: 0.99,
        status: "EXTRACTED",
      },
    ],
    metadata: {
      schemaVersion: "gcn-v2.0",
      promptVersion: "gcn-v2.0",
      modelIdentifier: "gemini-3.6-flash",
      pagesProcessed: 1,
      sourceDocumentHash: "b".repeat(64),
      processedAt: "2026-08-03T08:00:00.000Z",
    },
    warnings: [],
  };
}

function validLegacyRawJson() {
  const field = (value: string) => ({
    value,
    sourceValue: value,
    status: "CLEAR",
    evidence: { fileId: "file_gcn_1", pageLabel: "Trang 1", note: "" },
  });
  return {
    quality: { documentType: "CERTIFICATE", imageStatus: "CLEAR", note: "" },
    certificate: {
      issueNumber: field("CS 123456"),
      issueDate: field("2026-07-26"),
      registryNumber: field("CH 00123"),
    },
    unreadableFields: [],
  };
}

function requestWithPii(): NextRequest {
  return new NextRequest("http://localhost:3000/api/ai/results", {
    method: "POST",
    headers: {
      "x-ai-worker-key": "a".repeat(32),
      "idempotency-key": "result-pii-test",
      "x-request-id": "req-ai-pii",
    },
    body: JSON.stringify({
      jobId: "aijob_1",
      workerInstanceId: "station_1",
      inputFingerprint: "b".repeat(64),
      modelName: "gemini-3.6-flash",
      promptVersion: "gcn-v2.0",
      rawJson: {
        ...validRawJson(),
        quality: {
          documentType: "CERTIFICATE",
          imageStatus: "CLEAR",
          note: "Chuỗi không được phép: 0123 456 789 01",
        },
      },
    }),
  });
}

describe("POST /api/ai/results", () => {
  beforeEach(() => vi.clearAllMocks());

  it("R1: từ chối payload có số giống CCCD trước khi mở database", async () => {
    const response = await POST(requestWithPii());

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("VALIDATION_FAILED");
    expect(getDatabase).not.toHaveBeenCalled();
  });

  it("R1b: từ chối metadata source hash/model không khớp request trước database", async () => {
    const rawJson = validRawJson();
    rawJson.metadata.sourceDocumentHash = "c".repeat(64);
    const response = await POST(
      new NextRequest("http://localhost:3000/api/ai/results", {
        method: "POST",
        headers: {
          "x-ai-worker-key": "a".repeat(32),
          "idempotency-key": "metadata-mismatch",
        },
        body: JSON.stringify({
          jobId: "aijob_1",
          workerInstanceId: "station_1",
          inputFingerprint: "b".repeat(64),
          modelName: "gemini-3.6-flash",
          promptVersion: "gcn-v2.0",
          rawJson,
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(getDatabase).not.toHaveBeenCalled();
  });

  it("R2: STALE được cache nên retry result cùng key trả lại đúng 409", async () => {
    let cachedMutationHash = "";
    let jobReads = 0;
    let audits = 0;
    let retry = false;
    const transaction = async (parts: TemplateStringsArray, ...values: unknown[]) => {
      const statement = parts.join("?");
      if (statement.includes("pg_advisory_xact_lock")) return [];
      if (statement.includes("select mutation_hash, response_json from public.request_log")) {
        return retry
          ? [{ mutation_hash: cachedMutationHash, response_json: { outcome: "STALE" } }]
          : [];
      }
      if (statement.includes("from public.ai_extraction_jobs")) {
        jobReads += 1;
        return [
          {
            job_id: "aijob_1",
            submission_id: "sub_1",
            citizen_payload_version: 1,
            input_fingerprint: "b".repeat(64),
            prompt_version: "gcn-v2.0",
            schema_version: "gcn-v2.0",
            model_name: "gemini-3.6-flash",
            status: "PROCESSING",
            worker_instance_id: "station_1",
            lease_expires_at: new Date(Date.now() + 60_000),
          },
        ];
      }
      if (statement.includes("from public.public_submissions")) {
        return [{ citizen_payload_version: 1, draft_json: {} }];
      }
      if (statement.includes("count(*) as count")) return [{ count: 0 }];
      if (statement.includes("join public.public_files")) return [];
      if (statement.includes("from public.public_files")) return [];
      if (statement.includes("insert into public.audit_logs")) {
        audits += 1;
        return [];
      }
      if (statement.includes("insert into public.request_log")) {
        cachedMutationHash = String(values[2]);
        return [];
      }
      return [];
    };
    getDatabase.mockReturnValue({
      begin: async <T>(callback: (sql: typeof transaction) => Promise<T>): Promise<T> =>
        callback(transaction),
    });
    const makeRequest = () =>
      new NextRequest("http://localhost:3000/api/ai/results", {
        method: "POST",
        headers: {
          "x-ai-worker-key": "a".repeat(32),
          "idempotency-key": "stale-result",
          "x-request-id": "req-stale-result",
        },
        body: JSON.stringify({
          jobId: "aijob_1",
          workerInstanceId: "station_1",
          inputFingerprint: "b".repeat(64),
          modelName: "gemini-3.6-flash",
          promptVersion: "gcn-v2.0",
          rawJson: validRawJson(),
        }),
      });

    const first = await POST(makeRequest());
    retry = true;
    const second = await POST(makeRequest());

    expect(first.status).toBe(409);
    expect(await second.json()).toEqual(await first.json());
    expect(jobReads).toBe(1);
    expect(audits).toBe(1);
  });

  it("R3: STALE claim cũng cache để retry không đọc lại job terminal", async () => {
    let cachedMutationHash = "";
    let jobReads = 0;
    let retry = false;
    const transaction = async (parts: TemplateStringsArray, ...values: unknown[]) => {
      const statement = parts.join("?");
      if (statement.includes("pg_advisory_xact_lock")) return [];
      if (statement.includes("select mutation_hash, response_json from public.request_log")) {
        return retry
          ? [{ mutation_hash: cachedMutationHash, response_json: { outcome: "STALE" } }]
          : [];
      }
      if (statement.includes("from public.ai_extraction_jobs")) {
        jobReads += 1;
        return [
          {
            job_id: "aijob_1",
            submission_id: "sub_1",
            input_fingerprint: "b".repeat(64),
            prompt_version: "gcn-v2.0",
            schema_version: "gcn-v2.0",
            model_name: "gemini-3.6-flash",
            status: "READY_FOR_AGENT",
            worker_type: "ANTIGRAVITY",
            worker_instance_id: "",
            lease_expired: false,
          },
        ];
      }
      if (statement.includes("count(*) as declared_count")) return [{ declared_count: 0 }];
      if (statement.includes("join public.public_files")) return [];
      if (statement.includes("insert into public.request_log")) {
        cachedMutationHash = String(values[2]);
        return [];
      }
      return [];
    };
    getDatabase.mockReturnValue({
      begin: async <T>(callback: (sql: typeof transaction) => Promise<T>): Promise<T> =>
        callback(transaction),
    });
    const makeRequest = () =>
      new NextRequest("http://localhost:3000/api/ai/jobs/claim", {
        method: "POST",
        headers: {
          "x-ai-worker-key": "a".repeat(32),
          "idempotency-key": "stale-claim",
          "x-request-id": "req-stale-claim",
        },
        body: JSON.stringify({ jobId: "aijob_1", workerInstanceId: "station_1" }),
      });

    const first = await claimJob(makeRequest());
    retry = true;
    const second = await claimJob(makeRequest());

    expect(first.status).toBe(409);
    expect(await second.json()).toEqual(await first.json());
    expect(jobReads).toBe(1);
  });

  it("R4: vẫn hoàn tất được job legacy v2.0 đang giữ lease", async () => {
    const checksum = "checksum-legacy";
    const fingerprint = computeInputFingerprint("sub_1", 1, [checksum]);
    const transaction = async (parts: TemplateStringsArray) => {
      const statement = parts.join("?");
      if (statement.includes("pg_advisory_xact_lock")) return [];
      if (statement.includes("select mutation_hash, response_json from public.request_log")) {
        return [];
      }
      if (
        statement.includes("from public.ai_extraction_jobs") &&
        statement.includes("for update")
      ) {
        return [
          {
            job_id: "aijob_legacy",
            submission_id: "sub_1",
            citizen_payload_version: 1,
            input_fingerprint: fingerprint,
            prompt_version: "v2.0",
            schema_version: "v2.0",
            model_name: "gemini-3.6-flash",
            status: "PROCESSING",
            worker_instance_id: "station_1",
            lease_expires_at: new Date(Date.now() + 60_000),
          },
        ];
      }
      if (statement.includes("from public.public_submissions")) {
        return [
          {
            citizen_payload_version: 1,
            citizen_payload_json: null,
            working_payload_json: null,
            draft_json: {
              certificate: { issueNumber: "", issueDate: "", registryNumber: "" },
              owners: [],
              parcels: [],
              phone: "",
              consentAccepted: true,
            },
          },
        ];
      }
      if (statement.includes("count(*) as count")) return [{ count: 1 }];
      if (statement.includes("join public.public_files")) return [{ file_id: "file_gcn_1" }];
      if (statement.includes("from public.public_files")) return [{ checksum_sha256: checksum }];
      if (statement.includes("next_version")) return [{ next_version: 1 }];
      return [];
    };
    getDatabase.mockReturnValue({
      begin: async <T>(callback: (sql: typeof transaction) => Promise<T>): Promise<T> =>
        callback(transaction),
    });
    const response = await POST(
      new NextRequest("http://localhost:3000/api/ai/results", {
        method: "POST",
        headers: {
          "x-ai-worker-key": "a".repeat(32),
          "idempotency-key": "legacy-result",
        },
        body: JSON.stringify({
          jobId: "aijob_legacy",
          workerInstanceId: "station_1",
          inputFingerprint: fingerprint,
          modelName: "gemini-3.6-flash",
          promptVersion: "v2.0",
          rawJson: validLegacyRawJson(),
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect((await response.json()).result).toMatchObject({
      resultVersion: 1,
      validationStatus: "PASSED",
    });
  });
});
