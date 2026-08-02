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

  it("formatUserRoles translates roles correctly to Vietnamese", () => {
    expect(formatUserRoles([UserRole.INTAKE_OFFICER])).toBe("Cán bộ tiếp nhận");
    expect(formatUserRoles([UserRole.WARD_ADMIN, UserRole.SYSTEM_ADMIN])).toBe(
      "Quản trị phường, Quản trị hệ thống",
    );
    expect(formatUserRoles([])).toBe("Chưa phân quyền");
  });

  it("1. getDashboardSummary includes ALL accounts (active, locked, 0-activity, admins, officers)", async () => {
    // 1st query: submission totals
    databaseMock.unsafe.mockResolvedValueOnce([
      { claimed_by: "officer_a@test.vn", status: "UNDER_REVIEW", count: 3 },
      { claimed_by: "officer_a@test.vn", status: "ACCEPTED", count: 7 },
      { claimed_by: "admin_b@test.vn", status: "ACCEPTED", count: 3 },
      { claimed_by: "admin_c@test.vn", status: "ACCEPTED", count: 1 },
      { claimed_by: null, status: "SUBMITTED", count: 2 },
    ]);

    const dateA = new Date("2026-08-01T10:00:00.000Z");
    const dateB = new Date("2026-08-02T11:00:00.000Z");
    const dateE = new Date("2026-07-20T08:00:00.000Z");

    // 2nd query: accountRows
    databaseMock.unsafe.mockResolvedValueOnce([
      {
        email: "officer_a@test.vn",
        display_name: "Cán bộ A",
        roles: [UserRole.INTAKE_OFFICER],
        active: true,
        claimed_count: 10,
        in_progress_count: 3,
        completed_count: 7,
        last_claim_at: dateA,
        last_completion_at: dateB,
        last_sub_updated_at: dateB,
        last_audit_at: dateB,
      },
      {
        email: "admin_b@test.vn",
        display_name: "Quản trị B",
        roles: [UserRole.WARD_ADMIN],
        active: true,
        claimed_count: 3,
        in_progress_count: 0,
        completed_count: 3,
        last_claim_at: dateA,
        last_completion_at: dateA,
        last_sub_updated_at: dateA,
        last_audit_at: dateA,
      },
      {
        email: "admin_c@test.vn",
        display_name: "Admin C",
        roles: [UserRole.SYSTEM_ADMIN],
        active: true,
        claimed_count: 0,
        in_progress_count: 0,
        completed_count: 1,
        last_claim_at: null,
        last_completion_at: dateB,
        last_sub_updated_at: null,
        last_audit_at: dateB,
      },
      {
        email: "user_d@test.vn",
        display_name: "Tài khoản D",
        roles: [UserRole.REPORT_VIEWER],
        active: true,
        claimed_count: 0,
        in_progress_count: 0,
        completed_count: 0,
        last_claim_at: null,
        last_completion_at: null,
        last_sub_updated_at: null,
        last_audit_at: null,
      },
      {
        email: "user_e@test.vn",
        display_name: "Tài khoản E cũ",
        roles: [UserRole.REVIEW_OFFICER],
        active: false,
        claimed_count: 5,
        in_progress_count: 0,
        completed_count: 5,
        last_claim_at: dateE,
        last_completion_at: dateE,
        last_sub_updated_at: null,
        last_audit_at: dateE,
      },
    ]);

    const summary = await repository.getDashboardSummary({
      fromDate: "2026-08-01",
      toDate: "2026-08-02",
    });

    // Check overall totals
    expect(summary.totals.total).toBe(16);
    expect(summary.totals.pending).toBe(2);
    expect(summary.totals.unassigned).toBe(2);

    // Check account officers array length (must contain ALL 5 accounts)
    expect(summary.officers).toHaveLength(5);

    // Account A
    const accA = summary.officers.find((o) => o.email === "officer_a@test.vn")!;
    expect(accA.displayName).toBe("Cán bộ A");
    expect(accA.active).toBe(true);
    expect(accA.claimedCount).toBe(10);
    expect(accA.inProgressCount).toBe(3);
    expect(accA.completedCount).toBe(7);
    expect(accA.completionRate).toBe("70%");
    expect(accA.lastActivity).toBe(dateB.toISOString());

    // Account B
    const accB = summary.officers.find((o) => o.email === "admin_b@test.vn")!;
    expect(accB.claimedCount).toBe(3);
    expect(accB.completedCount).toBe(3);
    expect(accB.completionRate).toBe("100%");

    // Account C (Admin completing submission originally assigned to A: claimed 0, completed 1)
    const accC = summary.officers.find((o) => o.email === "admin_c@test.vn")!;
    expect(accC.claimedCount).toBe(0);
    expect(accC.completedCount).toBe(1);
    expect(accC.completionRate).toBe("0%");

    // Account D (Active with 0 submissions)
    const accD = summary.officers.find((o) => o.email === "user_d@test.vn")!;
    expect(accD.claimedCount).toBe(0);
    expect(accD.inProgressCount).toBe(0);
    expect(accD.completedCount).toBe(0);
    expect(accD.completionRate).toBe("0%");
    expect(accD.lastActivity).toBeNull();

    // Account E (Locked account with history)
    const accE = summary.officers.find((o) => o.email === "user_e@test.vn")!;
    expect(accE.active).toBe(false);
    expect(accE.claimedCount).toBe(5);
    expect(accE.completedCount).toBe(5);
    expect(accE.completionRate).toBe("100%");
    expect(accE.lastActivity).toBe(dateE.toISOString());
  });

  it("2. listQueuePage handles drill-down by actionType='claimed' and actionType='completed'", async () => {
    databaseMock.unsafe.mockClear();
    databaseMock.unsafe.mockResolvedValueOnce([
      {
        submission_id: "sub_1",
        receipt_code: "PHONGCHAU-2026-000001",
        status: "ACCEPTED",
        phone: "0912345678",
        version: 1,
        claimed_by: "officer_a@test.vn",
        claimed_by_display_name: "Cán bộ A",
        updated_at: new Date("2026-08-01T12:00:00.000Z"),
        queue_issue_number: "AD 123456",
        queue_owner_name: "Nguyễn Văn A",
      },
    ]);

    const pageClaimed = await repository.listQueuePage({
      officer: "officer_a@test.vn",
      actionType: "claimed",
      fromDate: "2026-08-01T00:00:00.000Z",
      toDate: "2026-08-02T23:59:59.999Z",
    });

    expect(pageClaimed.items).toHaveLength(1);
    expect(pageClaimed.items[0].submissionId).toBe("sub_1");

    // Verify SQL query contains audit_logs subquery for actionType
    const [sqlQuery, sqlParams] = databaseMock.unsafe.mock.calls[0];
    expect(sqlQuery).toContain("public.audit_logs");
    expect(sqlQuery).toContain("action in ('SUBMISSION_CLAIMED', 'SUBMISSION_FORCE_CLAIMED')");
    expect(sqlParams).toContain("claimed");
  });
});
