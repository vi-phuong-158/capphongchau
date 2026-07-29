import {
  getPublicIntakeRepository,
  type PublicIntakeRepository,
  type SubmissionRecord,
} from "./repository";
import { getPublicIntakeStorage, type PublicIntakeStorage } from "./storage";

const FOLDER_LEASE_SECONDS = 60;

export class SubmissionFolderBusyError extends Error {
  readonly retryAfterSeconds = 1;

  constructor() {
    super("Thư mục tải ảnh đang được chuẩn bị.");
    this.name = "SubmissionFolderBusyError";
  }
}

export class SubmissionFolderUnavailableError extends Error {
  constructor() {
    super("Chưa thể chuẩn bị thư mục tải ảnh.");
    this.name = "SubmissionFolderUnavailableError";
  }
}

type FolderRepository = Pick<
  PublicIntakeRepository,
  | "getSubmissionFolderSnapshot"
  | "markSubmissionFolderFailed"
  | "markSubmissionFolderReady"
  | "tryAcquireSubmissionFolderLease"
>;

type FolderStorage = Pick<PublicIntakeStorage, "ensureSubmissionFolder">;

export interface SubmissionFolderDependencies {
  readonly repository: FolderRepository;
  readonly storage: FolderStorage;
}

/**
 * Lazily materializes `01_INBOX/{submissionId}/originals`.
 *
 * Existing eager-created records return immediately. For lazy records, the database lease is
 * acquired and committed before calling Drive. `ensureSubmissionFolder` lists before creating,
 * so a retry after a crash between Drive creation and the READY checkpoint adopts the same folder.
 */
export async function ensureSubmissionFolderReady(
  record: Pick<SubmissionRecord, "submissionId" | "driveFolderId">,
  dependencies: SubmissionFolderDependencies = {
    repository: getPublicIntakeRepository(),
    storage: getPublicIntakeStorage(),
  },
): Promise<string> {
  if (record.driveFolderId) return record.driveFolderId;

  const acquired = await dependencies.repository.tryAcquireSubmissionFolderLease(
    record.submissionId,
    FOLDER_LEASE_SECONDS,
  );
  if (!acquired) {
    const current = await dependencies.repository.getSubmissionFolderSnapshot(record.submissionId);
    if (current?.state === "READY" && current.driveFolderId) {
      return current.driveFolderId;
    }
    if (current) throw new SubmissionFolderBusyError();
    throw new SubmissionFolderUnavailableError();
  }

  try {
    const driveFolderId = await dependencies.storage.ensureSubmissionFolder(record.submissionId);
    const ready = await dependencies.repository.markSubmissionFolderReady(
      record.submissionId,
      driveFolderId,
      acquired.leaseUntil,
    );
    if (ready?.state === "READY" && ready.driveFolderId) {
      return ready.driveFolderId;
    }
    throw new SubmissionFolderUnavailableError();
  } catch {
    await dependencies.repository
      .markSubmissionFolderFailed(record.submissionId, acquired.leaseUntil)
      .catch(() => undefined);
    throw new SubmissionFolderUnavailableError();
  }
}
