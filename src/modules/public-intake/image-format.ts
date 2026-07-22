/**
 * Chuẩn hóa loại ảnh trước khi tải lên.
 *
 * Vì sao cần module này: `File.type` do trình duyệt suy ra từ đăng ký hệ điều hành, không phải từ
 * nội dung tệp. Ảnh nhận qua Zalo, Messenger hoặc tải từ trình duyệt về rất hay rơi vào hai trường
 * hợp máy chủ từ chối oan:
 *
 * - `File.type` rỗng — hệ điều hành không có đăng ký cho phần mở rộng đó.
 * - `File.type` là `image/jpg` hoặc `image/pjpeg` — bí danh không chuẩn của `image/jpeg`.
 *
 * Cả hai trường hợp tệp vẫn là JPEG hợp lệ. Ở đây quy về đúng một tên chuẩn, ưu tiên tin loại do
 * trình duyệt khai; khai rỗng hoặc lạ thì suy từ phần mở rộng.
 *
 * Việc này **không** làm yếu kiểm soát: ranh giới tin cậy thật nằm ở `verifyUploadedFile`, đọc
 * `mimeType` do chính Google Drive tự nhận dạng từ nội dung sau khi tải xong. Tệp PDF đổi tên
 * thành `.jpg` vẫn bị chặn ở đó.
 */

export const CANONICAL_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

export type CanonicalImageMimeType = (typeof CANONICAL_IMAGE_MIME_TYPES)[number];

/**
 * Giá trị cho thuộc tính `accept` của ô chọn tệp.
 *
 * Có cả phần mở rộng chứ không chỉ MIME: nhiều trình quản lý tệp trên Android làm mờ tệp hợp lệ
 * khi `accept` chỉ có MIME, khiến người dân tưởng máy không cho chọn ảnh của mình.
 */
export const IMAGE_FILE_ACCEPT =
  "image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.jpe,.jfif,.png,.webp,.heic,.heif";

/** Bí danh MIME thường gặp ngoài thực tế, quy về tên chuẩn. */
const MIME_ALIASES: Readonly<Record<string, CanonicalImageMimeType>> = {
  "image/jpeg": "image/jpeg",
  "image/jpg": "image/jpeg",
  "image/pjpeg": "image/jpeg",
  "image/png": "image/png",
  "image/x-png": "image/png",
  "image/webp": "image/webp",
  "image/heic": "image/heic",
  "image/heic-sequence": "image/heic",
  "image/heif": "image/heif",
  "image/heif-sequence": "image/heif",
};

/** Suy từ phần mở rộng khi trình duyệt không khai được loại. */
const EXTENSION_ALIASES: Readonly<Record<string, CanonicalImageMimeType>> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  jpe: "image/jpeg",
  jfif: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
};

function extensionOf(fileName: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(fileName.trim());
  return match ? match[1].toLowerCase() : "";
}

/**
 * Trả về tên chuẩn của loại ảnh, hoặc `null` nếu không nhận ra.
 *
 * @param claimedMimeType `File.type` do trình duyệt khai — có thể rỗng hoặc không chuẩn.
 * @param fileName Tên tệp, dùng để suy ra loại khi `claimedMimeType` không dùng được.
 */
export function canonicalImageMimeType(
  claimedMimeType: string | undefined | null,
  fileName: string | undefined | null,
): CanonicalImageMimeType | null {
  // Bỏ tham số phía sau dấu `;` (ví dụ `image/jpeg; charset=binary`) trước khi tra.
  const claimed = (claimedMimeType ?? "").split(";")[0].trim().toLowerCase();
  const fromMime = MIME_ALIASES[claimed];
  if (fromMime) {
    return fromMime;
  }

  return EXTENSION_ALIASES[extensionOf(fileName ?? "")] ?? null;
}

export function isCanonicalImageMimeType(value: string): value is CanonicalImageMimeType {
  return (CANONICAL_IMAGE_MIME_TYPES as readonly string[]).includes(value);
}
