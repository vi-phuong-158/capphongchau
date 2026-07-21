import { describe, expect, it, vi } from "vitest";

import {
  parseReceivedBytes,
  uploadWithResume,
  UploadCancelledError,
  UploadFailedError,
} from "@/modules/public-intake/resumable-upload";

function blobOf(size: number): Blob {
  return new Blob([new Uint8Array(size)], { type: "image/jpeg" });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** 308 kèm header Range — Google dùng để báo "mới nhận được đến byte thứ N". */
function partialResponse(receivedBytes: number): Response {
  return new Response(null, {
    status: 308,
    headers: { Range: `bytes=0-${receivedBytes - 1}` },
  });
}

describe("parseReceivedBytes", () => {
  it("đổi header Range thành số byte đã nhận", () => {
    expect(parseReceivedBytes("bytes=0-262143")).toBe(262144);
    expect(parseReceivedBytes("bytes=0-0")).toBe(1);
  });

  it("coi như chưa nhận gì khi thiếu hoặc sai định dạng header", () => {
    expect(parseReceivedBytes(null)).toBe(0);
    expect(parseReceivedBytes("bytes=100-200")).toBe(0);
    expect(parseReceivedBytes("rác")).toBe(0);
  });
});

describe("uploadWithResume", () => {
  it("tải một lần thành công thì trả Drive file ID", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ id: "drive-1" }));

    await expect(
      uploadWithResume({
        uploadUrl: "https://upload.test/session",
        file: blobOf(1024),
        contentType: "image/jpeg",
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).resolves.toBe("drive-1");

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("gửi tiếp từ đúng chỗ dở khi Google mới nhận một phần", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(partialResponse(400))
      .mockResolvedValueOnce(jsonResponse({ id: "drive-2" }));

    const progress: number[] = [];
    await expect(
      uploadWithResume({
        uploadUrl: "https://upload.test/session",
        file: blobOf(1000),
        contentType: "image/jpeg",
        fetchImpl: fetchImpl as unknown as typeof fetch,
        onProgress: (sent) => progress.push(sent),
      }),
    ).resolves.toBe("drive-2");

    const secondCall = fetchImpl.mock.calls[1][1] as { headers: Record<string, string> };
    expect(secondCall.headers["Content-Range"]).toBe("bytes 400-999/1000");
    expect(progress).toEqual([400, 1000]);
  });

  it("mất kết nối giữa chừng thì hỏi lại tiến độ rồi gửi nốt phần thiếu", async () => {
    const fetchImpl = vi
      .fn()
      // Lần thử đầu: rớt mạng.
      .mockRejectedValueOnce(new TypeError("network error"))
      // Truy vấn tiến độ: Google đã nhận 600/1000 byte.
      .mockResolvedValueOnce(partialResponse(600))
      // Lần thử hai: gửi phần còn lại, thành công.
      .mockResolvedValueOnce(jsonResponse({ id: "drive-3" }));

    await expect(
      uploadWithResume({
        uploadUrl: "https://upload.test/session",
        file: blobOf(1000),
        contentType: "image/jpeg",
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).resolves.toBe("drive-3");

    const queryCall = fetchImpl.mock.calls[1][1] as { headers: Record<string, string> };
    expect(queryCall.headers["Content-Range"]).toBe("bytes */1000");

    const resumeCall = fetchImpl.mock.calls[2][1] as { headers: Record<string, string> };
    expect(resumeCall.headers["Content-Range"]).toBe("bytes 600-999/1000");
  });

  it("nhận ra tệp thực ra đã lên đủ dù lần thử bị lỗi", async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("network error"))
      .mockResolvedValueOnce(jsonResponse({ id: "drive-4" }));

    await expect(
      uploadWithResume({
        uploadUrl: "https://upload.test/session",
        file: blobOf(500),
        contentType: "image/jpeg",
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).resolves.toBe("drive-4");
  });

  it("bỏ cuộc sau số lần thử tối đa thay vì treo mãi", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError("network error"));

    await expect(
      uploadWithResume({
        uploadUrl: "https://upload.test/session",
        file: blobOf(100),
        contentType: "image/jpeg",
        fetchImpl: fetchImpl as unknown as typeof fetch,
        maxAttempts: 2,
      }),
    ).rejects.toBeInstanceOf(UploadFailedError);
  });

  it("người dân bấm hủy thì dừng ngay, không thử lại", async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn().mockImplementation(() => {
      controller.abort();
      return Promise.reject(new DOMException("Aborted", "AbortError"));
    });

    await expect(
      uploadWithResume({
        uploadUrl: "https://upload.test/session",
        file: blobOf(100),
        contentType: "image/jpeg",
        signal: controller.signal,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toBeInstanceOf(UploadCancelledError);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("timeout làm lần thử tự bỏ cuộc thay vì chờ vô hạn", async () => {
    // fetch không bao giờ resolve; chỉ có abort của timeout mới kết thúc được.
    const fetchImpl = vi.fn().mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        }),
    );

    await expect(
      uploadWithResume({
        uploadUrl: "https://upload.test/session",
        file: blobOf(100),
        contentType: "image/jpeg",
        fetchImpl: fetchImpl as unknown as typeof fetch,
        timeoutMs: 20,
        maxAttempts: 1,
      }),
    ).rejects.toBeInstanceOf(UploadFailedError);
  });
});
