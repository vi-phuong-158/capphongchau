import { describe, expect, it, vi } from "vitest";

const databaseMock = vi.hoisted(() => ({
  unsafe: vi.fn(),
}));

vi.mock("@/modules/supabase/database", () => ({
  getDatabase: () => databaseMock,
}));

import { getSubmissionBucket, QUEUE_BUCKET_SQL_CONDITION } from "@/modules/public-intake/workflow";
import { PublicIntakeRepository } from "@/modules/public-intake/repository";

describe("Bucket Logic", () => {
  describe("getSubmissionBucket", () => {
    it("1. SUBMITTED + claimed_by null → pending", () => {
      expect(getSubmissionBucket("SUBMITTED", false)).toBe("pending");
    });
    it("2. SUBMITTED + claimed_by có giá trị → in-progress", () => {
      expect(getSubmissionBucket("SUBMITTED", true)).toBe("in-progress");
    });
    it("3. RESUBMITTED + claimed_by null → pending", () => {
      expect(getSubmissionBucket("RESUBMITTED", false)).toBe("pending");
    });
    it("4. RESUBMITTED + claimed_by có giá trị → in-progress", () => {
      expect(getSubmissionBucket("RESUBMITTED", true)).toBe("in-progress");
    });
    it("5. UNDER_REVIEW → in-progress", () => {
      expect(getSubmissionBucket("UNDER_REVIEW", false)).toBe("in-progress");
      expect(getSubmissionBucket("UNDER_REVIEW", true)).toBe("in-progress");
    });
    it("6. ACCEPTING → in-progress", () => {
      expect(getSubmissionBucket("ACCEPTING", false)).toBe("in-progress");
      expect(getSubmissionBucket("ACCEPTING", true)).toBe("in-progress");
    });
    it("7. ACCEPTED → accepted", () => {
      expect(getSubmissionBucket("ACCEPTED", false)).toBe("accepted");
      expect(getSubmissionBucket("ACCEPTED", true)).toBe("accepted");
    });
  });

  describe("QUEUE_BUCKET_SQL_CONDITION", () => {
    it("contains the correct in-progress logic for SQL", () => {
      expect(QUEUE_BUCKET_SQL_CONDITION).toContain("status in ('UNDER_REVIEW', 'ACCEPTING')");
      expect(QUEUE_BUCKET_SQL_CONDITION).toContain(
        "or (claimed_by is not null and status in ('SUBMITTED', 'RESUBMITTED', 'NEEDS_SUPPLEMENT'))"
      );
    });
  });

  describe("Dashboard Summary vs Queue semantic match", () => {
    it("Dashboard Summary correctly aggregates in-progress and pending buckets using getSubmissionBucket", async () => {
      // Mocking DB response for getDashboardSummary
      databaseMock.unsafe.mockResolvedValueOnce([
        { officer_email: null, officer_name: null, status: "SUBMITTED", count: 10, last_activity: new Date() }, // pending
        { officer_email: "a@test", officer_name: "A", status: "SUBMITTED", count: 5, last_activity: new Date() }, // in-progress
        { officer_email: null, officer_name: null, status: "UNDER_REVIEW", count: 2, last_activity: new Date() }, // in-progress
        { officer_email: "a@test", officer_name: "A", status: "ACCEPTED", count: 3, last_activity: new Date() }, // accepted
      ]);

      const repo = new PublicIntakeRepository();
      const summary = await repo.getDashboardSummary({});

      expect(summary.totals.pending).toBe(10);
      expect(summary.totals.inProgress).toBe(5 + 2); // 7
      expect(summary.totals.accepted).toBe(3);
    });
  });
});
