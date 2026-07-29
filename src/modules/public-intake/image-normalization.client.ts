"use client";

/**
 * Chuẩn hóa ảnh **trên thiết bị** trước khi tải lên Drive.
 *
 * Vì sao: góp ý số 1 của cán bộ đi thu hồ sơ là "up ảnh lâu quá". Điện thoại hiện nay chụp 12–50MP,
 * mỗi ảnh 8–20 MiB; ba ảnh GCN là 30–60 MiB đẩy qua 4G. Cùng tờ giấy đó ở cạnh dài 3000 px chỉ còn
 * vài MiB mà chữ vẫn đọc được — phần lớn byte đang truyền là chi tiết mà mắt người và cán bộ đối
 * chiếu đều không dùng tới.
 *
 * Ranh giới: module này **chỉ giảm dung lượng truyền**. Nó không cắt, không xoay, không tăng nét,
 * không đổi tỷ lệ. Ảnh sau chuẩn hóa vẫn phải đọc được mọi chữ trên giấy tờ — nếu không thì thà
 * chậm còn hơn.
 *
 * Cảnh báo thuật ngữ: thư mục Drive tên `01_INBOX/{id}/originals`. Sau khi bật chuẩn hóa, tệp
 * trong đó là **bản tiếp nhận vận hành**, không còn chắc chắn là byte gốc từ máy ảnh. Xem
 * `docs/brain/03-decisions.md`.
 */

import { canonicalImageMimeType } from "./image-format";

export type IntakeImageKind = "CITIZEN_ID" | "CERTIFICATE";

export type NormalizationReason =
  /** Cờ tắt và ảnh không phải HEIC — không đụng vào. */
  | "DISABLED"
  /** Đã nhỏ sẵn, hoặc một bước xử lý thất bại nên dùng nguyên tệp nguồn. */
  | "UNCHANGED"
  /** Chỉ đổi HEIC sang JPEG, không thu nhỏ. */
  | "HEIC_CONVERTED"
  /** Trong giới hạn cạnh nhưng vượt ngưỡng dung lượng: mã hóa lại, giữ nguyên kích thước. */
  | "REENCODED"
  /** Vượt giới hạn cạnh: thu nhỏ rồi mã hóa lại. */
  | "RESIZED_AND_REENCODED"
  /** Kết quả xử lý to hơn tệp nguồn — dùng nguồn. */
  | "SOURCE_SMALLER";

export interface ImageDimensions {
  readonly sizeBytes: number;
  readonly mimeType: string;
  readonly width: number;
  readonly height: number;
}

export interface ImageNormalizationResult {
  /** Tệp sẽ được tải lên — có thể chính là tệp nguồn. */
  readonly file: File;
  readonly changed: boolean;
  readonly source: ImageDimensions;
  readonly upload: ImageDimensions;
  readonly normalizationVersion: string;
  readonly reason: NormalizationReason;
}

/** Đổi giá trị này khi đổi thông số; metric so sánh trước/sau dựa vào nó. */
export const NORMALIZATION_VERSION = "intake-v2-1";

export interface NormalizationProfile {
  /** Cạnh dài tối đa sau chuẩn hóa, px. */
  readonly maxEdge: number;
  readonly jpegQuality: number;
  /** Dưới ngưỡng này **và** trong `maxEdge` thì giữ nguyên, không đụng vào. */
  readonly keepIfUnderBytes: number;
}

/**
 * CCCD là thẻ nhỏ, chữ to; 2400 px thừa để đọc và để ZXing bắt QR.
 * GCN là tờ A3/A4 chữ nhỏ hơn nhiều, giữ 3000 px cho chắc.
 */
export const NORMALIZATION_PROFILES: Readonly<Record<IntakeImageKind, NormalizationProfile>> = {
  CITIZEN_ID: { maxEdge: 2400, jpegQuality: 0.88, keepIfUnderBytes: 4 * 1024 * 1024 },
  CERTIFICATE: { maxEdge: 3000, jpegQuality: 0.88, keepIfUnderBytes: 4 * 1024 * 1024 },
};

const HEIC_MIME_TYPES = new Set(["image/heic", "image/heif"]);

/**
 * Tên tệp tải lên do client đặt lại, **không** dùng tên gốc.
 *
 * Tên do người dân đặt hay do máy ảnh sinh thường mang số CCCD, tên người, ngày giờ, đôi khi cả vị
 * trí — không được để những thứ đó thành tên tệp trong kho.
 */
export function safeUploadFileName(kind: IntakeImageKind, mimeType: string): string {
  const extension = mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";
  const prefix = kind === "CITIZEN_ID" ? "cccd" : "gcn";
  return `${prefix}.${extension}`;
}

/** Kích thước đích: thu nhỏ theo cạnh dài, **không bao giờ phóng to**, giữ nguyên tỷ lệ. */
export function targetDimensions(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };
  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function isHeic(file: File): boolean {
  const canonical = canonicalImageMimeType(file.type, file.name);
  return canonical !== null && HEIC_MIME_TYPES.has(canonical);
}

/**
 * Cờ bật/tắt. Tắt thì vẫn chuyển HEIC (Drive không xác minh được HEIC theo hợp đồng hiện tại),
 * chỉ bỏ phần resize/re-encode JPEG/PNG/WebP.
 */
