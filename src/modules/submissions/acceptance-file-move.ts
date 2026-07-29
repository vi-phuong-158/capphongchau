/**
 * Phase 5A keeps Drive concurrency deliberately small. Persistence stays in
 * the saga so a checkpoint remains a short transaction under its advisory lock.
 */
export const OFFICIAL_ACCEPTANCE_FILE_MOVE_CONCURRENCY = 2;

export interface SettledAcceptanceMove<T> {
  readonly succeeded: readonly T[];
  readonly failure: unknown | null;
}

/** Split values in their existing order; no chunk can exceed the Drive limit. */
export function chunkOfficialAcceptanceFiles<T>(
  values: readonly T[],
  chunkSize = OFFICIAL_ACCEPTANCE_FILE_MOVE_CONCURRENCY,
): readonly (readonly T[])[] {
  if (
    !Number.isInteger(chunkSize) ||
    chunkSize < 1 ||
    chunkSize > OFFICIAL_ACCEPTANCE_FILE_MOVE_CONCURRENCY
  ) {
    throw new Error("Kích thước nhóm chuyển tệp không hợp lệ.");
  }

  const chunks: T[][] = [];
  for (let start = 0; start < values.length; start += chunkSize) {
    chunks.push(values.slice(start, start + chunkSize));
  }
  return chunks;
}

/**
 * Start at most two moves together and retain input order in the successful
 * result. A failed peer does not hide successes: the caller checkpoints them
 * once before returning its retryable error.
 */
export async function settleOfficialAcceptanceMoveChunk<T>(
  chunk: readonly T[],
  move: (item: T) => Promise<void>,
): Promise<SettledAcceptanceMove<T>> {
  const settled = await Promise.allSettled(chunk.map((item) => move(item)));
  const succeeded: T[] = [];
  let failure: unknown | null = null;

  for (let index = 0; index < settled.length; index += 1) {
    const result = settled[index];
    if (result.status === "fulfilled") {
      succeeded.push(chunk[index]);
    } else if (failure === null) {
      failure = result.reason;
    }
  }

  return { succeeded, failure };
}
