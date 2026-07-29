/**
 * Phase 4 §9.2 — hàng đợi tải ảnh có giới hạn đồng thời.
 *
 * Điều quan trọng nhất được khóa ở đây: **một ảnh hỏng không kéo theo ảnh nào khác**. Trước V2
 * vòng lặp tải ảnh GCN `break` ngay khi một ảnh lỗi, nên chọn 3 ảnh mà ảnh thứ 2 hỏng là mất luôn
 * ảnh thứ 3 dù nó chưa hề được thử.
 */
import { describe, expect, it, vi } from "vitest";

import {
  CERTIFICATE_CONCURRENCY,
  hasFailedUpload,
  hasPendingUpload,
  resolveUploadConcurrency,
  runWithConcurrency,
  uploadPercent,
  uploadTaskLabel,
  type UploadTaskStatus,
  type UploadTaskView,
} from "@/modules/public-intake/upload-queue";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function task(status: UploadTaskStatus, overrides: Partial<UploadTaskView> = {}): UploadTaskView {
  return {
    id: "t",
    documentType: "CERTIFICATE",
    status,
    sentBytes: 0,
    totalBytes: 100,
    errorMessage: "",
    orderIndex: 0,
    ...overrides,
  };
}

describe("resolveUploadConcurrency", () => {
  it("mặc định hai luồng", () => {
    expect(resolveUploadConcurrency({ effectiveType: "4g" })).toBe(CERTIFICATE_CONCURRENCY);
    expect(CERTIFICATE_CONCURRENCY).toBe(2);
  });

  it("hạ về 1 khi người dùng bật tiết kiệm dữ liệu", () => {
    expect(resolveUploadConcurrency({ saveData: true, effectiveType: "4g" })).toBe(1);
  });

  it("hạ về 1 trên mạng 2g và slow-2g", () => {
    expect(resolveUploadConcurrency({ effectiveType: "2g" })).toBe(1);
    expect(resolveUploadConcurrency({ effectiveType: "slow-2g" })).toBe(1);
  });

  it("trình duyệt không hỗ trợ navigator.connection thì dùng mặc định, không sập", () => {
    expect(resolveUploadConcurrency(null)).toBe(CERTIFICATE_CONCURRENCY);
    expect(resolveUploadConcurrency(undefined)).toBe(CERTIFICATE_CONCURRENCY);
    expect(resolveUploadConcurrency({})).toBe(CERTIFICATE_CONCURRENCY);
  });
});

describe("runWithConcurrency", () => {
  it("không bao giờ chạy quá số luồng cho phép", async () => {
    let active = 0;
    let peak = 0;
    const tasks = Array.from({ length: 6 }, () => async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return "ok";
    });

    await runWithConcurrency(tasks, { concurrency: 2 });
    expect(peak).toBe(2);
  });

  it("thực sự chạy song song, không tuần tự", async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    const started: number[] = [];

    const run = runWithConcurrency(
      [
        async () => {
          started.push(0);
          return first.promise;
        },
        async () => {
          started.push(1);
          return second.promise;
        },
      ],
      { concurrency: 2 },
    );

    await Promise.resolve();
    // Việc thứ hai đã bắt đầu dù việc thứ nhất chưa xong.
    expect(started).toEqual([0, 1]);

    first.resolve("a");
    second.resolve("b");
    await run;
  });

  it("một việc hỏng KHÔNG hủy các việc còn lại", async () => {
    const results = await runWithConcurrency(
      [
        async () => "ảnh 1",
        async () => {
          throw new Error("mạng lỗi");
        },
        async () => "ảnh 3",
      ],
      { concurrency: 2 },
    );

    expect(results.map((result) => result.status)).toEqual(["fulfilled", "rejected", "fulfilled"]);
    expect(results[2]).toEqual({ status: "fulfilled", value: "ảnh 3" });
  });

  it("kết quả giữ đúng thứ tự đầu vào dù xong không theo thứ tự", async () => {
    const delays = [30, 5, 15];
    const results = await runWithConcurrency(
      delays.map((delay, index) => async () => {
        await new Promise((resolve) => setTimeout(resolve, delay));
        return index;
      }),
      { concurrency: 3 },
    );
    expect(results.map((result) => (result.status === "fulfilled" ? result.value : null))).toEqual([
      0, 1, 2,
    ]);
  });

  it("báo số việc đang chạy để UI hiện “đang hoàn tất N ảnh”", async () => {
    const seen: number[] = [];
    await runWithConcurrency(
      Array.from({ length: 3 }, () => async () => "ok"),
      { concurrency: 2, onActiveCountChange: (active) => seen.push(active) },
    );
    expect(Math.max(...seen)).toBeLessThanOrEqual(2);
    expect(seen[seen.length - 1]).toBe(0);
  });

  it("danh sách rỗng trả về rỗng, không treo", async () => {
    await expect(runWithConcurrency([], { concurrency: 2 })).resolves.toEqual([]);
  });

  it("concurrency 0 hoặc âm vẫn chạy được (ép tối thiểu 1)", async () => {
    const results = await runWithConcurrency([async () => "x"], { concurrency: 0 });
    expect(results).toEqual([{ status: "fulfilled", value: "x" }]);
  });
});

