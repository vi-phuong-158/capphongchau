export interface QueueCursor {
  readonly updatedAt: string;
  readonly submissionId: string;
}

const MAX_CURSOR_LENGTH = 1024;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;

export class InvalidQueueCursorError extends Error {
  constructor() {
    super("Con trỏ phân trang không hợp lệ.");
    this.name = "InvalidQueueCursorError";
  }
}

function isQueueCursor(value: unknown): value is QueueCursor {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;

  const candidate = value as Record<string, unknown>;
  if (
    Object.keys(candidate).some((key) => key !== "updatedAt" && key !== "submissionId") ||
    typeof candidate.updatedAt !== "string" ||
    typeof candidate.submissionId !== "string" ||
    !candidate.submissionId ||
    candidate.submissionId.length > 200
  ) {
    return false;
  }

  const timestamp = new Date(candidate.updatedAt);
  return !Number.isNaN(timestamp.getTime()) && timestamp.toISOString() === candidate.updatedAt;
}

/** Cursor là dữ liệu vận chuyển opaque; không chứa PII và không dùng làm bằng chứng phân quyền. */
export function encodeQueueCursor(cursor: QueueCursor): string {
  if (!isQueueCursor(cursor)) throw new InvalidQueueCursorError();
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

/** Giải mã và kiểm tra chặt trước khi đưa giá trị cursor vào câu SQL keyset. */
export function decodeQueueCursor(value: string | null | undefined): QueueCursor | null {
  if (!value) return null;
  if (value.length > MAX_CURSOR_LENGTH || !BASE64URL_PATTERN.test(value)) {
    throw new InvalidQueueCursorError();
  }

  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as unknown;
    if (!isQueueCursor(parsed)) throw new InvalidQueueCursorError();
    return parsed;
  } catch (error) {
    if (error instanceof InvalidQueueCursorError) throw error;
    throw new InvalidQueueCursorError();
  }
}
