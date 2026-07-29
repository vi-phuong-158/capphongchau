import { percentile } from "@/modules/public-intake/upload-performance-stats";

const SAFE_SERVER_TIMING_NAMES = new Set([
  "auth",
  "queue_db",
  "total",
  "detail_db",
  "detail_total",
  "preview_db",
  "preview_drive",
  "preview_total",
]);

export type StaffBenchmarkRoute =
  | "health_database"
  | "queue_all"
  | "queue_status"
  | "queue_owner"
  | "queue_receipt"
  | "queue_issue"
  | "detail"
  | "preview";

export interface BenchmarkSample {
  readonly route: StaffBenchmarkRoute;
  readonly status: number;
  readonly durationMs: number;
  readonly serverTiming: Readonly<Record<string, number>>;
  readonly runtimeRegion: string | null;
}

export interface BenchmarkSummary {
  readonly route: StaffBenchmarkRoute;
  readonly count: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly errorRate: number;
  readonly statuses: Readonly<Record<string, number>>;
  readonly serverTiming: Readonly<Record<string, { readonly p50Ms: number; readonly p95Ms: number }>>;
  readonly runtimeRegions: readonly string[];
}

/** Chỉ giữ duration được allowlist; không mang query, route URL, ID hay header thô vào report. */
export function parseSafeServerTiming(header: string | null): Readonly<Record<string, number>> {
  if (!header) return {};
  const durations: Record<string, number> = {};
  for (const value of header.split(",")) {
    const match = /^\s*([a-z_]+)\s*;\s*dur\s*=\s*([0-9]+(?:\.[0-9]+)?)\s*$/i.exec(value);
    if (!match) continue;
    const name = match[1].toLowerCase();
    const duration = Number(match[2]);
    if (SAFE_SERVER_TIMING_NAMES.has(name) && Number.isFinite(duration) && duration >= 0) {
      durations[name] = duration;
    }
  }
  return durations;
}

/** `x-vercel-id` có dạng region::...; chỉ báo cáo nhãn region, không xuất định danh deployment. */
export function safeVercelRegion(header: string | null): string | null {
  const region = header?.split("::", 1)[0]?.trim().toLowerCase() ?? "";
  return /^[a-z]{3}\d$/.test(region) ? region : null;
}

export function summarizeStaffBenchmark(samples: readonly BenchmarkSample[]): readonly BenchmarkSummary[] {
  const grouped = new Map<StaffBenchmarkRoute, BenchmarkSample[]>();
  for (const sample of samples) {
    grouped.set(sample.route, [...(grouped.get(sample.route) ?? []), sample]);
  }

  return [...grouped.entries()].map(([route, routeSamples]) => {
    const durations = routeSamples.map((sample) => sample.durationMs);
    const statuses: Record<string, number> = {};
    const timings = new Map<string, number[]>();
    const runtimeRegions = new Set<string>();
    let errors = 0;
    for (const sample of routeSamples) {
      const statusKey = sample.status === 0 ? "NETWORK_ERROR" : String(sample.status);
      statuses[statusKey] = (statuses[statusKey] ?? 0) + 1;
      if (sample.status < 200 || sample.status >= 300) errors += 1;
      if (sample.runtimeRegion) runtimeRegions.add(sample.runtimeRegion);
      for (const [name, duration] of Object.entries(sample.serverTiming)) {
        timings.set(name, [...(timings.get(name) ?? []), duration]);
      }
    }

    const serverTiming = Object.fromEntries(
      [...timings.entries()].map(([name, values]) => [
        name,
        { p50Ms: percentile(values, 0.5), p95Ms: percentile(values, 0.95) },
      ]),
    );
    return {
      route,
      count: routeSamples.length,
      p50Ms: percentile(durations, 0.5),
      p95Ms: percentile(durations, 0.95),
      errorRate: routeSamples.length === 0 ? 0 : errors / routeSamples.length,
      statuses,
      serverTiming,
      runtimeRegions: [...runtimeRegions].sort(),
    };
  });
}
