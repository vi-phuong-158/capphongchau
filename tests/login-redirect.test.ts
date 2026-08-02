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
  redirect: (...args: any[]) => mockRedirect(...args)
}));

describe("Login Redirect Route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects to / if no session", async () => {
    vi.mocked(authModule.auth).mockResolvedValueOnce(null);

    await GET();
    expect(mockRedirect).toHaveBeenCalledWith("/");
  });

  it("redirects to / if user not found", async () => {
    vi.mocked(authModule.auth).mockResolvedValueOnce({
      user: { email: "test@example.com" },
      expires: "1",
    });
    vi.mocked(authorizationModule.resolveActiveUser).mockResolvedValueOnce(null);

    await GET();
    expect(mockRedirect).toHaveBeenCalledWith("/");
  });

  it("redirects to /admin/dashboard if user has DASHBOARD_VIEW_ROLES", async () => {
    vi.mocked(authModule.auth).mockResolvedValueOnce({
      user: { email: "test@example.com" },
      expires: "1",
    });
    vi.mocked(authorizationModule.resolveActiveUser).mockResolvedValueOnce({
      email: "test@example.com",
      displayName: "Test",
      active: true,
      roles: [UserRole.INTAKE_OFFICER], // INTAKE_OFFICER is in DASHBOARD_VIEW_ROLES
    });

    await GET();
    expect(mockRedirect).toHaveBeenCalledWith("/admin/dashboard");
  });

  it("redirects to /submissions if user does not have DASHBOARD_VIEW_ROLES", async () => {
    vi.mocked(authModule.auth).mockResolvedValueOnce({
      user: { email: "test@example.com" },
      expires: "1",
    });
    vi.mocked(authorizationModule.resolveActiveUser).mockResolvedValueOnce({
      email: "test@example.com",
      displayName: "Test",
      active: true,
      roles: [UserRole.REPORT_VIEWER], // REPORT_VIEWER is NOT in DASHBOARD_VIEW_ROLES
    });

    await GET();
    expect(mockRedirect).toHaveBeenCalledWith("/submissions");
  });
});
