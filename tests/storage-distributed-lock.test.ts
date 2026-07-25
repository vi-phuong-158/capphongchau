import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  events: [] as string[],
  lockSql: "",
  lockValues: [] as unknown[],
  begin: vi.fn(),
  list: vi.fn(),
  create: vi.fn(),
}));

vi.mock("@/modules/supabase/database", () => ({
  getDatabase: () => ({ begin: mocks.begin }),
}));

vi.mock("@/modules/google/workspace-client", () => ({
  createGoogleWorkspaceClient: () => ({
    drive: { files: { list: mocks.list, create: mocks.create } },
  }),
  getGoogleAccessToken: vi.fn(),
}));

import { PublicIntakeStorage } from "@/modules/public-intake/storage";

describe("PublicIntakeStorage distributed folder lock", () => {
  it("holds a PostgreSQL advisory transaction lock before querying or creating a cache-miss folder", async () => {
    const transaction = Object.assign(
      async (strings: TemplateStringsArray, ...values: unknown[]) => {
        mocks.lockSql = strings.join("?");
        mocks.lockValues = values;
        mocks.events.push("lock");
        return [];
      },
      { unsafe: vi.fn() },
    );
    mocks.begin.mockImplementation(async (callback) => callback(transaction));
    mocks.list.mockImplementation(async () => {
      mocks.events.push("list");
      return { data: { files: [] } };
    });
    mocks.create.mockImplementation(async () => {
      mocks.events.push("create");
      return { data: { id: "drive-folder-locked" } };
    });

    const storage = new PublicIntakeStorage({
      GOOGLE_DRIVE_CLIENT_ID: "test-client",
      GOOGLE_DRIVE_CLIENT_SECRET: "test-secret",
      GOOGLE_DRIVE_REFRESH_TOKEN: "test-refresh",
      GOOGLE_MY_DRIVE_ROOT_FOLDER_ID: "root-lock-test",
      MIN_DRIVE_FREE_GB: 1,
    });
    await expect(storage.findOrCreateFolder("case-lock-test", "parent-lock-test")).resolves.toBe(
      "drive-folder-locked",
    );

    expect(mocks.begin).toHaveBeenCalledOnce();
    expect(mocks.events).toEqual(["lock", "list", "create"]);
    expect(mocks.lockSql).toContain("pg_advisory_xact_lock");
    expect(mocks.lockValues).toEqual(["DRIVE_FOLDER:parent-lock-test:case-lock-test"]);
  });
});
