export function isValidInternalRedirect(url: string | null | undefined): boolean {
  if (typeof url !== "string") return false;

  // Must start with a single slash
  if (!url.startsWith("/")) return false;

  // Must not start with double slash (protocol-relative URL to external site)
  if (url.startsWith("//")) return false;

  // Must not contain backslashes (could be interpreted as path separators in some parsers)
  if (url.includes("\\")) return false;

  // Try to parse using a dummy base URL to ensure it's a valid relative URL
  try {
    const parsed = new URL(url, "http://localhost");
    return parsed.pathname.startsWith("/");
  } catch {
    return false;
  }
}

function isValidRealDate(dateString: string): boolean {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

export function parseDashboardDateRange(
  fromDate: string | undefined,
  toDate: string | undefined,
): { from: Date | null; to: Date | null } {
  let from: Date | null = null;
  let to: Date | null = null;

  const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;

  if (fromDate) {
    if (!isoDateRegex.test(fromDate)) throw new Error("Invalid fromDate format");
    if (!isValidRealDate(fromDate)) throw new Error("Invalid fromDate value");
    from = new Date(`${fromDate}T00:00:00.000+07:00`);
    if (isNaN(from.getTime())) throw new Error("Invalid fromDate value");
  }

  if (toDate) {
    if (!isoDateRegex.test(toDate)) throw new Error("Invalid toDate format");
    if (!isValidRealDate(toDate)) throw new Error("Invalid toDate value");
    to = new Date(`${toDate}T00:00:00.000+07:00`);
    if (isNaN(to.getTime())) throw new Error("Invalid toDate value");
    to.setDate(to.getDate() + 1);
  }

  if (from && to && from >= to) {
    throw new Error("fromDate must not be after toDate");
  }

  return { from, to };
}

export function getSingleQueryParam(searchParams: URLSearchParams, name: string): string | null {
  const vals = searchParams.getAll(name);
  if (vals.length === 0) return null;
  if (vals.length > 1) {
    throw new Error(`VALIDATION_FAILED: Tham số ${name} không được xuất hiện nhiều lần.`);
  }
  return vals[0];
}

export function normalizeDashboardFilters(input: {
  from?: string | string[] | null;
  to?: string | string[] | null;
  officer?: string | string[] | null;
  status?: string | string[] | null;
  bucket?: string | string[] | null;
  unassigned?: string | string[] | null;
  actionType?: string | string[] | null;
  validStatuses: readonly string[];
  validBuckets: readonly string[];
}): {
  fromDate?: string;
  toDate?: string;
  officer?: string;
  status?: string;
  bucket?: string;
  unassigned?: string;
  actionType?: "claimed" | "completed";
} {
  const normalizeString = (val: string | string[] | null | undefined, name: string) => {
    if (Array.isArray(val)) {
      throw new Error(`VALIDATION_FAILED: Tham số ${name} không được là mảng.`);
    }
    return val || undefined;
  };

  const rawFrom = normalizeString(input.from, "from");
  const rawTo = normalizeString(input.to, "to");
  const rawOfficer = normalizeString(input.officer, "officer");
  const rawStatus = normalizeString(input.status, "status");
  const rawBucket = normalizeString(input.bucket, "bucket");
  const rawUnassigned = normalizeString(input.unassigned, "unassigned");
  const rawActionType = normalizeString(input.actionType, "actionType");

  if (rawUnassigned !== undefined && rawUnassigned !== "0" && rawUnassigned !== "1") {
    throw new Error("VALIDATION_FAILED: Tham số unassigned không hợp lệ.");
  }

  if (
    rawActionType !== undefined &&
    rawActionType !== "claimed" &&
    rawActionType !== "completed"
  ) {
    throw new Error("VALIDATION_FAILED: Tham số actionType không hợp lệ.");
  }

  let fromDate: string | undefined;
  let toDate: string | undefined;

  if (rawFrom || rawTo) {
    const parsed = parseDashboardDateRange(rawFrom, rawTo);
    fromDate = parsed.from?.toISOString();
    toDate = parsed.to?.toISOString();
  }

  if (rawStatus && !input.validStatuses.includes(rawStatus)) {
    throw new Error("Invalid status");
  }

  if (rawBucket && !input.validBuckets.includes(rawBucket)) {
    throw new Error("Invalid bucket");
  }

  return {
    fromDate,
    toDate,
    officer: rawOfficer,
    status: rawStatus,
    bucket: rawBucket,
    unassigned: rawUnassigned,
    actionType: rawActionType as "claimed" | "completed" | undefined,
  };
}
