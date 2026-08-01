import { beforeEach, describe, expect, it, vi } from "vitest";

import { PreviewUnavailableError, PublicIntakeStorage } from "@/modules/public-intake/storage";

const mockGet = vi.fn();

vi.mock("@/modules/google/workspace-client", () => ({
  createGoogleWorkspaceClient: vi.fn().mockReturnValue({
    drive: {
      files: {
        get: (...args: unknown[]) => mockGet(...args),
      },
    },
  }),
}));

const mockEnvironment = {
  GOOGLE_MY_DRIVE_ROOT_FOLDER_ID: "root",
  GOOGLE_DRIVE_CLIENT_ID: "client_id",
  GOOGLE_DRIVE_CLIENT_SECRET: "client_secret",
  GOOGLE_DRIVE_REFRESH_TOKEN: "refresh_token",
};

describe("storage readOriginal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it("trả về đúng bytes và MIME type khi file hợp lệ", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const storage = new PublicIntakeStorage(mockEnvironment as any);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockGet.mockImplementation(async (params: Record<string, unknown>) => {
      if (params.fields === "size,mimeType") {
        return { data: { size: "1024", mimeType: "image/jpeg" } };
      }
      if (params.alt === "media") {
        return { data: new Uint8Array([1, 2, 3]).buffer };
      }
      throw new Error("Unexpected arguments");
    });

    const result = await storage.readOriginal("fake-id");
    expect(result.contentType).toBe("image/jpeg");
    expect(result.bytes.byteLength).toBe(3);

    expect(mockGet).toHaveBeenCalledWith(
      { fileId: "fake-id", alt: "media" },
      { responseType: "arraybuffer" },
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(
      mockGet.mock.calls.some((call) => (call[0] as any).fields?.includes("thumbnailLink")),
    ).toBe(false);
  });

  it("từ chối file rỗng", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const storage = new PublicIntakeStorage(mockEnvironment as any);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockGet.mockImplementation(async (params: Record<string, unknown>) => {
      if (params.fields === "size,mimeType") {
        return { data: { size: "1024", mimeType: "image/jpeg" } };
      }
      if (params.alt === "media") {
        return { data: new Uint8Array([]).buffer };
      }
      throw new Error("Unexpected arguments");
    });

    await expect(storage.readOriginal("fake-id")).rejects.toThrow("Tệp tin trống.");
  });

  it("từ chối file vượt quá 30 MB", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const storage = new PublicIntakeStorage(mockEnvironment as any);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockGet.mockImplementation(async (params: Record<string, unknown>) => {
      if (params.fields === "size,mimeType") {
        return { data: { size: String(30 * 1024 * 1024 + 1), mimeType: "image/jpeg" } };
      }
      throw new Error("Unexpected arguments");
    });

    await expect(storage.readOriginal("fake-id")).rejects.toThrow("vượt quá giới hạn 30 MB");
  });

  it("từ chối MIME type không hợp lệ", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const storage = new PublicIntakeStorage(mockEnvironment as any);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockGet.mockImplementation(async (params: Record<string, unknown>) => {
      if (params.fields === "size,mimeType") {
        return { data: { size: "1024", mimeType: "application/pdf" } };
      }
      throw new Error("Unexpected arguments");
    });

    await expect(storage.readOriginal("fake-id")).rejects.toThrow(
      "Định dạng tệp không được chấp nhận",
    );
  });
});