describe("Nhãn hiển thị — không bao giờ dùng tên tệp gốc", () => {
  it("CCCD hai mặt và trang GCN đánh số theo thứ tự chọn", () => {
    expect(uploadTaskLabel("CITIZEN_ID_FRONT", 0)).toBe("CCCD mặt trước");
    expect(uploadTaskLabel("CITIZEN_ID_BACK", 0)).toBe("CCCD mặt sau");
    expect(uploadTaskLabel("CERTIFICATE", 0)).toBe("Trang GCN 1");
    expect(uploadTaskLabel("CERTIFICATE", 2)).toBe("Trang GCN 3");
  });
});

describe("uploadPercent", () => {
  it("tính đúng và chặn trên ở 100", () => {
    expect(uploadPercent({ sentBytes: 0, totalBytes: 1000 })).toBe(0);
    expect(uploadPercent({ sentBytes: 500, totalBytes: 1000 })).toBe(50);
    expect(uploadPercent({ sentBytes: 2000, totalBytes: 1000 })).toBe(100);
  });

  it("tổng bằng 0 không chia cho 0", () => {
    expect(uploadPercent({ sentBytes: 0, totalBytes: 0 })).toBe(0);
  });
});

describe("Điều kiện chặn gửi hồ sơ", () => {
  it("còn việc đang chạy thì chưa gửi được", () => {
    for (const status of ["QUEUED", "PREPARING", "UPLOADING"] as const) {
      expect(hasPendingUpload([task(status)])).toBe(true);
    }
  });

  it("mọi việc đã xong thì không chặn", () => {
    expect(hasPendingUpload([task("COMPLETED"), task("CANCELLED")])).toBe(false);
  });

  it("việc lỗi phải được xử lý trước khi gửi", () => {
    expect(hasFailedUpload([task("FAILED")])).toBe(true);
    expect(hasFailedUpload([task("COMPLETED")])).toBe(false);
  });

  it("việc đã hủy không tính là lỗi — người dân chủ động bỏ", () => {
    expect(hasFailedUpload([task("CANCELLED")])).toBe(false);
    expect(hasPendingUpload([task("CANCELLED")])).toBe(false);
  });

  it("danh sách rỗng không chặn gì", () => {
    expect(hasPendingUpload([])).toBe(false);
    expect(hasFailedUpload([])).toBe(false);
  });
});

describe("Kịch bản §9.6 — một ảnh GCN xong, một ảnh lỗi", () => {
  it("ảnh xong vẫn được nhận; chỉ ảnh lỗi chặn việc gửi", async () => {
    const results = await runWithConcurrency(
      [
        async () => ({ fileId: "drive-1" }),
        async () => {
          throw new Error("timeout");
        },
      ],
      { concurrency: 2 },
    );

    const accepted = results.flatMap((result) =>
      result.status === "fulfilled" ? [result.value] : [],
    );
    expect(accepted).toEqual([{ fileId: "drive-1" }]);

    // Người dân bỏ ảnh lỗi khỏi danh sách rồi mới gửi được.
    const tasks = [task("COMPLETED", { id: "a" }), task("FAILED", { id: "b" })];
    expect(hasFailedUpload(tasks)).toBe(true);
    expect(hasFailedUpload(tasks.filter((item) => item.id !== "b"))).toBe(false);
  });
});

describe("readConnectionHints không phụ thuộc trình duyệt cụ thể", () => {
  it("trả null khi navigator.connection không tồn tại (Safari)", async () => {
    vi.stubGlobal("navigator", {});
    const { readConnectionHints } = await import("@/modules/public-intake/upload-queue");
    expect(readConnectionHints()).toBeNull();
    vi.unstubAllGlobals();
  });
});
