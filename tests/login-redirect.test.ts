import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Session } from "next-auth";

import { GET } from "@/app/admin/login-redirect/route";
import { UserRole } from "@/modules/common/domain";
import type { ActiveUser } from "@/modules/users/supabase-user-repository";

const mocks = vi.hoisted(() => ({
  auth: vi.fn<() => Promise<Session | null>>(),
  resolveActiveUser: vi.fn<(email: string) => Promise<ActiveUser | null>>(),
  redirect: vi.fn<(path: string) => void>(),
}));

vi.mock("@/auth", () => ({
  auth: mocks.auth,
}));

vi.mock("@/modules/auth/authorization", () => ({
  resolveActiveUser: mocks.resolveActiveUser,
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

function makeSession(email = "test@example.com"): Session {
  return {
    user: { email },
    expires: "2099-01-01T00:00:00.000Z",
  };
}

function makeUser(roles: readonly UserRole[]): ActiveUser {
  return {
    email: "test@example.com",
    displayName: "Test",
    roles,
  };
}

describe("Login Redirect Route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects to / if no session", async () => {
    mocks.auth.mockResolvedValueOnce(null);

    await GET();
    expect(mocks.redirect).toHaveBeenCalledWith("/");
  });

  it("redirects to / if user not found", async () => {
    mocks.auth.mockResolvedValueOnce(makeSession());
    mocks.resolveActiveUser.mockResolvedValueOnce(null);

    await GET();
    expect(mocks.redirect).toHaveBeenCalledWith("/");
  });

  it("redirects to /admin/dashboard for DASHBOARD_VIEW_ROLES", async () => {
    const rolesToTest = [
      UserRole.INTAKE_OFFICER,
      UserRole.REVIEW_OFFICER,
      UserRole.WARD_ADMIN,
      UserRole.SYSTEM_ADMIN,
    ] as const;

    for (const role of rolesToTest) {
      mocks.auth.mockResolvedValueOnce(makeSession());
      mocks.resolveActiveUser.mockResolvedValueOnce(makeUser([role]));
      await GET();
      expect(mocks.redirect).toHaveBeenCalledWith("/admin/dashboard");
      mocks.redirect.mockClear();
    }
  });

  it("redirects to /profile for roles without dashboard or submission read access (e.g. REPORT_VIEWER)", async () => {
    mocks.auth.mockResolvedValueOnce(makeSession());
    mocks.resolveActiveUser.mockResolvedValueOnce(makeUser([UserRole.REPORT_VIEWER]));

    await GET();
    expect(mocks.redirect).toHaveBeenCalledWith("/profile");
  });

  it("redirects to /profile for active user with no roles", async () => {
    mocks.auth.mockResolvedValueOnce(makeSession());
    mocks.resolveActiveUser.mockResolvedValueOnce(makeUser([]));

    await GET();
    expect(mocks.redirect).toHaveBeenCalledWith("/profile");
  });
});
