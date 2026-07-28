"use client";

/**
 * Transport PUT bằng `XMLHttpRequest` — đường duy nhất lấy được tiến độ tải lên thật ở trình duyệt.
 *
 * Không log `input.url`: đó là URL phiên resumable của Google, ai cầm được là ghi đè được tệp
 * trong kho của phường.
 */

import {
  UploadTransportError,
  type ResumablePutInput,
  type ResumablePutResult,
  type ResumablePutTransport,
} from "./upload-transport";

export function createXhrTransport(): ResumablePutTransport {
  return {
    put(input: ResumablePutInput): Promise<ResumablePutResult> {
      return new Promise<ResumablePutResult>((resolve, reject) => {
        const request = new XMLHttpRequest();
        request.open("PUT", input.url, true);
        request.timeout = input.timeoutMs;
        request.setRequestHeader("Content-Range", input.contentRange);
        if (input.contentType) request.setRequestHeader("Content-Type", input.contentType);

        const onExternalAbort = () => request.abort();
        input.signal?.addEventListener("abort", onExternalAbort);

        const cleanup = () => {
          input.signal?.removeEventListener("abort", onExternalAbort);
        };

        if (input.onProgress) {
          request.upload.onprogress = (event) => {
            // `lengthComputable` false xảy ra khi trình duyệt không biết tổng — bỏ qua mốc đó
            // thay vì hiển thị phần trăm bịa.
            if (event.lengthComputable) input.onProgress?.(event.loaded, event.total);
          };
        }

        request.onload = () => {
          cleanup();
          const status = request.status;
          resolve({
            status,
            ok: status >= 200 && status < 300,
            // Chỉ đọc đúng header cần; `getAllResponseHeaders` không cần thiết ở đây.
            rangeHeader: request.getResponseHeader("Range"),
            bodyText: status >= 200 && status < 300 ? request.responseText : "",
          });
        };

        request.onerror = () => {
          cleanup();
          reject(new UploadTransportError("Mất kết nối khi đang tải tệp lên."));
        };

        request.ontimeout = () => {
          cleanup();
          reject(new UploadTransportError("Quá thời gian chờ khi đang tải tệp lên."));
        };

        request.onabort = () => {
          cleanup();
          reject(new UploadTransportError("Đã hủy tải tệp."));
        };

        request.send(input.body);
      });
    },
  };
}
