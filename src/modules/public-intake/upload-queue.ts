/**
 * Hàng đợi tải ảnh có giới hạn số việc chạy đồng thời.
 *
 * Vì sao cần: trước V2 ảnh GCN được tải **tuần tự** — chọn 3 ảnh là chờ hết ảnh này tới ảnh kia,
 * trong khi đường lên 4G vẫn còn trống. Nhưng bắn cả 3 cùng lúc cũng sai: mỗi luồng giành băng
 * thông của nhau nên ảnh nào cũng lâu, không ảnh nào xong sớm, và trên máy yếu thì ba bitmap lớn
 * cùng lúc đủ để trình duyệt kill tab.
 *
 * Hai luồng là điểm cân bằng: lấp được thời gian chờ round-trip mà không xé nhỏ băng thông.
 *
 * Module thuần, không đụng API trình duyệt — dò `navigator.connection` nằm ở
 * `resolveUploadConcurrency`, nhận sẵn dữ liệu từ phía gọi.
 */

export type UploadTaskStatus =
  "QUEUED" | "PREPARING" | "UPLOADING" | "COMPLETED" | "FAILED" | "CANCELLED";

export type UploadDocumentType = "CITIZEN_ID_FRONT" | "CITIZEN_ID_BACK" | "CERTIFICATE";

/** Ảnh CCCD tải một lượt một; ảnh GCN tối đa hai. */
export const CERTIFICATE_CONCURRENCY = 2;
export const IDENTITY_CONCURRENCY = 1;

export interface ConnectionHints {
  /** `navigator.connection.saveData` — người dùng đã bật chế độ tiết kiệm dữ liệu. */
  readonly saveData?: boolean;
  /** `navigator.connection.effectiveType`. */
  readonly effectiveType?: string;
}

/**
 * Số việc chạy song song cho ảnh GCN.
 *
 * Hạ về 1 khi người dùng bật tiết kiệm dữ liệu hoặc mạng 2G: ở đó hai luồng chỉ làm cả hai cùng
 * timeout. API `navigator.connection` không có trên Safari nên **không** được phụ thuộc vào nó —
 * thiếu thông tin thì dùng mặc định 2.
 */
export function resolveUploadConcurrency(hints: ConnectionHints | null | undefined): number {
  if (!hints) return CERTIFICATE_CONCURRENCY;
  if (hints.saveData === true) return 1;
  if (hints.effectiveType === "2g" || hints.effectiveType === "slow-2g") return 1;
  return CERTIFICATE_CONCURRENCY;
}

/** Đọc gợi ý mạng từ trình duyệt; trả `null` nếu trình duyệt không cung cấp. */
export function readConnectionHints(): ConnectionHints | null {
  const connection = (
    globalThis as unknown as {
      navigator?: { connection?: { saveData?: boolean; effectiveType?: string } };
    }
  ).navigator?.connection;
  if (!connection) return null;
  return { saveData: connection.saveData, effectiveType: connection.effectiveType };
}

export interface QueueOptions {
  readonly concurrency: number;
  /** Gọi mỗi khi một việc bắt đầu hoặc kết thúc — dùng để cập nhật "đang tải x/y". */
  readonly onActiveCountChange?: (active: number) => void;
}

/**
 * Chạy các việc với tối đa `concurrency` việc cùng lúc, **giữ nguyên thứ tự bắt đầu**.
 *
 * Một việc hỏng không hủy các việc còn lại: người dân chọn 3 ảnh mà ảnh thứ 2 lỗi thì hai ảnh kia
 * vẫn phải lên được, rồi UI chỉ rõ ảnh nào cần thử lại. Kết quả trả về đúng thứ tự đầu vào.
 */
export async function runWithConcurrency<T>(
  tasks: readonly (() => Promise<T>)[],
  options: QueueOptions,
): Promise<Array<{ status: "fulfilled"; value: T } | { status: "rejected"; reason: unknown }>> {
  const limit = Math.max(1, Math.floor(options.concurrency));
  const results = new Array<
    { status: "fulfilled"; value: T } | { status: "rejected"; reason: unknown }
  >(tasks.length);

  let nextIndex = 0;
  let active = 0;

  const setActive = (value: number): void => {
    active = value;
    options.onActiveCountChange?.(active);
  };

  async function worker(): Promise<void> {
    for (;;) {
      const index = nextIndex;
      if (index >= tasks.length) return;
      nextIndex += 1;

      setActive(active + 1);
      try {
        results[index] = { status: "fulfilled", value: await tasks[index]() };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      } finally {
        setActive(active - 1);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, () => worker()));
  return results;
}

export interface UploadTaskView {
  readonly id: string;
  readonly documentType: UploadDocumentType;
  readonly status: UploadTaskStatus;
  readonly sentBytes: number;
  readonly totalBytes: number;
  readonly errorMessage: string;
  /** Thứ tự người dân chọn ảnh, dùng cho nhãn "Trang GCN 2" — không dùng tên tệp. */
  readonly orderIndex: number;
}

/**
 * Nhãn hiển thị cho một việc tải.
 *
 * **Không bao giờ** dùng tên tệp gốc: tên do máy ảnh hoặc người dân đặt hay mang số CCCD, tên
 * người, ngày giờ, đôi khi cả toạ độ.
 */
export function uploadTaskLabel(documentType: UploadDocumentType, orderIndex: number): string {
  if (documentType === "CITIZEN_ID_FRONT") return "CCCD mặt trước";
  if (documentType === "CITIZEN_ID_BACK") return "CCCD mặt sau";
  return `Trang GCN ${orderIndex + 1}`;
}

export function uploadPercent(task: Pick<UploadTaskView, "sentBytes" | "totalBytes">): number {
  if (task.totalBytes <= 0) return 0;
  return Math.min(100, Math.round((task.sentBytes / task.totalBytes) * 100));
}

/** Còn việc chưa xong thì chưa được gửi hồ sơ. */
export function hasPendingUpload(tasks: readonly UploadTaskView[]): boolean {
  return tasks.some(
    (task) =>
      task.status === "QUEUED" || task.status === "PREPARING" || task.status === "UPLOADING",
  );
}

/** Việc lỗi phải được người dân xử lý (thử lại hoặc xóa) trước khi gửi. */
export function hasFailedUpload(tasks: readonly UploadTaskView[]): boolean {
  return tasks.some((task) => task.status === "FAILED");
}
