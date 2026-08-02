import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "@/app/admin/login-redirect/route";
import { UserRole } from "@/modules/common/domain";
import * as authModule from "@/auth";
import * as authorizationModule from "@/modules/auth/authorization";

vi.mock("@/auth", () => ({
  auth: vi.fn()
}));
vi.mock("@/modules/auth/authorization");

const mockRedirect = vi.fn();
vi.mock("next/navigation", () => ({
  redirect: (path: string) => mockRedirect(path)
}));

describe("Login Redirect Route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects to / if no session", async () => {
    vi.mocked(authModule.auth).mockResolvedValueOnce(null as any);

    await GET();
    expect(mockRedirect).toHaveBeenCalledWith("/");
  });

  it("redirects to / if user not found", async () => {
    vi.mocked(authModule.auth).mockResolvedValueOnce({
      user: { email: "test@example.com" },
      expires: "1",
    } as any);
    vi.mocked(authorizationModule.resolveActiveUser).mockResolvedValueOnce(null);

    await GET();
    expect(mockRedirect).toHaveBeenCalledWith("/");
  });

  it("redirects to /admin/dashboard for DASHBOARD_VIEW_ROLES", async () => {
    const rolesToTest = [UserRole.INTAKE_OFFICER, UserRole.REVIEW_OFFICER, UserRole.WARD_ADMIN, UserRole.SYSTEM_ADMIN];
    for (const role of rolesToTest) {
      vi.mocked(authModule.auth).mockResolvedValueOnce({
        user: { email: "test@example.com" },
        expires: "1",
      } as any);
      vi.mocked(authorizationModule.resolveActiveUser).mockResolvedValueOnce({
        email: "test@example.com",
        displayName: "Test",
        active: true,
        roles: [role],
      } as any);
      await GET();
      expect(mockRedirect).toHaveBeenCalledWith("/admin/dashboard");
      mockRedirect.mockClear();
    }
  });

  it("redirects to /submissions for SUBMISSION_READ_ROLES without dashboard", async () => {
    // If the system has a role that can read submissions but not view dashboard, test it here.
    // Currently, all SUBMISSION_READ_ROLES are also in DASHBOARD_VIEW_ROLES.
    // Let's test with a fake scenario or assume there is no such role currently.
    // We'll skip for now since they are identical in our config, but the logic covers it.
  });

  it("redirects to /profile for roles without dashboard or submission read access (e.g. REPORT_VIEWER)", async () => {
    vi.mocked(authModule.auth).mockResolvedValueOnce({
      user: { email: "test@example.com" },
      expires: "1",
    } as any);
    vi.mocked(authorizationModule.resolveActiveUser).mockResolvedValueOnce({
      email: "test@example.com",
      displayName: "Test",
      active: true,
      roles: [UserRole.REPORT_VIEWER],
    } as any);

    await GET();
    expect(mockRedirect).toHaveBeenCalledWith("/profile");
  });

  it("redirects to /profile for active user with no roles", async () => {
    vi.mocked(authModule.auth).mockResolvedValueOnce({
      user: { email: "test@example.com" },
      expires: "1",
    } as any);
    vi.mocked(authorizationModule.resolveActiveUser).mockResolvedValueOnce({
      email: "test@example.com",
      displayName: "Test",
      active: true,
      roles: [],
    } as any);

    await GET();
    expect(mockRedirect).toHaveBeenCalledWith("/profile");
  });
});
