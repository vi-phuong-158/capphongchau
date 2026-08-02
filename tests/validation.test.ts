import { describe, expect, it } from "vitest";

import { isValidInternalRedirect, parseDashboardDateRange, normalizeDashboardFilters } from "@/lib/validation";

describe("validation helpers", () => {
  describe("isValidInternalRedirect", () => {
    it("returns true for valid internal paths", () => {
      expect(isValidInternalRedirect("/admin/dashboard")).toBe(true);
      expect(isValidInternalRedirect("/submissions?status=SUBMITTED")).toBe(true);
      expect(isValidInternalRedirect("/")).toBe(true);
    });

    it("returns false for external paths", () => {
      expect(isValidInternalRedirect("https://example.com")).toBe(false);
      expect(isValidInternalRedirect("http://example.com")).toBe(false);
    });

    it("returns false for protocol-relative bypasses", () => {
      expect(isValidInternalRedirect("//example.com")).toBe(false);
      expect(isValidInternalRedirect("///example.com")).toBe(false);
    });

    it("returns false for backslash bypasses", () => {
      expect(isValidInternalRedirect("\\\\example.com")).toBe(false);
      expect(isValidInternalRedirect("/\\example.com")).toBe(false);
    });

    it("returns false for non-strings", () => {
      expect(isValidInternalRedirect(null)).toBe(false);
      expect(isValidInternalRedirect(undefined)).toBe(false);
    });
  });

  describe("normalizeDashboardFilters", () => {
    const validStatuses = ["SUBMITTED", "ACCEPTED"];
    const validBuckets = ["pending", "in-progress"];

    it("normalizes valid inputs", () => {
      const result = normalizeDashboardFilters({
        from: "2026-08-01",
        to: "2026-08-02",
        officer: "user1",
        status: "ACCEPTED",
        bucket: "pending",
        unassigned: "1",
        validStatuses,
        validBuckets,
      });

      expect(result.fromDate).toBe("2026-07-31T17:00:00.000Z");
      expect(result.toDate).toBe("2026-08-02T17:00:00.000Z");
      expect(result.officer).toBe("user1");
      expect(result.status).toBe("ACCEPTED");
      expect(result.bucket).toBe("pending");
      expect(result.unassigned).toBe("1");
    });

    it("throws error on invalid status", () => {
      expect(() =>
        normalizeDashboardFilters({
          status: "INVALID_STATUS",
          validStatuses,
          validBuckets,
        }),
      ).toThrow("Invalid status");
    });

    it("throws error on invalid bucket", () => {
      expect(() =>
        normalizeDashboardFilters({
          bucket: "invalid-bucket",
          validStatuses,
          validBuckets,
        }),
      ).toThrow("Invalid bucket");
    });

    it("throws error on array inputs", () => {
      expect(() =>
        normalizeDashboardFilters({
          officer: ["user1", "user2"],
          validStatuses,
          validBuckets,
        }),
      ).toThrow("VALIDATION_FAILED: Tham số officer không được là mảng.");
    });

    it("throws error on invalid unassigned", () => {
      expect(() =>
        normalizeDashboardFilters({
          unassigned: "2",
          validStatuses,
          validBuckets,
        }),
      ).toThrow("VALIDATION_FAILED: Tham số unassigned không hợp lệ.");
    });
  });

  describe("parseDashboardDateRange", () => {
    it("parses valid YYYY-MM-DD", () => {
      const { from, to } = parseDashboardDateRange("2026-08-01", "2026-08-02");
      expect(from?.toISOString()).toBe("2026-07-31T17:00:00.000Z"); // 2026-08-01T00:00:00.000+07:00
      expect(to?.toISOString()).toBe("2026-08-02T17:00:00.000Z"); // 2026-08-03T00:00:00.000+07:00
    });

    it("handles undefined parameters", () => {
      const { from, to } = parseDashboardDateRange(undefined, undefined);
      expect(from).toBeNull();
      expect(to).toBeNull();
    });

    it("throws error for invalid format", () => {
      expect(() => parseDashboardDateRange("01-08-2026", undefined)).toThrow("Invalid fromDate format");
      expect(() => parseDashboardDateRange(undefined, "2026/08/01")).toThrow("Invalid toDate format");
    });

    it("handles same day valid range (02/08 to 02/08)", () => {
      const { from, to } = parseDashboardDateRange("2026-08-02", "2026-08-02");
      expect(from?.toISOString()).toBe("2026-08-01T17:00:00.000Z");
      expect(to?.toISOString()).toBe("2026-08-02T17:00:00.000Z");
    });

    it("throws error if from > to (e.g. 03/08 to 02/08)", () => {
      expect(() => parseDashboardDateRange("2026-08-03", "2026-08-02")).toThrow(
        "fromDate must not be after toDate",
      );
    });

    it("throws error for invalid date values (out of bounds)", () => {
      expect(() => parseDashboardDateRange("2026-13-45", undefined)).toThrow("Invalid fromDate value");
      expect(() => parseDashboardDateRange("2026-02-30", undefined)).toThrow("Invalid fromDate value");
      expect(() => parseDashboardDateRange("2026-04-31", undefined)).toThrow("Invalid fromDate value");
      expect(() => parseDashboardDateRange(undefined, "2026-02-30")).toThrow("Invalid toDate value");
      expect(() => parseDashboardDateRange("0000-00-00", undefined)).toThrow("Invalid fromDate value");
    });
  });
});
