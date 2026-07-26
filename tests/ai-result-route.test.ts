import { describe, expect, it, vi } from "vitest";
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

function validRawJson() {
  const field = (value: string, note: string) => ({
    value,
    sourceValue: value,
    status: "CLEAR",
    evidence: { fileId: "file_gcn_1", pageLabel: "Trang 1", note },
  });
  return {
    quality: { documentType: "CERTIFICATE", imageStatus: "CLEAR", note: "" },
    certificate: {
      issueNumber: field("CS 123456", "Số phát hành"),
      issueDate: field("2026-07-26", "Ngày cấp"),
      registryNumber: field("CH 00123", "Số vào sổ"),
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
      promptVersion: "v2.0",
      rawJson: {
        quality: {
          documentType: "CERTIFICATE",
          imageStatus: "CLEAR",
          note: "Chuỗi không được phép: 0123 456 789 01",
        },
        certificate: {
          issueNumber: {
            value: "CS 123456",
            sourceValue: "CS 123456",
            status: "CLEAR",
            evidence: { fileId: "file_gcn_1", pageLabel: "Trang 1", note: "Vùng tiêu đề" },
          },
          issueDate: {
            value: "2026-07-26",
            sourceValue: "2026-07-26",
            status: "CLEAR",
            evidence: { fileId: "file_gcn_1", pageLabel: "Trang 1", note: "Ngày cấp" },
          },
          registryNumber: {
            value: "CH 00123",
            sourceValue: "CH 00123",
            status: "CLEAR",
            evidence: { fileId: "file_gcn_1", pageLabel: "Trang 1", note: "Sổ cấp" },
          },
        },
        unreadableFields: [],
      },
    }),
  });
}

describe("POST /api/ai/results", () => {
  it("R1: từ chối payload có số giống CCCD trước khi mở database", async () => {
    const response = await POST(requestWithPii());

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("VALIDATION_FAILED");
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
          promptVersion: "v2.0",
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
            prompt_version: "v2.0",
            schema_version: "v2.0",
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
});
