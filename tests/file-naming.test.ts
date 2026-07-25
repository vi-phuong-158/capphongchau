import { describe, expect, it } from "vitest";

import {
  buildOriginalFileNames,
  extensionFromMimeType,
  sanitizeForFileName,
  tagForDocumentType,
} from "@/modules/public-intake/file-naming";

describe("tagForDocumentType", () => {
  it("CERTIFICATE là GCN, CCCD hai mặt đều là GT", () => {
    expect(tagForDocumentType("CERTIFICATE")).toBe("GCN");
    expect(tagForDocumentType("CITIZEN_ID_FRONT")).toBe("GT");
    expect(tagForDocumentType("CITIZEN_ID_BACK")).toBe("GT");
  });
});

describe("extensionFromMimeType", () => {
  it("ánh xạ đúng mimeType chuẩn hóa", () => {
    expect(extensionFromMimeType("image/jpeg")).toBe("jpg");
    expect(extensionFromMimeType("image/png")).toBe("png");
    expect(extensionFromMimeType("image/heic")).toBe("heic");
    expect(extensionFromMimeType("image/heif")).toBe("heif");
    expect(extensionFromMimeType("image/webp")).toBe("webp");
  });
  it("mimeType lạ trả về bin thay vì ném lỗi", () => {
    expect(extensionFromMimeType("application/octet-stream")).toBe("bin");
  });
});

describe("sanitizeForFileName", () => {
  it("giữ khoảng trắng của số phát hành thật", () => {
    expect(sanitizeForFileName("0 319059")).toBe("0 319059");
  });
  it("bỏ dấu / \\ và ký tự điều khiển, gộp khoảng trắng thừa", () => {
    expect(sanitizeForFileName("AD/266\\864\n\t")).toBe("AD 266 864");
    expect(sanitizeForFileName("  AD   266864  ")).toBe("AD 266864");
  });
});

describe("buildOriginalFileNames", () => {
  it("một file mỗi nhóm — không có STT", () => {
    const names = buildOriginalFileNames("AD 266864", [
      { documentType: "CERTIFICATE", mimeType: "image/jpeg" },
      { documentType: "CITIZEN_ID_FRONT", mimeType: "image/png" },
    ]);
    expect(names).toEqual(["AD 266864-GCN.jpg", "AD 266864-GT.png"]);
  });

  it("nhiều file cùng nhóm — đánh STT theo đúng thứ tự truyền vào", () => {
    const names = buildOriginalFileNames("AD 266864", [
      { documentType: "CERTIFICATE", mimeType: "image/jpeg" },
      { documentType: "CERTIFICATE", mimeType: "image/jpeg" },
      { documentType: "CITIZEN_ID_FRONT", mimeType: "image/jpeg" },
      { documentType: "CITIZEN_ID_BACK", mimeType: "image/jpeg" },
    ]);
    expect(names).toEqual([
      "AD 266864-GCN-01.jpg",
      "AD 266864-GCN-02.jpg",
      "AD 266864-GT-01.jpg",
      "AD 266864-GT-02.jpg",
    ]);
  });

  it("CCCD nhiều người: mặt trước/sau của cả hai người vẫn gộp chung nhóm GT, đếm liên tục", () => {
    const names = buildOriginalFileNames("AD 266864", [
      { documentType: "CITIZEN_ID_FRONT", mimeType: "image/jpeg" }, // chồng - mặt trước
      { documentType: "CITIZEN_ID_BACK", mimeType: "image/jpeg" }, // chồng - mặt sau
      { documentType: "CITIZEN_ID_FRONT", mimeType: "image/jpeg" }, // vợ - mặt trước
      { documentType: "CITIZEN_ID_BACK", mimeType: "image/jpeg" }, // vợ - mặt sau
    ]);
    expect(names).toEqual([
      "AD 266864-GT-01.jpg",
      "AD 266864-GT-02.jpg",
      "AD 266864-GT-03.jpg",
      "AD 266864-GT-04.jpg",
    ]);
  });

  it("số phát hành rỗng — trả mảng rỗng cùng độ dài, không tự đoán tên", () => {
    const names = buildOriginalFileNames("  ", [
      { documentType: "CERTIFICATE", mimeType: "image/jpeg" },
      { documentType: "CITIZEN_ID_FRONT", mimeType: "image/jpeg" },
    ]);
    expect(names).toEqual(["", ""]);
  });

  it("danh sách file rỗng — trả mảng rỗng", () => {
    expect(buildOriginalFileNames("AD 266864", [])).toEqual([]);
  });
});
