import { describe, expect, it } from "vitest";

import {
  canonicalImageMimeType,
  CANONICAL_IMAGE_MIME_TYPES,
  IMAGE_FILE_ACCEPT,
  isCanonicalImageMimeType,
} from "@/modules/public-intake/image-format";

describe("canonicalImageMimeType", () => {
  it("giữ nguyên các loại đã chuẩn", () => {
    for (const mimeType of CANONICAL_IMAGE_MIME_TYPES) {
      expect(canonicalImageMimeType(mimeType, "anh.jpg")).toBe(mimeType);
    }
  });

  it("quy bí danh image/jpg và image/pjpeg về image/jpeg", () => {
    expect(canonicalImageMimeType("image/jpg", "anh.jpg")).toBe("image/jpeg");
    expect(canonicalImageMimeType("image/pjpeg", "anh.jpg")).toBe("image/jpeg");
  });

  /**
   * Đúng ca lỗi người dân báo: ảnh nhận qua Zalo, tên tệp dạng `z<số>_<hash>.jpg`, trình duyệt
   * không khai được loại. Trước bản sửa, request bị từ chối ở bước tạo phiên tải lên.
   */
  it("suy từ phần mở rộng khi trình duyệt khai loại rỗng", () => {
    expect(canonicalImageMimeType("", "z8070298699198_b736ca25543c2e1e8d31942dab4553cf.jpg")).toBe(
      "image/jpeg",
    );
    expect(canonicalImageMimeType(null, "anh.png")).toBe("image/png");
    expect(canonicalImageMimeType(undefined, "anh.heic")).toBe("image/heic");
  });

  it("không phân biệt hoa thường ở phần mở rộng và ở loại", () => {
    expect(canonicalImageMimeType("", "ANH.JPG")).toBe("image/jpeg");
    expect(canonicalImageMimeType("IMAGE/JPEG", "anh.jpg")).toBe("image/jpeg");
  });

  it("chấp nhận .jfif — dạng Chrome trên Windows hay lưu ảnh JPEG", () => {
    expect(canonicalImageMimeType("", "anh.jfif")).toBe("image/jpeg");
  });

  it("bỏ tham số phía sau dấu chấm phẩy", () => {
    expect(canonicalImageMimeType("image/jpeg; charset=binary", "anh.jpg")).toBe("image/jpeg");
  });

  it("trả null khi không nhận ra cả loại lẫn phần mở rộng", () => {
    expect(canonicalImageMimeType("application/pdf", "hoso.pdf")).toBeNull();
    expect(canonicalImageMimeType("", "khong-co-duoi")).toBeNull();
    expect(canonicalImageMimeType("", "")).toBeNull();
  });

  /**
   * Đổi đuôi tệp không đủ để qua mặt: giá trị trả về ở đây chỉ là lời khai gửi kèm khi tạo phiên.
   * Chốt chặn thật là `verifyUploadedFile`, đọc loại do Drive tự nhận dạng từ nội dung sau khi tải.
   */
  it("suy theo phần mở rộng khi loại khai không dùng được, kể cả nội dung thật khác", () => {
    expect(canonicalImageMimeType("application/octet-stream", "thuc-te-la-pdf.jpg")).toBe(
      "image/jpeg",
    );
  });
});

describe("isCanonicalImageMimeType", () => {
  it("chỉ nhận đúng năm loại chuẩn", () => {
    expect(isCanonicalImageMimeType("image/jpeg")).toBe(true);
    expect(isCanonicalImageMimeType("image/jpg")).toBe(false);
    expect(isCanonicalImageMimeType("application/octet-stream")).toBe(false);
    expect(isCanonicalImageMimeType("")).toBe(false);
  });
});

describe("IMAGE_FILE_ACCEPT", () => {
  /** Thiếu phần mở rộng thì nhiều trình quản lý tệp Android làm mờ chính ảnh người dân cần chọn. */
  it("có cả phần mở rộng lẫn MIME", () => {
    expect(IMAGE_FILE_ACCEPT).toContain("image/jpeg");
    expect(IMAGE_FILE_ACCEPT).toContain(".jpg");
    expect(IMAGE_FILE_ACCEPT).toContain(".heic");
  });
});