export function isNormalizationEnabled(): boolean {
  return process.env.NEXT_PUBLIC_INTAKE_IMAGE_NORMALIZATION_ENABLED === "true";
}

interface DecodedImage {
  readonly source: ImageBitmap | HTMLImageElement;
  readonly release: () => void;
}

/**
 * Giải mã ảnh và trả kèm hàm dọn.
 *
 * `imageOrientation: "from-image"` là bắt buộc: ảnh chụp dọc từ điện thoại mang cờ EXIF xoay, mà
 * `createImageBitmap` mặc định **bỏ qua** cờ đó — vẽ lên canvas rồi encode lại sẽ cho ra ảnh nằm
 * ngang, cán bộ phải tự xoay từng tờ.
 */
async function decodeImage(file: Blob): Promise<DecodedImage> {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    return { source: bitmap, release: () => bitmap.close() };
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = objectUrl;
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Không mở được ảnh."));
    });
    return { source: image, release: () => URL.revokeObjectURL(objectUrl) };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

function describe(file: File, width: number, height: number): ImageDimensions {
  return { sizeBytes: file.size, mimeType: file.type, width, height };
}

/**
 * Chuẩn hóa một ảnh kê khai.
 *
 * Không bao giờ ném lỗi vì lý do chất lượng: mọi đường thất bại đều trả về **tệp nguồn**. Ảnh to
 * mà tải được vẫn tốt hơn là chặn người dân lại vì canvas trả rỗng trên một trình duyệt lạ.
 */
export async function normalizeIntakeImage(
  file: File,
  kind: IntakeImageKind,
): Promise<ImageNormalizationResult> {
  const profile = NORMALIZATION_PROFILES[kind];
  const heic = isHeic(file);

  const unchanged = (reason: NormalizationReason): ImageNormalizationResult => ({
    file,
    changed: false,
    source: describe(file, 0, 0),
    upload: describe(file, 0, 0),
    normalizationVersion: NORMALIZATION_VERSION,
    reason,
  });

  if (!isNormalizationEnabled() && !heic) return unchanged("DISABLED");

  // HEIC phải qua bước chuyển định dạng dù cờ tắt — giữ đúng hành vi trước V2.
  let working = file;
  if (heic) {
    try {
      const { default: heic2any } = await import("heic2any");
      const converted = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.92 });
      const jpeg = Array.isArray(converted) ? converted[0] : converted;
      working = new File([jpeg], safeUploadFileName(kind, "image/jpeg"), { type: "image/jpeg" });
    } catch {
      return unchanged("UNCHANGED");
    }
    if (!isNormalizationEnabled()) {
      return {
        file: working,
        changed: true,
        source: describe(file, 0, 0),
        upload: describe(working, 0, 0),
        normalizationVersion: NORMALIZATION_VERSION,
        reason: "HEIC_CONVERTED",
      };
    }
  }

  let decoded: DecodedImage;
  try {
    decoded = await decodeImage(working);
  } catch {
    return working === file ? unchanged("UNCHANGED") : unchanged("HEIC_CONVERTED");
  }

  try {
    const width = decoded.source.width;
    const height = decoded.source.height;
    if (!width || !height) return unchanged("UNCHANGED");

    const source = describe(file, width, height);
    const target = targetDimensions(width, height, profile.maxEdge);
    const withinEdge = target.width === width && target.height === height;

    // Ảnh đã nhỏ cả về dung lượng lẫn kích thước: không đụng vào. Mã hóa lại một ảnh vốn đã gọn
    // chỉ thêm một lượt mất chất lượng mà không tiết kiệm được gì.
    if (withinEdge && working.size <= profile.keepIfUnderBytes) {
      return {
        file: working,
        changed: working !== file,
        source,
        upload: describe(working, width, height),
        normalizationVersion: NORMALIZATION_VERSION,
        reason: working === file ? "UNCHANGED" : "HEIC_CONVERTED",
      };
    }

    const canvas = document.createElement("canvas");
    canvas.width = target.width;
    canvas.height = target.height;
    const context = canvas.getContext("2d");
    if (!context) return unchanged("UNCHANGED");
    context.drawImage(decoded.source, 0, 0, target.width, target.height);

    const blob = await canvasToBlob(canvas, profile.jpegQuality);
    // Bỏ tham chiếu canvas ngay: trên iOS giữ nhiều canvas lớn là đường ngắn nhất tới tab bị kill.
    canvas.width = 0;
    canvas.height = 0;
    if (!blob) return unchanged("UNCHANGED");

    // Kết quả to hơn nguồn thì dùng nguồn — trừ HEIC, vốn buộc phải đổi định dạng.
    if (blob.size >= working.size && !heic) {
      return {
        file: working,
        changed: false,
        source,
        upload: describe(working, width, height),
        normalizationVersion: NORMALIZATION_VERSION,
        reason: "SOURCE_SMALLER",
      };
    }

    const normalized = new File([blob], safeUploadFileName(kind, "image/jpeg"), {
      type: "image/jpeg",
    });
    return {
      file: normalized,
      changed: true,
      source,
      upload: describe(normalized, target.width, target.height),
      normalizationVersion: NORMALIZATION_VERSION,
      reason: withinEdge ? "REENCODED" : "RESIZED_AND_REENCODED",
    };
  } finally {
    decoded.release();
  }
}
