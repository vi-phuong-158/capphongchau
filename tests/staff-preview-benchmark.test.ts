import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  buildStaffBenchmarkRequests,
  parseSafeServerTiming,
  safeVercelRegion,
  STAFF_BENCHMARK_REHEARSAL_CONFIRMATION,
  summarizeStaffBenchmark,
  validateStaffBenchmarkTarget,
} from "@/modules/performance/staff-preview-benchmark";

describe("staff Preview benchmark", () => {
  it("khóa Function region trong cấu hình triển khai, không dựa vào biến môi trường khai báo", () => {
    const configPath = fileURLToPath(new URL("../vercel.json", import.meta.url));
    expect(JSON.parse(readFileSync(configPath, "utf8"))).toMatchObject({ regions: ["sin1"] });
  });

  it("chỉ giữ Server-Timing duration nằm trong allowlist", () => {
    expect(
      parseSafeServerTiming(
        "auth;dur=2.4, queue_db;dur=11, drive_file_id;dur=9, total;desc=secret",
      ),
    ).toEqual({ auth: 2.4, queue_db: 11 });
  });

  it("chỉ xuất nhãn region Vercel, không xuất deployment identifier", () => {
    expect(safeVercelRegion("sin1::abc123-private")).toBe("sin1");
    expect(safeVercelRegion("unexpected-value")).toBeNull();
  });

  it("chỉ chấp nhận đúng origin Vercel Preview rehearsal đã xác nhận", () => {
    expect(
      validateStaffBenchmarkTarget({
        baseUrl: "https://capphongchau-pr-9-vi-phuong-158s-projects.vercel.app",
        expectedHost: "capphongchau-pr-9-vi-phuong-158s-projects.vercel.app",
        rehearsalConfirmation: STAFF_BENCHMARK_REHEARSAL_CONFIRMATION,
      }).origin,
    ).toBe("https://capphongchau-pr-9-vi-phuong-158s-projects.vercel.app");

    const valid = {
      expectedHost: "capphongchau-pr-9-vi-phuong-158s-projects.vercel.app",
      rehearsalConfirmation: STAFF_BENCHMARK_REHEARSAL_CONFIRMATION,
    };
    for (const baseUrl of [
      "http://capphongchau-pr-9-vi-phuong-158s-projects.vercel.app",
      "https://capphongchau.vercel.app",
      "https://other-preview.vercel.app",
      "https://user:secret@capphongchau-pr-9-vi-phuong-158s-projects.vercel.app",
      "https://capphongchau-pr-9-vi-phuong-158s-projects.vercel.app:8443",
      "https://capphongchau-pr-9-vi-phuong-158s-projects.vercel.app/submissions",
      "https://capphongchau-pr-9-vi-phuong-158s-projects.vercel.app?unsafe=true",
    ]) {
      expect(() => validateStaffBenchmarkTarget({ ...valid, baseUrl })).toThrow();
    }
    expect(() =>
      validateStaffBenchmarkTarget({
        ...valid,
        baseUrl: "https://capphongchau-pr-9-vi-phuong-158s-projects.vercel.app",
        rehearsalConfirmation: "YES",
      }),
    ).toThrow("PERF_BENCHMARK_CONFIRM_REHEARSAL");
  });

  it("tạo đúng q cho tìm kiếm queue và tách SSR detail khỏi API diagnostic", () => {
    const requests = buildStaffBenchmarkRequests({
      ownerQuery: "Nguyễn A%_",
      receiptQuery: "PC-001",
      issueQuery: "GCN-9",
      submissionId: "sub/id",
      fileId: "file/id",
    });
    const byRoute = new Map(requests.map((request) => [request.label, request.path]));
    const baseUrl = "https://preview.example.vercel.app";

    expect(new URL(byRoute.get("queue_owner")!, baseUrl).searchParams.get("q")).toBe("Nguyễn A%_");
    expect(new URL(byRoute.get("queue_owner")!, baseUrl).searchParams.get("query")).toBeNull();
    expect(new URL(byRoute.get("queue_receipt")!, baseUrl).searchParams.get("q")).toBe("PC-001");
    expect(new URL(byRoute.get("queue_issue")!, baseUrl).searchParams.get("q")).toBe("GCN-9");
    expect(byRoute.get("detail_page")).toBe("/submissions/sub%2Fid");
    expect(byRoute.get("detail_api")).toBe("/api/submissions/sub%2Fid");
    expect(byRoute.get("preview")).toBe("/api/submissions/sub%2Fid/files/file%2Fid");
  });

  it("tính P50/P95, error rate và chỉ tổng hợp status/timing an toàn", () => {
    expect(
      summarizeStaffBenchmark([
        {
          route: "queue_all",
          status: 200,
          durationMs: 10,
          serverTiming: { auth: 1, queue_db: 4, total: 10 },
          runtimeRegion: "sin1",
        },
        {
          route: "queue_all",
          status: 503,
          durationMs: 30,
          serverTiming: { auth: 2, queue_db: 12, total: 30 },
          runtimeRegion: "sin1",
        },
      ]),
    ).toEqual([
      {
        route: "queue_all",
        count: 2,
        p50Ms: 10,
        p95Ms: 10,
        errorRate: 0.5,
        statuses: { "200": 1, "503": 1 },
        serverTiming: {
          auth: { p50Ms: 1, p95Ms: 1 },
          queue_db: { p50Ms: 4, p95Ms: 4 },
          total: { p50Ms: 10, p95Ms: 10 },
        },
        runtimeRegions: ["sin1"],
      },
    ]);
  });
});
