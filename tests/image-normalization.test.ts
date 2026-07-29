/**
 * Phase 3 — chuẩn hóa ảnh trước khi tải lên.
 *
 * Test chạy trong Node nên không có `canvas`/`createImageBitmap` thật. Ta giả lập hai API đó để
 * kiểm **logic quyết định** — cái quyết định ảnh nào bị đụng vào và đụng thế nào. Chất lượng ảnh
 * thật (chữ còn đọc được, không mất góc, QR còn quét được) không thể kiểm bằng unit test; đó là
 * việc của bộ kiểm thủ công ghi trong `evidence/PUBLIC_INTAKE_V2_UPLOAD_BENCHMARK.md`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  NORMALIZATION_PROFILES,
  NORMALIZATION_VERSION,
  normalizeIntakeImage,
  safeUploadFileName,
  targetDimensions,
} from "@/modules/public-intake/image-normalization.client";

describe("targetDimensions", () => {
  it("không phóng to ảnh nhỏ hơn giới hạn", () => {
    expect(targetDimensions(800, 600, 3000)).toEqual({ width: 800, height: 600 });
  });

  it("ảnh đúng bằng giới hạn giữ nguyên", () => {
    expect(targetDimensions(3000, 2000, 3000)).toEqual({ width: 3000, height: 2000 });
  });

  it("thu nhỏ theo cạnh dài, giữ tỷ lệ (ảnh ngang)", () => {
    expect(targetDimensions(4000, 3000, 2000)).toEqual({ width: 2000, height: 1500 });
  });

  it("thu nhỏ theo cạnh dài, giữ tỷ lệ (ảnh dọc)", () => {
    expect(targetDimensions(3000, 4000, 2000)).toEqual({ width: 1500, height: 2000 });
  });

  it("tỷ lệ được giữ trong sai số làm tròn 1 px", () => {
    const source = { width: 4032, height: 3024 };
    const target = targetDimensions(source.width, source.height, 3000);
    const sourceRatio = source.width / source.height;
    const targetRatio = target.width / target.height;
    expect(Math.abs(sourceRatio - targetRatio)).toBeLessThan(0.01);
  });

  it("không bao giờ trả kích thước 0", () => {
    const target = targetDimensions(10000, 3, 100);
    expect(target.width).toBeGreaterThan(0);
    expect(target.height).toBeGreaterThan(0);
  });
});

describe("safeUploadFileName — không mang tên tệp gốc", () => {
  it("CCCD và GCN có tiền tố trung tính", () => {
    expect(safeUploadFileName("CITIZEN_ID", "image/jpeg")).toBe("cccd.jpg");
    expect(safeUploadFileName("CERTIFICATE", "image/jpeg")).toBe("gcn.jpg");
  });

  it("không chứa gì lấy từ tên tệp người dùng", () => {
    const name = safeUploadFileName("CITIZEN_ID", "image/jpeg");
    expect(name).not.toMatch(/\d{6,}/);
    expect(name.split(".")[0]).toBe("cccd");
  });
});

describe("Thông số chuẩn hóa", () => {
  it("GCN giữ cạnh dài lớn hơn CCCD — tờ A3 chữ nhỏ hơn thẻ", () => {
    expect(NORMALIZATION_PROFILES.CERTIFICATE.maxEdge).toBeGreaterThan(
      NORMALIZATION_PROFILES.CITIZEN_ID.maxEdge,
    );
  });

  it("chất lượng JPEG đủ cao để không thấy artefact trên chữ", () => {
    for (const profile of Object.values(NORMALIZATION_PROFILES)) {
      expect(profile.jpegQuality).toBeGreaterThanOrEqual(0.85);
      expect(profile.jpegQuality).toBeLessThan(1);
    }
  });

  it("phiên bản chuẩn hóa được ghi lại để so sánh metric trước/sau", () => {
    expect(NORMALIZATION_VERSION).toBe("intake-v2-1");
  });
});

/* ── Giả lập tối thiểu các API trình duyệt mà module dùng ─────────────────── */

interface FakeCanvas {
  width: number;
  height: number;
  getContext: () => { drawImage: () => void } | null;
  toBlob: (callback: (blob: Blob | null) => void, type: string, quality: number) => void;
}

/** Kích thước blob đầu ra do test quyết định, để dựng các ca "to hơn nguồn". */
let encodedBlobBytes = 0;
let lastCanvas: FakeCanvas | null = null;

function installBrowserStubs(bitmapSize: { width: number; height: number } | null): void {
  vi.stubGlobal(
    "createImageBitmap",
    bitmapSize
      ? vi.fn(async () => ({ ...bitmapSize, close: vi.fn() }))
      : vi.fn(async () => {
          throw new Error("decode failed");
        }),
  );
  vi.stubGlobal("document", {
    createElement: () => {
      const canvas: FakeCanvas = {
        width: 0,
        height: 0,
        getContext: () => ({ drawImage: () => undefined }),
        toBlob: (callback) => {
          callback(new Blob([new Uint8Array(encodedBlobBytes)], { type: "image/jpeg" }));
        },
      };
      lastCanvas = canvas;
      return canvas;
    },
  });
}

function fileOf(bytes: number, name = "IMG_20260728_CCCD_012345678901.jpg"): File {
  return new File([new Uint8Array(bytes)], name, { type: "image/jpeg" });
}

const MiB = 1024 * 1024;

