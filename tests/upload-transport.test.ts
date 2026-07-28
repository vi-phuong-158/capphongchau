/**
 * Phase 4 §9.1 — lớp truyền tải và tiến độ thật.
 *
 * `fetch` không có sự kiện tiến độ tải lên, nên thanh phần trăm cũ chỉ nhảy khi một lượt kết thúc.
 * Ở đây kiểm hai điều: transport giả bơm được tiến độ liên tục vào `uploadWithResume`, và **tiến
 * độ không bao giờ tụt** — sau khi đứt mạng, Google có thể báo đã nhận ít hơn số byte XHR vừa
 * đếm, và một thanh phần trăm tụt lại bị người dân đọc là "hỏng, phải làm lại".
 */
import { describe, expect, it, vi } from "vitest";

import { uploadWithResume, UploadFailedError } from "@/modules/public-intake/resumable-upload";
import {
  createFetchTransport,
  UploadTransportError,
  type ResumablePutInput,
  type ResumablePutResult,
  type ResumablePutTransport,
} from "@/modules/public-intake/upload-transport";

function blobOf(size: number): Blob {
  return new Blob([new Uint8Array(size)], { type: "image/jpeg" });
}

function okResult(id: string): ResumablePutResult {
  return { status: 200, ok: true, rangeHeader: null, bodyText: JSON.stringify({ id }) };
}

function partialResult(receivedBytes: number): ResumablePutResult {
  return {
    status: 308,
    ok: false,
    rangeHeader: `bytes=0-${receivedBytes - 1}`,
    bodyText: "",
  };
}

describe("Transport giả — tiến độ liên tục", () => {
  it("bơm được nhiều mốc tiến độ trong một lượt tải", async () => {
    const progress: number[] = [];
    const transport: ResumablePutTransport = {
      async put(input: ResumablePutInput) {
        for (const fraction of [0.25, 0.5, 0.75]) {
          input.onProgress?.(Math.round(input.body.size * fraction), input.body.size);
        }
        return okResult("drive-1");
      },
    };

    await uploadWithResume({
      uploadUrl: "https://upload.test/session",
      file: blobOf(1000),
      contentType: "image/jpeg",
      transport,
      onProgress: (sent) => progress.push(sent),
    });

    expect(progress).toEqual([250, 500, 750, 1000]);
  });

  it("tiến độ tính trên toàn tệp, không phải trên phần đang gửi", async () => {
    const progress: number[] = [];
    let call = 0;
    const transport: ResumablePutTransport = {
      async put(input: ResumablePutInput) {
        call += 1;
        if (call === 1) {
          input.onProgress?.(400, input.body.size);
          return partialResult(400);
        }
        // Lượt hai chỉ gửi 600 byte còn lại; tiến độ phải hiện 400+300=700, không phải 300.
        input.onProgress?.(300, input.body.size);
        return okResult("drive-1");
      },
    };

    await uploadWithResume({
      uploadUrl: "https://upload.test/session",
      file: blobOf(1000),
      contentType: "image/jpeg",
      transport,
      onProgress: (sent) => progress.push(sent),
    });

    expect(progress).toContain(700);
    expect(progress[progress.length - 1]).toBe(1000);
  });

  it("tiến độ không bao giờ tụt sau khi resume", async () => {
    const progress: number[] = [];
    let call = 0;
    const transport: ResumablePutTransport = {
      async put(input: ResumablePutInput) {
        call += 1;
        if (call === 1) {
          // XHR đếm được 800 byte đã rời thiết bị…
          input.onProgress?.(800, input.body.size);
          // …nhưng Google chỉ nhận được 300.
          return partialResult(300);
        }
        return okResult("drive-1");
      },
    };

    await uploadWithResume({
      uploadUrl: "https://upload.test/session",
      file: blobOf(1000),
      contentType: "image/jpeg",
      transport,
      onProgress: (sent) => progress.push(sent),
    });

    for (let index = 1; index < progress.length; index += 1) {
      expect(progress[index]).toBeGreaterThanOrEqual(progress[index - 1]);
    }
    expect(progress).not.toContain(300);
  });

  it("không vượt quá tổng dung lượng tệp", async () => {
    const progress: number[] = [];
    const transport: ResumablePutTransport = {
      async put(input: ResumablePutInput) {
        input.onProgress?.(99999, input.body.size);
        return okResult("drive-1");
      },
    };
    await uploadWithResume({
      uploadUrl: "https://upload.test/session",
      file: blobOf(1000),
      contentType: "image/jpeg",
      transport,
      onProgress: (sent) => progress.push(sent),
    });
    expect(Math.max(...progress)).toBe(1000);
  });
});

