/**
 * Preview-only benchmark cho Phase 4. Script không đọc `.env.local`, không ghi database,
 * không in cookie, URL, query, submission/file ID, response body hay header thô.
 *
 * Cấp các biến qua process environment của phiên chạy (không commit):
 * PERF_BENCHMARK_BASE_URL, PERF_BENCHMARK_COOKIE, PERF_OWNER_QUERY,
 * PERF_RECEIPT_QUERY, PERF_ISSUE_QUERY, PERF_SUBMISSION_ID, PERF_FILE_ID.
 *
 * Mặc định: warm-up 10, đo 40 lượt/route, 4 worker. Chỉ dùng dữ liệu Preview tổng hợp.
 */

import {
  parseSafeServerTiming,
  safeVercelRegion,
  summarizeStaffBenchmark,
  type BenchmarkSample,
  type StaffBenchmarkRoute,
} from "../src/modules/performance/staff-preview-benchmark";

const WARMUP_REQUESTS = 10;
const MEASURED_REQUESTS = 40;
const CONCURRENCY = 4;

interface BenchmarkRequest {
  readonly label: StaffBenchmarkRoute;
  readonly path: string;
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Thiếu cấu hình ${name}.`);
  return value;
}

function previewBaseUrl(): URL {
  const url = new URL(required("PERF_BENCHMARK_BASE_URL"));
  if (url.protocol !== "https:") throw new Error("PERF_BENCHMARK_BASE_URL phải dùng HTTPS Preview.");
  return url;
}

function benchmarkRequests(): BenchmarkRequest[] {
  const ownerQuery = required("PERF_OWNER_QUERY");
  const receiptQuery = required("PERF_RECEIPT_QUERY");
  const issueQuery = required("PERF_ISSUE_QUERY");
  const submissionId = required("PERF_SUBMISSION_ID");
  const fileId = required("PERF_FILE_ID");
  return [
    { label: "health_database", path: "/api/health/database" },
    { label: "queue_all", path: "/api/submissions" },
    { label: "queue_status", path: "/api/submissions?status=UNDER_REVIEW" },
    { label: "queue_owner", path: `/api/submissions?query=${encodeURIComponent(ownerQuery)}` },
    { label: "queue_receipt", path: `/api/submissions?query=${encodeURIComponent(receiptQuery)}` },
    { label: "queue_issue", path: `/api/submissions?query=${encodeURIComponent(issueQuery)}` },
    { label: "detail", path: `/api/submissions/${encodeURIComponent(submissionId)}` },
    {
      label: "preview",
      path: `/api/submissions/${encodeURIComponent(submissionId)}/files/${encodeURIComponent(fileId)}`,
    },
  ];
}

function requestUrl(baseUrl: URL, path: string): string {
  return new URL(path, baseUrl).toString();
}

async function runOne(
  request: BenchmarkRequest,
  baseUrl: URL,
  cookie: string,
): Promise<BenchmarkSample> {
  const startedAt = performance.now();
  try {
    const response = await fetch(requestUrl(baseUrl, request.path), {
      headers: { cookie, "cache-control": "no-store" },
      redirect: "error",
    });
    await response.arrayBuffer();
    return {
      route: request.label,
      status: response.status,
      durationMs: performance.now() - startedAt,
      serverTiming: parseSafeServerTiming(response.headers.get("server-timing")),
      runtimeRegion: safeVercelRegion(response.headers.get("x-vercel-id")),
    };
  } catch {
    return {
      route: request.label,
      status: 0,
      durationMs: performance.now() - startedAt,
      serverTiming: {},
      runtimeRegion: null,
    };
  }
}

async function runParallel<T>(count: number, task: () => Promise<T>): Promise<T[]> {
  const results: T[] = [];
  let next = 0;
  async function worker(): Promise<void> {
    while (next < count) {
      next += 1;
      results.push(await task());
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, count) }, worker));
  return results;
}

function printReport(samples: readonly BenchmarkSample[]): void {
  for (const summary of summarizeStaffBenchmark(samples)) {
    const timings = Object.entries(summary.serverTiming)
      .map(([name, value]) => `${name}:P50=${value.p50Ms.toFixed(1)} P95=${value.p95Ms.toFixed(1)}`)
      .join("; ");
    console.log(
      `${summary.route} n=${summary.count} P50=${summary.p50Ms.toFixed(1)}ms P95=${summary.p95Ms.toFixed(1)}ms errorRate=${(summary.errorRate * 100).toFixed(1)}% statuses=${JSON.stringify(summary.statuses)} regions=${summary.runtimeRegions.join(",") || "unknown"}${timings ? ` timings=${timings}` : ""}`,
    );
  }
}

async function main(): Promise<void> {
  const baseUrl = previewBaseUrl();
  const cookie = required("PERF_BENCHMARK_COOKIE");
  const requests = benchmarkRequests();

  for (const request of requests) {
    await runParallel(WARMUP_REQUESTS, () => runOne(request, baseUrl, cookie));
  }

  const samples: BenchmarkSample[] = [];
  for (const request of requests) {
    samples.push(...(await runParallel(MEASURED_REQUESTS, () => runOne(request, baseUrl, cookie))));
  }
  printReport(samples);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Không thể chạy benchmark Preview.");
  process.exit(1);
});
