import { describe, expect, it, vi } from "vitest";

const databaseMock = vi.hoisted(() => ({
  unsafe: vi.fn(),
}));

vi.mock("@/modules/supabase/database", () => ({
  getDatabase: () => databaseMock,
}));

import { PublicIntakeRepository } from "@/modules/public-intake/repository";
import { UserRole, formatUserRoles } from "@/modules/common/domain";

describe("Account Processing Results Statistics (Dashboard & Queue)", () => {
  const repository = new PublicIntakeRepository();

  it("1. formatUserRoles translates roles correctly to Vietnamese", () => {
    expect(formatUserRoles([UserRole.INTAKE_OFFICER])).toBe("Cán bộ tiếp nhận");
    expect(formatUserRoles([UserRole.WARD_ADMIN, UserRole.SYSTEM_ADMIN])).toBe(
      "Quản trị phường, Quản trị hệ thống",
    );
    expect(formatUserRoles([])).toBe("Chưa phân quyền");
  });

  it("2. getDashboardSummary includes ALL accounts regardless of activity or role", async () => {
    databaseMock.unsafe.mockResolvedValueOnce([]); // Submissions totals
    databaseMock.unsafe.mockResolvedValueOnce([
      { email: "a@vn", display_name: "A", roles: [UserRole.INTAKE_OFFICER], active: true },
      { email: "b@vn", display_name: "B", roles: [UserRole.WARD_ADMIN], active: false },
      { email: "c@vn", display_name: "C", roles: [UserRole.REPORT_VIEWER], active: true },
    ]); // Users CTE

    const summary = await repository.getDashboardSummary({});
    expect(summary.officers).toHaveLength(3);
    expect(summary.officers[1].active).toBe(false);
  });

  it("3. getDashboardSummary overall totals correctly aggregate pending and unassigned", async () => {
    databaseMock.unsafe.mockResolvedValueOnce([
      { claimed_by: "officer_a", status: "UNDER_REVIEW", count: 3 }, // in-progress
      { claimed_by: "officer_a", status: "ACCEPTED", count: 7 }, // accepted
      { claimed_by: null, status: "SUBMITTED", count: 2 }, // pending & unassigned
      { claimed_by: "officer_b", status: "SUBMITTED", count: 1 }, // pending but assigned
    ]);
    databaseMock.unsafe.mockResolvedValueOnce([]); // Users CTE

    const summary = await repository.getDashboardSummary({});
    expect(summary.totals.total).toBe(13);
    expect(summary.totals.pending).toBe(2);
    expect(summary.totals.inProgress).toBe(4);
    expect(summary.totals.accepted).toBe(7);
    expect(summary.totals.unassigned).toBe(2);
  });

  it("4. getDashboardSummary calculates claimedCount based on audit log CLAIM events", async () => {
    databaseMock.unsafe.mockResolvedValueOnce([]);
    databaseMock.unsafe.mockResolvedValueOnce([
      { email: "a@vn", display_name: "A", claimed_count: 5, roles: [], active: true },
    ]);

    const summary = await repository.getDashboardSummary({});
    expect(summary.officers[0].claimedCount).toBe(5);
    expect(summary.officers[0].total).toBe(5);
  });

  it("5. getDashboardSummary calculates completedCount based on audit log ACCEPTED events", async () => {
    databaseMock.unsafe.mockResolvedValueOnce([]);
    databaseMock.unsafe.mockResolvedValueOnce([
      { email: "a@vn", display_name: "A", completed_count: 7, roles: [], active: true },
    ]);

    const summary = await repository.getDashboardSummary({});
    expect(summary.officers[0].completedCount).toBe(7);
    expect(summary.officers[0].accepted).toBe(7);
  });

  it("6. getDashboardSummary calculates inProgressCount based on current submissions state", async () => {
    databaseMock.unsafe.mockResolvedValueOnce([]);
    databaseMock.unsafe.mockResolvedValueOnce([
      { email: "a@vn", display_name: "A", in_progress_count: 3, roles: [], active: true },
    ]);

    const summary = await repository.getDashboardSummary({});
    expect(summary.officers[0].inProgressCount).toBe(3);
    expect(summary.officers[0].inProgress).toBe(3);
  });

  it("7. getDashboardSummary completionRate calculates correctly and handles zero claims gracefully", async () => {
    databaseMock.unsafe.mockResolvedValueOnce([]);
    databaseMock.unsafe.mockResolvedValueOnce([
      { email: "a@vn", display_name: "A", claimed_count: 10, completed_count: 7, roles: [], active: true },
      { email: "b@vn", display_name: "B", claimed_count: 0, completed_count: 1, roles: [], active: true },
    ]);

    const summary = await repository.getDashboardSummary({});
    expect(summary.officers[0].completionRate).toBe("70%");
    expect(summary.officers[1].completionRate).toBe("0%");
  });

  it("8. getDashboardSummary lastActivity filters specifically for allowed business-critical actions", async () => {
    databaseMock.unsafe.mockClear();
    databaseMock.unsafe.mockResolvedValueOnce([]);
    databaseMock.unsafe.mockResolvedValueOnce([
      { email: "a@vn", display_name: "A", last_audit_at: new Date("2026-08-01T12:00:00.000Z"), roles: [], active: true },
    ]);

    const summary = await repository.getDashboardSummary({});
    expect(summary.officers[0].lastActivity).toBe("2026-08-01T12:00:00.000Z");

    const sqlQuery = databaseMock.unsafe.mock.calls[1][0];
    expect(sqlQuery).toContain("action in (");
    expect(sqlQuery).toContain("'SUBMISSION_CLAIMED'");
    expect(sqlQuery).toContain("'OFFICIAL_ACCEPTANCE_COMPLETED'");
    expect(sqlQuery).toContain("'SUBMISSION_WORKING_PAYLOAD_EDITED'");
  });

  it("9. getDashboardSummary respects half-open fromDate filter (querying updated_at/created_at >= fromDate)", async () => {
    databaseMock.unsafe.mockClear();
    databaseMock.unsafe.mockResolvedValueOnce([]);
    databaseMock.unsafe.mockResolvedValueOnce([]);

    await repository.getDashboardSummary({ fromDate: "2026-08-01T00:00:00.000Z" });
    const sqlParams1 = databaseMock.unsafe.mock.calls[0][1];
    const sqlParams2 = databaseMock.unsafe.mock.calls[1][1];

    expect(sqlParams1[0]).toBe("2026-08-01T00:00:00.000Z"); // $1
    expect(sqlParams2[0]).toBe("2026-08-01T00:00:00.000Z"); // $1
  });

  it("10. getDashboardSummary respects half-open toDate filter (querying updated_at/created_at < toDate)", async () => {
    databaseMock.unsafe.mockClear();
    databaseMock.unsafe.mockResolvedValueOnce([]);
    databaseMock.unsafe.mockResolvedValueOnce([]);

    await repository.getDashboardSummary({ toDate: "2026-08-02T00:00:00.000Z" });
    const sqlQuery1 = databaseMock.unsafe.mock.calls[0][0];
    const sqlQuery2 = databaseMock.unsafe.mock.calls[1][0];

    expect(sqlQuery1).toContain("updated_at < $2::timestamptz");
    expect(sqlQuery2).toContain("created_at < $2::timestamptz");
  });

  it("11. listQueuePage filters by actionType=claimed correctly", async () => {
    databaseMock.unsafe.mockClear();
    databaseMock.unsafe.mockResolvedValueOnce([]);

    await repository.listQueuePage({ officer: "officer_a@test.vn", actionType: "claimed" });

    const [sqlQuery, sqlParams] = databaseMock.unsafe.mock.calls[0];
    expect(sqlQuery).toContain("action in ('SUBMISSION_CLAIMED', 'SUBMISSION_FORCE_CLAIMED')");
    expect(sqlParams).toContain("claimed");
    expect(sqlParams).toContain("officer_a@test.vn");
  });

  it("12. listQueuePage filters by actionType=completed correctly", async () => {
    databaseMock.unsafe.mockClear();
    databaseMock.unsafe.mockResolvedValueOnce([]);

    await repository.listQueuePage({ officer: "officer_a@test.vn", actionType: "completed" });

    const [sqlQuery, sqlParams] = databaseMock.unsafe.mock.calls[0];
    expect(sqlQuery).toContain("action = 'OFFICIAL_ACCEPTANCE_COMPLETED'");
    expect(sqlParams).toContain("completed");
    expect(sqlParams).toContain("officer_a@test.vn");
  });

  it("13. listQueuePage drops date filters when querying bucket=in-progress is handled by UI", async () => {
    // This is essentially just verifying the SQL allows it; the actual drop is in dashboard-client.tsx
    databaseMock.unsafe.mockClear();
    databaseMock.unsafe.mockResolvedValueOnce([]);

    await repository.listQueuePage({ bucket: "in-progress" });

    const sqlQuery = databaseMock.unsafe.mock.calls[0][0];
    const sqlParams = databaseMock.unsafe.mock.calls[0][1];
    
    // Bucket filter condition includes the in-progress specific logic
    expect(sqlParams).toContain("in-progress");
  });

  it("14. listQueuePage filters correctly by half-open date logic when using actionType", async () => {
    databaseMock.unsafe.mockClear();
    databaseMock.unsafe.mockResolvedValueOnce([]);

    await repository.listQueuePage({
      actionType: "completed",
      fromDate: "2026-08-01T00:00:00.000Z",
      toDate: "2026-08-02T00:00:00.000Z"
    });

    const [sqlQuery, sqlParams] = databaseMock.unsafe.mock.calls[0];
    // Check that we're using `<` for `$10`
    expect(sqlQuery).toContain("created_at < $10::timestamptz");
    expect(sqlParams[8]).toBe("2026-08-01T00:00:00.000Z"); // $9
    expect(sqlParams[9]).toBe("2026-08-02T00:00:00.000Z"); // $10
  });
});
