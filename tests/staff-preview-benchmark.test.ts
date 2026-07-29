import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  parseSafeServerTiming,
  safeVercelRegion,
  summarizeStaffBenchmark,
} from "@/modules/performance/staff-preview-benchmark";

describe("staff Preview benchmark", () => {
  it("khóa Function region trong cấu hình triển khai, không dựa vào biến môi trường khai báo", () => {
    const configPath = fileURLToPath(new URL("../vercel.json", import.meta.url));
    expect(JSON.parse(readFileSync(configPath, "utf8"))).toMatchObject({ regions: ["sin1"] });
  });

  it("chỉ giữ Server-Timing duration nằm trong allowlist", () => {
    expect(
      parseSafeServerTiming("auth;dur=2.4, queue_db;dur=11, drive_file_id;dur=9, total;desc=secret"),
    ).toEqual({ auth: 2.4, queue_db: 11 });
  });

  it("chỉ xuất nhãn region Vercel, không xuất deployment identifier", () => {
    expect(safeVercelRegion("sin1::abc123-private")).toBe("sin1");
    expect(safeVercelRegion("unexpected-value")).toBeNull();
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
