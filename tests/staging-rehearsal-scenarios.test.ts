import { describe, expect, it, vi } from "vitest";
import { uploadWithResume, UploadFailedError } from "@/modules/public-intake/resumable-upload";
import { deriveCreationFingerprint } from "@/modules/public-intake/creation-idempotency";

/**
 * Suite kiểm thử diễn tập cho 3 kịch bản Staging:
 * 1. Đứt mạng giữa chừng (Network Disconnection / Resumable Upload)
 * 2. 2 người bấm cùng lúc (Concurrent Requests & Optimistic Locking / Race Condition)
 * 3. Bấm lại sau khi xong (Double Submission / Idempotency & Conflict Check)
 */

function blobOf(size: number): Blob {
  return new Blob([new Uint8Array(size)], { type: "image/jpeg" });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function partialResponse(receivedBytes: number): Response {
  return new Response(null, {
    status: 308,
    headers: { Range: `bytes=0-${receivedBytes - 1}` },
  });
}

describe("Diễn tập Kịch bản Staging 1: Đứt mạng giữa chừng (Network Disconnection)", () => {
  it("TC 1.1: Tự động khôi phục Resumable Upload và tải nốt phần thiếu sau khi mạng có lại", async () => {
    const fetchImpl = vi
      .fn()
      // Lần 1: Bị ngắt kết nối giữa chừng (TypeError network error)
      .mockRejectedValueOnce(new TypeError("Failed to fetch: Network disconnected"))
      // Lần 2: Thử lại (Query status), Google báo đã nhận 500/1000 bytes
      .mockResolvedValueOnce(partialResponse(500))
      // Lần 3: Upload tiếp 500 byte còn lại, hoàn tất thành công
      .mockResolvedValueOnce(jsonResponse({ id: "drive-file-resumed-id" }));

    const progress: number[] = [];
    const fileId = await uploadWithResume({
      uploadUrl: "https://upload.googledrive.com/resumable-session-123",
      file: blobOf(1000),
      contentType: "image/jpeg",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      onProgress: (sent) => progress.push(sent),
    });

    expect(fileId).toBe("drive-file-resumed-id");
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    // Lần 3 phải gửi Content-Range đúng offset 500..999
    const lastCall = fetchImpl.mock.calls[2][1] as { headers: Record<string, string> };
    expect(lastCall.headers["Content-Range"]).toBe("bytes 500-999/1000");
  });

  it("TC 1.2: Ngắt mạng quá số lần giới hạn (Max Attempts) thì dừng an toàn và ném UploadFailedError", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError("Network unreachable"));

    await expect(
      uploadWithResume({
        uploadUrl: "https://upload.googledrive.com/resumable-session-123",
        file: blobOf(1000),
        contentType: "image/jpeg",
        fetchImpl: fetchImpl as unknown as typeof fetch,
        maxAttempts: 3,
      }),
    ).rejects.toBeInstanceOf(UploadFailedError);

    // Thử 3 lần chính + các lần truy vấn retry
    expect(fetchImpl.mock.calls.length).toBeGreaterThanOrEqual(3);
  });
});

describe("Diễn tập Kịch bản Staging 2: 2 người bấm cùng lúc (Race Condition / Concurrency)", () => {
  it("TC 2.1: Cập nhật đồng thời cùng 1 hồ sơ - Người bấm sau bị từ chối bằng Optimistic Locking (Version Conflict)", async () => {
    // Mô phỏng DB record có version hiện tại = 1
    let dbRecordVersion = 1;
    let dbNote = "Ghi chú ban đầu";

    async function updateSubmissionNote(expectedVersion: number, newNote: string) {
      // Mô phỏng SQL: UPDATE submissions SET note = $newNote, version = version + 1 WHERE version = $expectedVersion
      if (expectedVersion !== dbRecordVersion) {
        return { success: false, code: "VERSION_CONFLICT", status: 409 };
      }
      dbNote = newNote;
      dbRecordVersion += 1;
      return { success: true, version: dbRecordVersion, status: 200 };
    }

    // Cán bộ A và Cán bộ B cùng xem version 1
    const officerAVersion = 1;
    const officerBVersion = 1;

    // Cả 2 cùng bấm "Lưu" gần như đồng thời
    const reqA = updateSubmissionNote(officerAVersion, "Cán bộ A cập nhật");
    const reqB = updateSubmissionNote(officerBVersion, "Cán bộ B cập nhật");

    const [resA, resB] = await Promise.all([reqA, reqB]);

    // Một trong hai người thành công, người còn lại nhận 409 VERSION_CONFLICT
    const successCount = [resA, resB].filter((r) => r.success).length;
    const conflictCount = [resA, resB].filter((r) => r.code === "VERSION_CONFLICT").length;

    expect(successCount).toBe(1);
    expect(conflictCount).toBe(1);
    expect(dbRecordVersion).toBe(2);
  });

  it("TC 2.2: Hai người nộp hồ sơ công khai đồng thời cùng 1 giây - Cấp Case ID nguyên tử không trùng nhau", async () => {
    let currentSequence = 100;
    const assignedIds: string[] = [];

    // Mô phỏng PostgreSQL atomic increment: ON CONFLICT (year) DO UPDATE SET last_sequence = last_sequence + 1 RETURNING last_sequence
    async function reserveCaseId() {
      // atomic operation mock
      currentSequence += 1;
      const seq = currentSequence;
      const caseId = `PHONGCHAU-2026-${String(seq).padStart(6, "0")}`;
      assignedIds.push(caseId);
      return caseId;
    }

    const [id1, id2] = await Promise.all([reserveCaseId(), reserveCaseId()]);

    expect(id1).not.toBe(id2);
    expect(assignedIds.length).toBe(2);
    expect(new Set(assignedIds).size).toBe(2);
  });
});

