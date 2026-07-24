/**
 * Quy ước đặt tên file gốc trên Drive khi tiếp nhận chính thức: `[Số phát hành GCN]-GCN[-STT].ext`
 * cho ảnh GCN, `[Số phát hành]-GT[-STT].ext` cho ảnh CCCD (STT chỉ xuất hiện khi ≥2 file cùng
 * nhóm). Dùng chung giữa bước đổi tên thật trên Drive (`acceptance-saga.ts`) và cột 49 PL3
 * (`pl3-export.ts`) để hai nơi không bao giờ lệch tên nhau.
 */
import type { CanonicalImageMimeType } from "./image-format";

export type ScannedDocumentType = "CITIZEN_ID_FRONT" | "CITIZEN_ID_BACK" | "CERTIFICATE";
export type ScannedFileTag = "GCN" | "GT";

export function tagForDocumentType(documentType: ScannedDocumentType): ScannedFileTag {
  return documentType === "CERTIFICATE" ? "GCN" : "GT";
}

const EXTENSION_OF_MIME: Readonly<Record<CanonicalImageMimeType, string>> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
};

/** Đuôi mở rộng theo mimeType đã chuẩn hóa; mimeType lạ (không thể xảy ra sau `verifyUploadedFile`) trả `"bin"`. */
export function extensionFromMimeType(mimeType: string): string {
  return EXTENSION_OF_MIME[mimeType as CanonicalImageMimeType] ?? "bin";
}

/** Bỏ ký tự nguy hiểm cho tên file Drive (`/`, `\`, ký tự điều khiển); giữ khoảng trắng vì mẫu thật ("0 319059") có dấu cách. */
export function sanitizeForFileName(value: string): string {
  return value
    .replace(/[\\/\r\n\t\0]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface ScannedFileNameInput {
  readonly documentType: ScannedDocumentType;
  readonly mimeType: string;
}

/**
 * Tính tên gốc cho từng phần tử của `files` — bên gọi PHẢI lọc `status === "UPLOADED"` và giữ
 * đúng thứ tự `created_at, file_id` (khớp `repository.listFiles`/`refreshFileSummaries`) trước khi
 * gọi, để STT sinh ra ở đây khớp đúng STT đã ghi thật trên Drive.
 *
 * Số phát hành rỗng → không đủ căn cứ để đặt tên, trả mảng cùng độ dài toàn chuỗi rỗng để bên gọi
 * biết bỏ qua việc đổi tên thay vì tự chế tên khác (tránh lệch với PL3 trường 49).
 */
export function buildOriginalFileNames(
  issueNumber: string,
  files: readonly ScannedFileNameInput[],
): string[] {
  const base = sanitizeForFileName(issueNumber);
  if (!base) return files.map(() => "");

  const countByTag: Record<ScannedFileTag, number> = { GCN: 0, GT: 0 };
  for (const file of files) countByTag[tagForDocumentType(file.documentType)] += 1;

  const seenByTag: Record<ScannedFileTag, number> = { GCN: 0, GT: 0 };
  return files.map((file) => {
    const tag = tagForDocumentType(file.documentType);
    seenByTag[tag] += 1;
    const suffix = countByTag[tag] > 1 ? `-${seenByTag[tag]}` : "";
    return `${base}-${tag}${suffix}.${extensionFromMimeType(file.mimeType)}`;
  });
}
