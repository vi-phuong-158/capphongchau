import { describe, expect, it } from "vitest";

import { isValidInternalRedirect, parseDashboardDateRange } from "@/lib/validation";

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

  describe("parseDashboardDateRange", () => {
    it("parses valid YYYY-MM-DD", () => {
      const { from, to } = parseDashboardDateRange("2026-08-01", "2026-08-02");
      expect(from?.toISOString()).toBe("2026-07-31T17:00:00.000Z"); // 00:00:00+07:00
      expect(to?.toISOString()).toBe("2026-08-02T16:59:59.999Z"); // 23:59:59.999+07:00
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

    it("throws error if from > to", () => {
      expect(() => parseDashboardDateRange("2026-08-02", "2026-08-01")).toThrow("fromDate must not be after toDate");
    });

    it("throws error for invalid date values", () => {
      expect(() => parseDashboardDateRange("2026-13-45", undefined)).toThrow("Invalid fromDate value");
    });
  });
});
