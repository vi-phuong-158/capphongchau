/**
 * Tải tệp lên Google Drive qua phiên resumable, chạy phía trình duyệt.
 *
 * Vì sao cần module riêng thay vì một lệnh `fetch` PUT: mạng 4G yếu rớt giữa chừng thì `fetch`
 * không tự bỏ cuộc — nó treo cho tới khi hệ điều hành đóng socket, có thể hàng phút. Người dân
 * thấy "Đang tải…" đứng im và không có cách nào thoát. Ở đây mỗi lần thử đều có timeout, hỏng
 * thì hỏi Google đã nhận được bao nhiêu byte rồi gửi tiếp phần còn thiếu, và luôn hủy được.
 */

export const UPLOAD_TIMEOUT_MS = 60_000;
export const MAX_UPLOAD_ATTEMPTS = 3;

/** Google trả tiến độ ở header `Range` dạng `bytes=0-262143` — số byte đã nhận là chặn trên + 1. */
export function parseReceivedBytes(rangeHeader: string | null): number {
  if (!rangeHeader) {
    return 0;
  }

  const match = /bytes=0-(\d+)$/.exec(rangeHeader.trim());
  return match ? Number(match[1]) + 1 : 0;
}

export class UploadCancelledError extends Error {
  constructor() {
    super("Đã hủy tải tệp.");
    this.name = "UploadCancelledError";
  }
}

export class UploadFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UploadFailedError";
  }
}

export interface UploadOptions {
  readonly uploadUrl: string;
  readonly file: Blob;
  readonly contentType: string;
  readonly signal?: AbortSignal;
  readonly onProgress?: (sentBytes: number, totalBytes: number) => void;
  /** Chỉ dùng cho test. */
  readonly fetchImpl?: typeof fetch;
  readonly timeoutMs?: number;
  readonly maxAttempts?: number;
}

interface AttemptContext {
  readonly fetchImpl: typeof fetch;
  readonly timeoutMs: number;
  readonly signal?: AbortSignal;
}

/** Ghép timeout riêng của lần thử với tín hiệu hủy của người dùng. */
async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  context: AttemptContext,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), context.timeoutMs);
  const onExternalAbort = () => controller.abort();
  context.signal?.addEventListener("abort", onExternalAbort);

  try {
    return await context.fetchImpl(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    context.signal?.removeEventListener("abort", onExternalAbort);
  }
}

/**
 * Hỏi Google đã nhận được bao nhiêu byte. Gửi PUT rỗng với `Content-Range: bytes *​/tổng`;
 * Google trả 308 kèm header `Range`, hoặc 200/201 nếu thực ra đã nhận đủ.
 */
async function queryUploadedBytes(
  uploadUrl: string,
  totalBytes: number,
  context: AttemptContext,
): Promise<{ received: number; completedFileId?: string }> {
  const response = await fetchWithTimeout(
    uploadUrl,
    { method: "PUT", headers: { "Content-Range": `bytes */${totalBytes}` } },
    context,
  );

  if (response.ok) {
    const body = (await response.json()) as { id?: string };
    return { received: totalBytes, completedFileId: body.id };
  }

  return { received: parseReceivedBytes(response.headers.get("Range")) };
}

/** Trả về Drive file ID khi tải xong. */
export async function uploadWithResume(options: UploadOptions): Promise<string> {
  const context: AttemptContext = {
    fetchImpl: options.fetchImpl ?? globalThis.fetch.bind(globalThis),
    timeoutMs: options.timeoutMs ?? UPLOAD_TIMEOUT_MS,
    signal: options.signal,
  };
  const maxAttempts = options.maxAttempts ?? MAX_UPLOAD_ATTEMPTS;
  const totalBytes = options.file.size;

  let offset = 0;
  let lastError = "Tải tệp thất bại.";

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (options.signal?.aborted) {
      throw new UploadCancelledError();
    }

    try {
      const headers: Record<string, string> =
        offset > 0
          ? { "Content-Range": `bytes ${offset}-${totalBytes - 1}/${totalBytes}` }
          : {
              // Google Drive resumable upload chấp nhận một PUT duy nhất, nhưng browser không cho
              // phép app tự đặt Content-Length. Khai báo rõ phạm vi byte ngay từ lượt đầu là hợp
              // đồng resumable chuẩn, tránh phụ thuộc vào việc runtime có tự thêm Content-Length
              // hay không (đặc biệt trên WebKit/mobile).
              "Content-Type": options.contentType,
              "Content-Range": `bytes 0-${totalBytes - 1}/${totalBytes}`,
            };

      const response = await fetchWithTimeout(
        options.uploadUrl,
        { method: "PUT", headers, body: options.file.slice(offset) },
        context,
      );

      if (response.ok) {
        options.onProgress?.(totalBytes, totalBytes);
        const body = (await response.json()) as { id?: string };
        if (!body.id) {
          throw new UploadFailedError("Google Drive không trả mã tệp.");
        }
        return body.id;
      }

      // 308 = đã nhận một phần, gửi tiếp từ chỗ dở.
      if (response.status === 308) {
        offset = parseReceivedBytes(response.headers.get("Range"));
        options.onProgress?.(offset, totalBytes);
        continue;
      }

      lastError = `Google Drive từ chối tệp (HTTP ${response.status}).`;
    } catch (error) {
      if (options.signal?.aborted) {
        throw new UploadCancelledError();
      }
      lastError =
        error instanceof UploadFailedError ? error.message : "Mất kết nối khi đang tải tệp lên.";

      if (attempt < maxAttempts) {
        // Hỏi lại tiến độ trước khi thử tiếp, tránh gửi lại từ đầu phần đã đến nơi.
        try {
          const status = await queryUploadedBytes(options.uploadUrl, totalBytes, context);
          if (status.completedFileId) {
            options.onProgress?.(totalBytes, totalBytes);
            return status.completedFileId;
          }
          offset = status.received;
          options.onProgress?.(offset, totalBytes);
        } catch {
          // Không hỏi được tiến độ thì giữ nguyên offset và thử lại.
        }
      }
    }
  }

  throw new UploadFailedError(lastError);
}
