"use client";

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

async function loadImage(source: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.src = source;
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Không thể mở ảnh CCCD."));
  });
  return image;
}

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

async function rotatedSources(file: File): Promise<string[]> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await loadImage(objectUrl);
    const sources: string[] = [objectUrl];
    for (const rotation of [90, 180, 270]) {
      const sideways = rotation === 90 || rotation === 270;
      const canvas = document.createElement("canvas");
      canvas.width = sideways ? image.naturalHeight : image.naturalWidth;
      canvas.height = sideways ? image.naturalWidth : image.naturalHeight;
      const context = canvas.getContext("2d");
      if (!context) continue;
      context.translate(canvas.width / 2, canvas.height / 2);
      context.rotate((rotation * Math.PI) / 180);
      context.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
      sources.push(canvas.toDataURL("image/jpeg", 0.92));
    }
    return sources;
  } catch {
    URL.revokeObjectURL(objectUrl);
    throw new Error("Không thể chuẩn bị ảnh CCCD để đọc QR.");
  }
}

/** Đọc QR cục bộ, thử ảnh gốc và 3 hướng xoay; không trả hay log payload thô. */
export async function readCitizenIdQr(file: File): Promise<CitizenIdQrReadResult | null> {
  const sources = await rotatedSources(file);
  try {
    const { BrowserQRCodeReader } = await import("@zxing/browser");
    const reader = new BrowserQRCodeReader();
    for (const source of sources) {
      try {
        const result = await reader.decodeFromImageUrl(source);
        const payload = result.getText();
        const parsed = parseCitizenIdQr(payload);
        if (!parsed) continue;
        return {
          parsed,
          payloadHash: await hashPayload(payload),
          decoderVersion: CITIZEN_ID_QR_DECODER_VERSION,
          parserVersion: CITIZEN_ID_QR_PARSER_VERSION,
        };
      } catch {
        // QR có thể ở hướng khác hoặc không phải định dạng CCCD được hỗ trợ.
      }
    }
    return null;
  } finally {
    for (const source of sources) {
      if (source.startsWith("blob:")) URL.revokeObjectURL(source);
    }
  }
}
