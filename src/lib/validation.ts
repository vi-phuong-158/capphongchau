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

export function parseDashboardDateRange(
  fromDate: string | undefined,
  toDate: string | undefined,
): { from: Date | null; to: Date | null } {
  let from: Date | null = null;
  let to: Date | null = null;

  const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;

  if (fromDate) {
    if (!isoDateRegex.test(fromDate)) throw new Error("Invalid fromDate format");
    from = new Date(`${fromDate}T00:00:00.000+07:00`);
    if (isNaN(from.getTime())) throw new Error("Invalid fromDate value");
  }

  if (toDate) {
    if (!isoDateRegex.test(toDate)) throw new Error("Invalid toDate format");
    to = new Date(`${toDate}T23:59:59.999+07:00`);
    if (isNaN(to.getTime())) throw new Error("Invalid toDate value");
  }

  if (from && to && from > to) {
    throw new Error("fromDate must not be after toDate");
  }

  return { from, to };
}
