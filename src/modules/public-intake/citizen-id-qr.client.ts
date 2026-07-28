"use client";

// Chỉ lấy kiểu: câu lệnh này bị xóa khi biên dịch nên không kéo `@zxing/library` vào bundle đầu.
import type { DecodeHintType } from "@zxing/library";

import {
  CITIZEN_ID_QR_DECODER_VERSION,
  CITIZEN_ID_QR_PARSER_VERSION,
  parseCitizenIdQr,
  type ParsedCitizenIdQr,
} from "./citizen-id-qr";

export interface CitizenIdQrReadResult {
  readonly parsed: ParsedCitizenIdQr;
  readonly payloadHash: string;
  readonly decoderVersion: string;
  readonly parserVersion: string;
}

/**
 * Thu nhỏ cạnh dài trước khi giải mã. Ảnh 12MP thẳng từ điện thoại vừa tốn bộ nhớ vừa chậm, và
 * trên iOS canvas quá lớn có thể trả về ảnh rỗng. 1600px vẫn thừa nét cho một mã QR trên thẻ.
 */
const MAX_DECODE_EDGE = 1600;

async function hashPayload(payload: string): Promise<string> {
  const bytes = new TextEncoder().encode(payload);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** HEIC/HEIF phải được đổi tại thiết bị trước khi upload hay đưa vào ZXing. */
export async function prepareCitizenIdImage(file: File): Promise<File> {
  if (file.type !== "image/heic" && file.type !== "image/heif") return file;
  const { default: heic2any } = await import("heic2any");
  const converted = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.92 });
  const jpeg = Array.isArray(converted) ? converted[0] : converted;
  return new File([jpeg], `${file.name.replace(/\.[^.]+$/, "")}.jpg`, { type: "image/jpeg" });
}

async function loadBitmap(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    return createImageBitmap(file);
  }
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = objectUrl;
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Không thể mở ảnh CCCD."));
    });
    return image;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function drawScaled(source: ImageBitmap | HTMLImageElement): HTMLCanvasElement | null {
  const width = source.width;
  const height = source.height;
  if (!width || !height) return null;

  const scale = Math.min(1, MAX_DECODE_EDGE / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));

  const context = canvas.getContext("2d");
  if (!context) return null;
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/**
 * Đọc QR cục bộ từ một ảnh. Không trả và không ghi log payload thô.
 *
 * `TRY_HARDER` là bắt buộc, không phải tinh chỉnh cho vui: ở cấu hình mặc định ZXing chỉ đọc được
 * ảnh nằm ngang — ảnh dọc và ảnh vuông đều trả `NotFoundException` dù mã QR rõ nét. Ảnh chụp CCCD
 * bằng điện thoại gần như luôn là ảnh dọc, nên thiếu hint này thì tính năng coi như không chạy.
 * `tests/citizen-id-qr-decoding.test.ts` khóa lại kết luận đó.
 */
export async function readCitizenIdQr(file: File): Promise<CitizenIdQrReadResult | null> {
  let source: ImageBitmap | HTMLImageElement;
  try {
    source = await loadBitmap(file);
  } catch {
    return null;
  }
  try {
    const canvas = drawScaled(source);
    if (!canvas) return null;

    const [{ BrowserQRCodeReader }, zxing] = await Promise.all([
      import("@zxing/browser"),
      import("@zxing/library"),
    ]);

    const hints = new Map<DecodeHintType, unknown>([[zxing.DecodeHintType.TRY_HARDER, true]]);
    const reader = new BrowserQRCodeReader(hints);

    let payload: string;
    try {
      // `decodeFromCanvas` đọc thẳng pixel, không phải dựng chuỗi data URL vài MB như trước.
      payload = reader.decodeFromCanvas(canvas).getText();
    } catch {
      return null;
    }

    const parsed = parseCitizenIdQr(payload);
    if (!parsed) return null;

    return {
      parsed,
      payloadHash: await hashPayload(payload),
      decoderVersion: CITIZEN_ID_QR_DECODER_VERSION,
      parserVersion: CITIZEN_ID_QR_PARSER_VERSION,
    };
  } finally {
    if ("close" in source) source.close();
  }
}