describe("Hợp đồng resumable qua transport", () => {
  it("lượt đầu gửi Content-Type và dải byte đầy đủ", async () => {
    const inputs: ResumablePutInput[] = [];
    const transport: ResumablePutTransport = {
      async put(input) {
        inputs.push(input);
        return okResult("drive-1");
      },
    };

    await uploadWithResume({
      uploadUrl: "https://upload.test/session",
      file: blobOf(1024),
      contentType: "image/jpeg",
      transport,
    });

    expect(inputs[0].contentType).toBe("image/jpeg");
    expect(inputs[0].contentRange).toBe("bytes 0-1023/1024");
  });

  it("lượt gửi tiếp không lặp lại Content-Type và bắt đầu từ đúng offset", async () => {
    const inputs: ResumablePutInput[] = [];
    let call = 0;
    const transport: ResumablePutTransport = {
      async put(input) {
        inputs.push(input);
        call += 1;
        return call === 1 ? partialResult(400) : okResult("drive-1");
      },
    };

    await uploadWithResume({
      uploadUrl: "https://upload.test/session",
      file: blobOf(1000),
      contentType: "image/jpeg",
      transport,
    });

    expect(inputs[1].contentRange).toBe("bytes 400-999/1000");
    expect(inputs[1].contentType).toBeUndefined();
    expect(inputs[1].body.size).toBe(600);
  });

  it("lỗi transport được coi là lỗi mạng và vẫn thử lại", async () => {
    let call = 0;
    const transport: ResumablePutTransport = {
      async put() {
        call += 1;
        if (call === 1) throw new UploadTransportError("Mất kết nối khi đang tải tệp lên.");
        return okResult("drive-1");
      },
    };

    await expect(
      uploadWithResume({
        uploadUrl: "https://upload.test/session",
        file: blobOf(1000),
        contentType: "image/jpeg",
        transport,
        fetchImpl: vi
          .fn()
          .mockResolvedValue(
            new Response(null, { status: 308, headers: { Range: "bytes=0-99" } }),
          ) as unknown as typeof fetch,
      }),
    ).resolves.toBe("drive-1");
    expect(call).toBe(2);
  });

  it("hết số lần thử thì báo lỗi rõ ràng", async () => {
    const transport: ResumablePutTransport = {
      async put() {
        throw new UploadTransportError("Quá thời gian chờ khi đang tải tệp lên.");
      },
    };

    await expect(
      uploadWithResume({
        uploadUrl: "https://upload.test/session",
        file: blobOf(1000),
        contentType: "image/jpeg",
        transport,
        maxAttempts: 2,
        fetchImpl: vi.fn().mockRejectedValue(new Error("offline")) as unknown as typeof fetch,
      }),
    ).rejects.toBeInstanceOf(UploadFailedError);
  });
});

describe("createFetchTransport", () => {
  it("KHÔNG báo tiến độ — fetch không biết Google đã nhận bao nhiêu", async () => {
    const onProgress = vi.fn();
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 308, headers: { Range: "bytes=0-399" } }));

    const result = await createFetchTransport(fetchImpl as unknown as typeof fetch).put({
      url: "https://upload.test/session",
      body: blobOf(1000),
      contentType: "image/jpeg",
      contentRange: "bytes 0-999/1000",
      timeoutMs: 1000,
      onProgress,
    });

    expect(onProgress).not.toHaveBeenCalled();
    expect(result.status).toBe(308);
    expect(result.rangeHeader).toBe("bytes=0-399");
  });

  it("chuyển đúng header Content-Range và Content-Type", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    await createFetchTransport(fetchImpl as unknown as typeof fetch).put({
      url: "https://upload.test/session",
      body: blobOf(10),
      contentType: "image/png",
      contentRange: "bytes 0-9/10",
      timeoutMs: 1000,
    });
    const init = fetchImpl.mock.calls[0][1] as { headers: Record<string, string> };
    expect(init.headers).toEqual({
      "Content-Range": "bytes 0-9/10",
      "Content-Type": "image/png",
    });
  });

  it("bỏ Content-Type khi phía gọi không truyền (lượt gửi tiếp)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    await createFetchTransport(fetchImpl as unknown as typeof fetch).put({
      url: "https://upload.test/session",
      body: blobOf(10),
      contentRange: "bytes 5-9/10",
      timeoutMs: 1000,
    });
    const init = fetchImpl.mock.calls[0][1] as { headers: Record<string, string> };
    expect(init.headers).toEqual({ "Content-Range": "bytes 5-9/10" });
  });
});
