import { describe, expect, it, vi } from "vitest";

import {
  ensureSubmissionFolderReady,
  SubmissionFolderBusyError,
  SubmissionFolderUnavailableError,
  type SubmissionFolderDependencies,
} from "@/modules/public-intake/submission-folder";
import {
  MAX_SUBMISSION_FOLDER_ATTEMPTS,
  type SubmissionFolderSnapshot,
  type SubmissionFolderState,
} from "@/modules/public-intake/repository";

function snapshot(
  state: SubmissionFolderState,
  driveFolderId: string | null = null,
  attempts = 0,
): SubmissionFolderSnapshot {
  return { state, driveFolderId, attempts, leaseToken: state === "CREATING" ? "future" : "" };
}

function dependencies(overrides?: {
  readonly acquire?: SubmissionFolderSnapshot | null;
  readonly current?: SubmissionFolderSnapshot | null;
  readonly driveFolderId?: string;
  readonly driveError?: Error;
}): SubmissionFolderDependencies & {
  repository: SubmissionFolderDependencies["repository"] & {
    getSubmissionFolderSnapshot: ReturnType<typeof vi.fn>;
    markSubmissionFolderFailed: ReturnType<typeof vi.fn>;
    markSubmissionFolderReady: ReturnType<typeof vi.fn>;
    tryAcquireSubmissionFolderLease: ReturnType<typeof vi.fn>;
  };
  storage: SubmissionFolderDependencies["storage"] & {
    ensureSubmissionFolder: ReturnType<typeof vi.fn>;
  };
} {
  const driveFolderId = overrides?.driveFolderId ?? "drive-originals";
  const acquire = overrides && "acquire" in overrides ? overrides.acquire : snapshot("CREATING");
  return {
    repository: {
      getSubmissionFolderSnapshot: vi.fn().mockResolvedValue(overrides?.current ?? null),
      markSubmissionFolderFailed: vi.fn().mockResolvedValue(undefined),
      markSubmissionFolderReady: vi.fn().mockResolvedValue(snapshot("READY", driveFolderId, 1)),
      tryAcquireSubmissionFolderLease: vi.fn().mockResolvedValue(acquire),
    },
    storage: {
      ensureSubmissionFolder: overrides?.driveError
        ? vi.fn().mockRejectedValue(overrides.driveError)
        : vi.fn().mockResolvedValue(driveFolderId),
    },
  };
}

const lazyRecord = { submissionId: "submission-1", driveFolderId: null };

describe("Phase 3 lazy submission folder", () => {
  it("trả ngay folder eager hiện có mà không chạm database hoặc Drive", async () => {
    const deps = dependencies();

    await expect(
      ensureSubmissionFolderReady(
        { submissionId: "submission-eager", driveFolderId: "existing-folder" },
        deps,
      ),
    ).resolves.toBe("existing-folder");
    expect(deps.repository.tryAcquireSubmissionFolderLease).not.toHaveBeenCalled();
    expect(deps.storage.ensureSubmissionFolder).not.toHaveBeenCalled();
  });

  it("checkpoint READY sau khi lease đã được cấp và Drive hoàn tất", async () => {
    const deps = dependencies();

    await expect(ensureSubmissionFolderReady(lazyRecord, deps)).resolves.toBe("drive-originals");
    expect(deps.repository.tryAcquireSubmissionFolderLease).toHaveBeenCalledWith(
      "submission-1",
      60,
    );
    expect(deps.storage.ensureSubmissionFolder).toHaveBeenCalledOnce();
    expect(deps.repository.markSubmissionFolderReady).toHaveBeenCalledWith(
      "submission-1",
      "drive-originals",
      "future",
    );
    expect(deps.repository.markSubmissionFolderFailed).not.toHaveBeenCalled();
  });

  it("request thua lease nhận lỗi retryable, không tạo folder thứ hai", async () => {
    const deps = dependencies({
      acquire: null,
      current: snapshot("CREATING", null, 1),
    });

    await expect(ensureSubmissionFolderReady(lazyRecord, deps)).rejects.toBeInstanceOf(
      SubmissionFolderBusyError,
    );
    expect(deps.storage.ensureSubmissionFolder).not.toHaveBeenCalled();
  });

  it("hết trần thử lại thì báo không khả dụng thay vì mời client retry vô hạn", async () => {
    const deps = dependencies({
      acquire: null,
      current: snapshot("FAILED", null, MAX_SUBMISSION_FOLDER_ATTEMPTS),
    });

    await expect(ensureSubmissionFolderReady(lazyRecord, deps)).rejects.toBeInstanceOf(
      SubmissionFolderUnavailableError,
    );
    expect(deps.storage.ensureSubmissionFolder).not.toHaveBeenCalled();
  });

  it("retry sau crash dùng list-before-create của storage rồi checkpoint folder đã tìm thấy", async () => {
    const deps = dependencies({
      acquire: snapshot("CREATING", null, 2),
      driveFolderId: "folder-created-before-crash",
    });

    await expect(ensureSubmissionFolderReady(lazyRecord, deps)).resolves.toBe(
      "folder-created-before-crash",
    );
    expect(deps.repository.markSubmissionFolderReady).toHaveBeenCalledWith(
      "submission-1",
      "folder-created-before-crash",
      "future",
    );
  });

  it("Drive lỗi chỉ lưu FAILED, không truyền chi tiết lỗi vào repository", async () => {
    const deps = dependencies({ driveError: new Error("internal-drive-id-secret") });

    await expect(ensureSubmissionFolderReady(lazyRecord, deps)).rejects.toBeInstanceOf(
      SubmissionFolderUnavailableError,
    );
    expect(deps.repository.markSubmissionFolderFailed).toHaveBeenCalledWith(
      "submission-1",
      "future",
    );
    expect(deps.repository.markSubmissionFolderFailed).toHaveBeenCalledWith(
      expect.not.stringContaining("internal-drive-id-secret"),
      expect.not.stringContaining("internal-drive-id-secret"),
    );
  });
});
