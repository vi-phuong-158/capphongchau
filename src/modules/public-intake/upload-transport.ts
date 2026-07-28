/**
 * Lớp truyền tải cho PUT dữ liệu của phiên resumable.
 *
 * Vì sao tách ra: `fetch` **không** báo tiến độ tải lên. Không có sự kiện nào giữa lúc gửi và lúc
 * nhận response, nên thanh phần trăm cũ chỉ nhảy khi một lượt kết thúc hoặc khi retry — với ảnh
 * 12 MiB trên 4G, người dân nhìn "0%" suốt nửa phút rồi thẳng lên 100%. Không phân biệt được
 * "đang chạy chậm" với "đã treo", và đó chính là góp ý "up ảnh lâu quá".
 *
 * `XMLHttpRequest` có `upload.onprogress`, nên nó là lựa chọn duy nhất cho việc này ở trình duyệt.
 * Chỉ **PUT dữ liệu** đi qua đây; initiate, hỏi tiến độ và complete vẫn dùng `fetch` như cũ.
 *
 * Interface này cũng làm test được: production dùng XHR, test dùng transport giả không cần mạng.
 */

export interface ResumablePutInput {
  readonly url: string;
  readonly body: Blob;
  /** Chỉ đặt ở lượt đầu; các lượt tiếp theo chỉ cần `Content-Range`. */
  readonly contentType?: string;
  readonly contentRange: string;
  readonly signal?: AbortSignal;
  readonly timeoutMs: number;
  /** `loaded`/`total` tính theo **phần thân đang gửi**, không phải toàn tệp. */
  readonly onProgress?: (loaded: number, total: number) => void;
}

export interface ResumablePutResult {
  readonly status: number;
  readonly ok: boolean;
  /** Header `Range` do Google trả ở phản hồi 308. */
  readonly rangeHeader: string | null;
  readonly bodyText: string;
}

export interface ResumablePutTransport {
  put(input: ResumablePutInput): Promise<ResumablePutResult>;
}

export class UploadTransportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UploadTransportError";
  }
}

/**
 * Transport dựa trên `fetch` — không có tiến độ liên tục.
 *
 * Giữ lại làm mặc định để hành vi cũ không đổi ở nơi chưa truyền transport, và để test hiện có
 * tiếp tục kiểm được đúng phần header/hợp đồng resumable.
 */
export function createFetchTransport(fetchImpl: typeof fetch): ResumablePutTransport {
  return {
    async put(input: ResumablePutInput): Promise<ResumablePutResult> {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), input.timeoutMs);
      const onExternalAbort = () => controller.abort();
      input.signal?.addEventListener("abort", onExternalAbort);

      try {
        const headers: Record<string, string> = { "Content-Range": input.contentRange };
        if (input.contentType) headers["Content-Type"] = input.contentType;

        const response = await fetchImpl(input.url, {
          method: "PUT",
          headers,
          body: input.body,
          signal: controller.signal,
        });

        // Cố tình KHÔNG gọi `onProgress`: `fetch` chỉ biết request đã kết thúc, chưa biết Google
        // nhận được bao nhiêu. Báo 100% ở đây thì một phản hồi 308 "mới nhận 400/1000 byte" sẽ
        // hiện 100% rồi tụt về 40% — sai và làm người dân tưởng hỏng. Phía gọi tự báo tiến độ
        // dựa trên kết quả thật.
        return {
          status: response.status,
          ok: response.ok,
          rangeHeader: response.headers.get("Range"),
          bodyText: response.ok ? await response.text() : "",
        };
      } finally {
        clearTimeout(timer);
        input.signal?.removeEventListener("abort", onExternalAbort);
      }
    },
  };
}
