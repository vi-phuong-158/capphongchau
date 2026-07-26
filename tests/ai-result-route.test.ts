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
});
