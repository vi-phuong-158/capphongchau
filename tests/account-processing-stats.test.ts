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
    databaseMock.unsafe.mockResolvedValueOnce([]);
    databaseMock.unsafe.mockResolvedValueOnce([
      { email: "a@vn", display_name: "A", roles: [UserRole.INTAKE_OFFICER], active: true },
      { email: "b@vn", display_name: "B", roles: [UserRole.WARD_ADMIN], active: false },
    ]);

    const summary = await repository.getDashboardSummary({});
    expect(summary.officers).toHaveLength(2);
    expect(summary.officers[1].active).toBe(false);
  });

  it("3. getDashboardSummary overall totals correctly aggregate pending and unassigned", async () => {
    databaseMock.unsafe.mockResolvedValueOnce([
      { claimed_by: "officer_a", status: "UNDER_REVIEW", count: 3 }, // in-progress
      { claimed_by: "officer_a", status: "ACCEPTED", count: 7 }, // accepted
      { claimed_by: null, status: "SUBMITTED", count: 2 }, // pending & unassigned
      { claimed_by: "officer_b", status: "SUBMITTED", count: 1 }, // in-progress
    ]);
    databaseMock.unsafe.mockResolvedValueOnce([]);

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
  });

  it("5. admin completes officer's case counts for admin based on audit logs", async () => {
    databaseMock.unsafe.mockResolvedValueOnce([]);
    databaseMock.unsafe.mockResolvedValueOnce([
      { email: "admin@vn", display_name: "Admin", completed_count: 7, roles: [], active: true },
    ]);

    const summary = await repository.getDashboardSummary({});
    expect(summary.officers[0].completedCount).toBe(7);
  });

  it("6. getDashboardSummary calculates inProgressCount based on current submissions state", async () => {
    databaseMock.unsafe.mockResolvedValueOnce([]);
    databaseMock.unsafe.mockResolvedValueOnce([
      { email: "a@vn", display_name: "A", in_progress_count: 3, roles: [], active: true },
    ]);

    const summary = await repository.getDashboardSummary({});
    expect(summary.officers[0].inProgressCount).toBe(3);
  });

  it("7. getDashboardSummary lastActivity does not use public_submissions.updated_at", async () => {
    databaseMock.unsafe.mockClear();
    databaseMock.unsafe.mockResolvedValueOnce([]);
    databaseMock.unsafe.mockResolvedValueOnce([]);

    await repository.getDashboardSummary({});
    const sqlQuery = databaseMock.unsafe.mock.calls[1][0];
    // Check that we only take max(created_at) from audit logs, not updated_at from public_submissions
    expect(sqlQuery).not.toContain("max(updated_at) as last_sub_updated_at");
  });

  it("8. getDashboardSummary lastActivity checks entity_type = PUBLIC_SUBMISSION and allowed actions", async () => {
    databaseMock.unsafe.mockClear();
    databaseMock.unsafe.mockResolvedValueOnce([]);
    databaseMock.unsafe.mockResolvedValueOnce([]);

    await repository.getDashboardSummary({});
    const sqlQuery = databaseMock.unsafe.mock.calls[1][0];

    expect(sqlQuery).toContain("entity_type = 'PUBLIC_SUBMISSION'");
    expect(sqlQuery).toContain("'SUBMISSION_CLAIMED'");
    expect(sqlQuery).toContain("'OFFICIAL_ACCEPTANCE_COMPLETED'");
    expect(sqlQuery).toContain("'SUBMISSION_WORKING_PAYLOAD_EDITED'");
  });

  it("9. getDashboardSummary lastActivity respects fromDate and toDate filters", async () => {
    databaseMock.unsafe.mockClear();
    databaseMock.unsafe.mockResolvedValueOnce([]);
    databaseMock.unsafe.mockResolvedValueOnce([]);

    await repository.getDashboardSummary({ fromDate: "2026-08-01T00:00:00.000Z", toDate: "2026-08-02T00:00:00.000Z" });
    const sqlQuery = databaseMock.unsafe.mock.calls[1][0];
    const sqlParams = databaseMock.unsafe.mock.calls[1][1];

    // Check the last_audits CTE applies date filters
    expect(sqlQuery).toContain("created_at >= $1::timestamptz");
    expect(sqlQuery).toContain("created_at < $2::timestamptz");
    expect(sqlParams[0]).toBe("2026-08-01T00:00:00.000Z");
    expect(sqlParams[1]).toBe("2026-08-02T00:00:00.000Z");
  });

  it("10. getDashboardSummary respects half-open fromDate filter in main query", async () => {
    databaseMock.unsafe.mockClear();
    databaseMock.unsafe.mockResolvedValueOnce([]);
    databaseMock.unsafe.mockResolvedValueOnce([]);

    await repository.getDashboardSummary({ fromDate: "2026-08-01T00:00:00.000Z" });
    const sqlQuery = databaseMock.unsafe.mock.calls[0][0];
    expect(sqlQuery).toContain("updated_at >= $1::timestamptz");
  });

  it("11. getDashboardSummary respects half-open toDate filter in main query", async () => {
    databaseMock.unsafe.mockClear();
    databaseMock.unsafe.mockResolvedValueOnce([]);
    databaseMock.unsafe.mockResolvedValueOnce([]);

    await repository.getDashboardSummary({ toDate: "2026-08-02T00:00:00.000Z" });
    const sqlQuery = databaseMock.unsafe.mock.calls[0][0];
    expect(sqlQuery).toContain("updated_at < $2::timestamptz");
  });

  it("12. listQueuePage filters by actionType=claimed correctly", async () => {
    databaseMock.unsafe.mockClear();
    databaseMock.unsafe.mockResolvedValueOnce([]);

    await repository.listQueuePage({ officer: "officer_a@test.vn", actionType: "claimed" });
    const [sqlQuery, sqlParams] = databaseMock.unsafe.mock.calls[0];

    expect(sqlQuery).toContain("action in ('SUBMISSION_CLAIMED', 'SUBMISSION_FORCE_CLAIMED')");
    expect(sqlParams).toContain("claimed");
    expect(sqlParams).toContain("officer_a@test.vn");
  });

  it("13. listQueuePage filters by actionType=completed correctly", async () => {
    databaseMock.unsafe.mockClear();
    databaseMock.unsafe.mockResolvedValueOnce([]);

    await repository.listQueuePage({ officer: "officer_a@test.vn", actionType: "completed" });
    const [sqlQuery, sqlParams] = databaseMock.unsafe.mock.calls[0];

    expect(sqlQuery).toContain("action = 'OFFICIAL_ACCEPTANCE_COMPLETED'");
    expect(sqlParams).toContain("completed");
    expect(sqlParams).toContain("officer_a@test.vn");
  });

  it("14. listQueuePage uses half-open date logic for actionType", async () => {
    databaseMock.unsafe.mockClear();
    databaseMock.unsafe.mockResolvedValueOnce([]);

    await repository.listQueuePage({
      actionType: "completed",
      fromDate: "2026-08-01T00:00:00.000Z",
      toDate: "2026-08-02T00:00:00.000Z"
    });

    const [sqlQuery, sqlParams] = databaseMock.unsafe.mock.calls[0];
    // verify the query uses < for the upper bound (parameter $10)
    expect(sqlQuery).toContain("created_at < $10::timestamptz");
    expect(sqlParams[8]).toBe("2026-08-01T00:00:00.000Z"); // $9
    expect(sqlParams[9]).toBe("2026-08-02T00:00:00.000Z"); // $10
  });
});
