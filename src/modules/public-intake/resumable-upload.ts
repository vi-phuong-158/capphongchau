/**
 * Tải tệp lên Google Drive qua phiên resumable, chạy phía trình duyệt.
 *
 * Vì sao cần module riêng thay vì một lệnh `fetch` PUT: mạng 4G yếu rớt giữa chừng thì `fetch`
 * không tự bỏ cuộc — nó treo cho tới khi hệ điều hành đóng socket, có thể hàng phút. Người dân
 * thấy "Đang tải…" đứng im và không có cách nào thoát. Ở đây mỗi lần thử đều có timeout, hỏng
 * thì hỏi Google đã nhận được bao nhiêu byte rồi gửi tiếp phần còn thiếu, và luôn hủy được.
 */

import {
  createFetchTransport,
  UploadTransportError,
  type ResumablePutTransport,
} from "./upload-transport";

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
  /**
   * Lớp truyền PUT dữ liệu. Mặc định dùng `fetch` (không có tiến độ liên tục); trình duyệt truyền
   * `createXhrTransport()` để có `upload.onprogress`. Việc hỏi tiến độ vẫn luôn đi qua `fetch`.
   */
  readonly transport?: ResumablePutTransport;
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
  const transport = options.transport ?? createFetchTransport(context.fetchImpl);

  let offset = 0;
  let lastError = "Tải tệp thất bại.";

  /**
   * Tiến độ chỉ được tăng.
   *
   * Sau một lần đứt mạng, Google có thể báo đã nhận **ít hơn** con số XHR vừa đếm được — byte đã
   * rời thiết bị không có nghĩa là đã tới nơi. Để thanh phần trăm tụt lại là tín hiệu sai: người
   * dân đọc đó là "hỏng, phải làm lại" và bấm hủy.
   */
  let reportedBytes = 0;
  const reportProgress = (sent: number): void => {
    if (!options.onProgress) return;
    const clamped = Math.min(Math.max(sent, reportedBytes), totalBytes);
    reportedBytes = clamped;
    options.onProgress(clamped, totalBytes);
  };

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (options.signal?.aborted) {
      throw new UploadCancelledError();
    }

    try {
      // Google Drive resumable upload chấp nhận một PUT duy nhất, nhưng browser không cho phép
      // app tự đặt Content-Length. Khai báo rõ phạm vi byte ngay từ lượt đầu là hợp đồng
      // resumable chuẩn, tránh phụ thuộc vào việc runtime có tự thêm Content-Length hay không
      // (đặc biệt trên WebKit/mobile).
      const sentBefore = offset;
      const response = await transport.put({
        url: options.uploadUrl,
        body: options.file.slice(offset),
        contentType: offset > 0 ? undefined : options.contentType,
        contentRange: `bytes ${offset}-${totalBytes - 1}/${totalBytes}`,
        signal: options.signal,
        timeoutMs: context.timeoutMs,
        // Transport đếm theo phần thân đang gửi; cộng lại phần đã gửi ở các lượt trước để phần
        // trăm hiển thị luôn tính trên toàn tệp và không bao giờ tụt về sau khi resume.
        onProgress: options.onProgress
          ? (loaded) => reportProgress(sentBefore + loaded)
          : undefined,
      });

      if (response.ok) {
        reportProgress(totalBytes);
        const body = JSON.parse(response.bodyText || "{}") as { id?: string };
        if (!body.id) {
          throw new UploadFailedError("Google Drive không trả mã tệp.");
        }
        return body.id;
      }

      // 308 = đã nhận một phần, gửi tiếp từ chỗ dở.
      if (response.status === 308) {
        offset = parseReceivedBytes(response.rangeHeader);
        reportProgress(offset);
        continue;
      }

      lastError = `Google Drive từ chối tệp (HTTP ${response.status}).`;
    } catch (error) {
      if (options.signal?.aborted) {
        throw new UploadCancelledError();
      }
      lastError =
        error instanceof UploadFailedError || error instanceof UploadTransportError
          ? error.message
          : "Mất kết nối khi đang tải tệp lên.";

      if (attempt < maxAttempts) {
        // Hỏi lại tiến độ trước khi thử tiếp, tránh gửi lại từ đầu phần đã đến nơi.
        try {
          const status = await queryUploadedBytes(options.uploadUrl, totalBytes, context);
          if (status.completedFileId) {
            reportProgress(totalBytes);
            return status.completedFileId;
          }
          offset = status.received;
          reportProgress(offset);
        } catch {
          // Không hỏi được tiến độ thì giữ nguyên offset và thử lại.
        }
      }
    }
  }

  throw new UploadFailedError(lastError);
}