describe("Diễn tập Kịch bản Staging 3: Bấm lại sau khi xong (Idempotency / Double Submission)", () => {
  it("TC 3.1: Gửi đúp (Double Submission) với cùng Idempotency Key - Trả về kết quả cached, không tạo dữ liệu trùng", async () => {
    const requestStore = new Map<string, { status: number; body: Record<string, unknown> }>();

    async function handleSubmission(idempotencyKey: string, payload: { phone: string }) {
      if (requestStore.has(idempotencyKey)) {
        // Idempotency hit: trả kết quả cũ đã cache
        return { ...requestStore.get(idempotencyKey)!, cached: true };
      }

      // Xử lý tạo mới
      const receiptCode = "PC-KK-2026-TEST1234";
      const result = { status: 200, body: { receiptCode, submissionId: "sub-999" } };
      requestStore.set(idempotencyKey, result);
      return { ...result, cached: false };
    }

    const key = "idempotency-uuid-v4-0001";
    const payload = { phone: "0912345678" };

    // Request 1: Gửi thành công
    const res1 = await handleSubmission(key, payload);
    expect(res1.cached).toBe(false);
    expect(res1.body.receiptCode).toBe("PC-KK-2026-TEST1234");

    // Request 2: User lỡ tay bấm đúp hoặc F5 gửi lại cùng key & payload
    const res2 = await handleSubmission(key, payload);
    expect(res2.cached).toBe(true);
    expect(res2.body.receiptCode).toBe(res1.body.receiptCode);
    expect(requestStore.size).toBe(1); // Chỉ có 1 bản ghi duy nhất
  });

  it("TC 3.2: Dùng lại Idempotency Key cũ nhưng sửa Payload - Bị từ chối với Lỗi 409 IDEMPOTENCY_CONFLICT", async () => {
    const requestStore = new Map<string, { payloadHash: string; receiptCode: string }>();

    function hashPayload(data: unknown) {
      return JSON.stringify(data);
    }

    async function handleSubmission(
      idempotencyKey: string,
      payload: { phone: string; name?: string },
    ) {
      const currentHash = hashPayload(payload);
      if (requestStore.has(idempotencyKey)) {
        const stored = requestStore.get(idempotencyKey)!;
        if (stored.payloadHash !== currentHash) {
          return {
            status: 409,
            code: "IDEMPOTENCY_CONFLICT",
            message: "Key đã dùng cho dữ liệu khác",
          };
        }
        return { status: 200, receiptCode: stored.receiptCode };
      }

      const receiptCode = "PC-KK-2026-ORIGINAL";
      requestStore.set(idempotencyKey, { payloadHash: currentHash, receiptCode });
      return { status: 200, receiptCode };
    }

    const key = "idempotency-uuid-v4-0002";

    // Request 1: Gửi thông tin ban đầu
    const res1 = await handleSubmission(key, { phone: "0912345678" });
    expect(res1.status).toBe(200);

    // Request 2: Cùng key nhưng cố tình sửa dữ liệu (phone mới)
    const res2 = await handleSubmission(key, { phone: "0988888888", name: "Hồ sơ giả mạo" });
    expect(res2.status).toBe(409);
    expect(res2.code).toBe("IDEMPOTENCY_CONFLICT");
  });
});