describe("normalizeIntakeImage — cờ tắt", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_INTAKE_IMAGE_NORMALIZATION_ENABLED", "false");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("trả nguyên tệp nguồn, không đụng tới trình duyệt", () => {
    vi.stubGlobal("createImageBitmap", undefined);
    vi.stubGlobal("document", undefined);
    const file = fileOf(12 * MiB);
    return normalizeIntakeImage(file, "CERTIFICATE").then((result) => {
      expect(result.file).toBe(file);
      expect(result.changed).toBe(false);
      expect(result.reason).toBe("DISABLED");
    });
  });
});

describe("normalizeIntakeImage — cờ bật", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_INTAKE_IMAGE_NORMALIZATION_ENABLED", "true");
    encodedBlobBytes = 0;
    lastCanvas = null;
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("ảnh nhỏ và trong giới hạn cạnh: giữ nguyên, không mã hóa lại", async () => {
    installBrowserStubs({ width: 1600, height: 1200 });
    const file = fileOf(1 * MiB);
    const result = await normalizeIntakeImage(file, "CERTIFICATE");
    expect(result.file).toBe(file);
    expect(result.changed).toBe(false);
    expect(result.reason).toBe("UNCHANGED");
  });

  it("ảnh lớn vượt cạnh: thu nhỏ và mã hóa lại", async () => {
    installBrowserStubs({ width: 4032, height: 3024 });
    encodedBlobBytes = 2 * MiB;
    const result = await normalizeIntakeImage(fileOf(12 * MiB), "CERTIFICATE");
    expect(result.changed).toBe(true);
    expect(result.reason).toBe("RESIZED_AND_REENCODED");
    expect(result.upload.width).toBe(3000);
    expect(result.upload.height).toBe(2250);
    expect(result.upload.sizeBytes).toBeLessThan(result.source.sizeBytes);
  });

  it("trong giới hạn cạnh nhưng nặng: mã hóa lại, giữ nguyên kích thước", async () => {
    installBrowserStubs({ width: 2000, height: 1500 });
    encodedBlobBytes = 1 * MiB;
    const result = await normalizeIntakeImage(fileOf(9 * MiB), "CERTIFICATE");
    expect(result.reason).toBe("REENCODED");
    expect(result.upload.width).toBe(2000);
    expect(result.upload.height).toBe(1500);
  });

  it("kết quả to hơn nguồn thì dùng nguồn", async () => {
    installBrowserStubs({ width: 4032, height: 3024 });
    encodedBlobBytes = 20 * MiB;
    const file = fileOf(12 * MiB);
    const result = await normalizeIntakeImage(file, "CERTIFICATE");
    expect(result.file).toBe(file);
    expect(result.changed).toBe(false);
    expect(result.reason).toBe("SOURCE_SMALLER");
  });

  it("CCCD dùng ngưỡng cạnh riêng 2400 px", async () => {
    installBrowserStubs({ width: 4000, height: 3000 });
    encodedBlobBytes = 1 * MiB;
    const result = await normalizeIntakeImage(fileOf(8 * MiB), "CITIZEN_ID");
    expect(result.upload.width).toBe(2400);
    expect(result.upload.height).toBe(1800);
  });

  it("tên tệp tải lên không mang tên gốc chứa số CCCD", async () => {
    installBrowserStubs({ width: 4032, height: 3024 });
    encodedBlobBytes = 2 * MiB;
    const result = await normalizeIntakeImage(
      fileOf(12 * MiB, "CCCD_012345678901_NguyenVanA.jpg"),
      "CITIZEN_ID",
    );
    expect(result.file.name).toBe("cccd.jpg");
    expect(result.file.name).not.toContain("012345678901");
  });

  it("giải mã thất bại thì trả tệp nguồn, không chặn người dân tải ảnh", async () => {
    installBrowserStubs(null);
    const file = fileOf(12 * MiB);
    const result = await normalizeIntakeImage(file, "CERTIFICATE");
    expect(result.file).toBe(file);
    expect(result.reason).toBe("UNCHANGED");
  });

  it("ảnh có kích thước 0 (canvas lỗi trên iOS) thì trả tệp nguồn", async () => {
    installBrowserStubs({ width: 0, height: 0 });
    const file = fileOf(12 * MiB);
    const result = await normalizeIntakeImage(file, "CERTIFICATE");
    expect(result.file).toBe(file);
    expect(result.reason).toBe("UNCHANGED");
  });

  it("dọn canvas sau khi dùng — không giữ bitmap lớn trong bộ nhớ", async () => {
    installBrowserStubs({ width: 4032, height: 3024 });
    encodedBlobBytes = 2 * MiB;
    await normalizeIntakeImage(fileOf(12 * MiB), "CERTIFICATE");
    expect(lastCanvas?.width).toBe(0);
    expect(lastCanvas?.height).toBe(0);
  });

  it("gọi createImageBitmap với imageOrientation from-image để giữ đúng hướng ảnh dọc", async () => {
    installBrowserStubs({ width: 3024, height: 4032 });
    encodedBlobBytes = 2 * MiB;
    await normalizeIntakeImage(fileOf(12 * MiB), "CERTIFICATE");
    const createImageBitmapMock = globalThis.createImageBitmap as unknown as {
      mock: { calls: unknown[][] };
    };
    expect(createImageBitmapMock.mock.calls[0][1]).toEqual({ imageOrientation: "from-image" });
  });

  it("ảnh dọc giữ đúng chiều dọc sau khi thu nhỏ", async () => {
    installBrowserStubs({ width: 3024, height: 4032 });
    encodedBlobBytes = 2 * MiB;
    const result = await normalizeIntakeImage(fileOf(12 * MiB), "CERTIFICATE");
    expect(result.upload.height).toBeGreaterThan(result.upload.width);
    expect(result.upload.height).toBe(3000);
  });
});
