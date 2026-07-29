import { beforeEach, describe, expect, it, vi } from "vitest";

import { emptyDraft } from "@/modules/public-intake/types";

const mocks = vi.hoisted(() => ({
  resolvePublicRequest: vi.fn(),
  saveDraft: vi.fn(),
}));

vi.mock("@/modules/public-intake/route-context", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/modules/public-intake/route-context")
  >();
  return {
    ...actual,
    isEditable: vi.fn().mockReturnValue(true),
    resolvePublicRequest: (...args: unknown[]) => mocks.resolvePublicRequest(...args),
  };
});

vi.mock("@/modules/public-intake/repository", () => ({
  getPublicIntakeRepository: vi.fn().mockReturnValue({
    getOpenSupplementRequest: vi.fn(),
    saveDraft: (...args: unknown[]) => mocks.saveDraft(...args),
  }),
}));

vi.mock("@/modules/common/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/common/env")>();
  return {
    ...actual,
    loadPublicIntakeEnvironment: vi.fn().mockReturnValue({
      MAX_DRAFT_JSON_BYTES: 256_000,
    }),
  };
});

const { PATCH } = await import("@/app/api/public/submissions/current/route");

describe("PATCH /api/public/submissions/current", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("từ chối an toàn version quá cũ và không ghi đè snapshot server mới hơn", async () => {
    const draft = emptyDraft("owner-server", "parcel-server", "land-use-server");
    draft.phone = "0912345678";
    draft.consentAccepted = true;
    mocks.resolvePublicRequest.mockResolvedValue({
      requestId: "req-stale-patch",
      record: {
        submissionId: "submission-1",
        status: "DRAFT",
        version: 5,
        draft,
      },
    });

    const response = await PATCH(
      new Request("http://localhost/api/public/submissions/current", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          draft: {
            ...draft,
            owners: [{ ...draft.owners[0], fullName: "Snapshot cũ" }],
          },
          version: 3,
        }),
      }),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "VERSION_CONFLICT", requestId: "req-stale-patch" },
    });
    expect(mocks.saveDraft).not.toHaveBeenCalled();
  });

  it("từ chối cả version chỉ cũ đúng một lượt và repository nhận expected version chính xác", async () => {
    const draft = emptyDraft("owner-server", "parcel-server", "land-use-server");
    draft.phone = "0912345678";
    draft.consentAccepted = true;
    mocks.resolvePublicRequest.mockResolvedValue({
      requestId: "req-one-behind",
      record: { submissionId: "submission-1", status: "DRAFT", version: 5, draft },
    });
    const stale = await PATCH(
      new Request("http://localhost/api/public/submissions/current", {
        method: "PATCH",
        body: JSON.stringify({ draft, version: 4 }),
      }),
    );
    expect(stale.status).toBe(409);
    expect(mocks.saveDraft).not.toHaveBeenCalled();

    mocks.saveDraft.mockResolvedValue(6);
    const current = await PATCH(
      new Request("http://localhost/api/public/submissions/current", {
        method: "PATCH",
        body: JSON.stringify({ draft, version: 5 }),
      }),
    );
    expect(current.status).toBe(200);
    expect(mocks.saveDraft).toHaveBeenCalledWith(expect.anything(), draft, "DRAFT", 5);
  });
});
