import {
  BarcodeFormat,
  BinaryBitmap,
  DecodeHintType,
  EncodeHintType,
  HybridBinarizer,
  QRCodeReader,
  QRCodeWriter,
  RGBLuminanceSource,
} from "@zxing/library";
import { describe, expect, it } from "vitest";

/**
 * Khóa lại lý do `readCitizenIdQr` bắt buộc truyền `TRY_HARDER`.
 *
 * Ở cấu hình mặc định, ZXing chỉ quét một số dòng ngang cố định của ảnh: mã QR có được đọc hay
 * không phụ thuộc vào việc nó rơi trúng dòng quét nào, nên kết quả thất thường theo kích thước và
 * tỷ lệ ảnh chứ không theo một ngưỡng dự đoán được (QR 120px trượt, 150px đọc được, 240px lại
 * trượt — cùng một khung ảnh). Đó là lý do tính năng quét QR trước đây lúc được lúc không.
 * `TRY_HARDER` quét vét cạn và đọc được toàn bộ các bố cục dưới đây.
 *
 * Test chạy trên lõi giải mã thuần JS của `@zxing/library` (không cần DOM); phần bọc trình duyệt
 * `BrowserQRCodeReader` dùng đúng reader và đúng hints này.
 */

const PAYLOAD =
  "012345678901|123456789|NGUYEN VAN DEMO|15081992|Nam|Phuong Phong Chau, Phu Tho|08042021";

/** Dựng ảnh xám có mã QR đặt giữa, mô phỏng ảnh chụp cả tấm thẻ. */
function buildPhoto(qrSize: number, width: number, height: number): Uint8ClampedArray {
  const encodeHints = new Map<EncodeHintType, unknown>([[EncodeHintType.MARGIN, 2]]);
  const matrix = new QRCodeWriter().encode(
    PAYLOAD,
    BarcodeFormat.QR_CODE,
    qrSize,
    qrSize,
    encodeHints as Map<EncodeHintType, never>,
  );

  const luminances = new Uint8ClampedArray(width * height).fill(200);
  const offsetX = Math.floor((width - matrix.getWidth()) / 2);
  const offsetY = Math.floor((height - matrix.getHeight()) / 2);
  for (let y = 0; y < matrix.getHeight(); y += 1) {
    for (let x = 0; x < matrix.getWidth(); x += 1) {
      luminances[(offsetY + y) * width + offsetX + x] = matrix.get(x, y) ? 0 : 255;
    }
  }
  return luminances;
}

function decodes(
  luminances: Uint8ClampedArray,
  width: number,
  height: number,
  tryHarder: boolean,
): boolean {
  const bitmap = new BinaryBitmap(
    new HybridBinarizer(new RGBLuminanceSource(luminances, width, height)),
  );
  const hints = new Map<DecodeHintType, unknown>();
  if (tryHarder) hints.set(DecodeHintType.TRY_HARDER, true);
  try {
    return (
      new QRCodeReader().decode(bitmap, hints as Map<DecodeHintType, never>).getText() === PAYLOAD
    );
  } catch {
    return false;
  }
}

/** Các bố cục thường gặp khi người dân chụp thẻ bằng điện thoại. */
const LAYOUTS = [
  { label: "ảnh gốc 12MP dọc, QR 300px", qr: 300, width: 3000, height: 4000 },
  { label: "ảnh gốc 12MP ngang, QR 300px", qr: 300, width: 4000, height: 3000 },
  { label: "đã thu nhỏ 1200x1600, QR 120px", qr: 120, width: 1200, height: 1600 },
  { label: "đã thu nhỏ 1200x1600, QR 240px", qr: 240, width: 1200, height: 1600 },
  { label: "đã thu nhỏ 1200x1600, QR 300px", qr: 300, width: 1200, height: 1600 },
  { label: "ảnh vuông 2000x2000, QR 300px", qr: 300, width: 2000, height: 2000 },
] as const;

/** Đo được ngày 2026-07-22: đây là các bố cục mà cấu hình mặc định trượt. */
const DEFAULT_FAILS = new Set([
  "ảnh gốc 12MP dọc, QR 300px",
  "đã thu nhỏ 1200x1600, QR 120px",
  "đã thu nhỏ 1200x1600, QR 240px",
  "ảnh vuông 2000x2000, QR 300px",
]);

describe("giải mã QR CCCD", () => {
  it.each(LAYOUTS)("TRY_HARDER đọc được: $label", ({ qr, width, height }) => {
    expect(decodes(buildPhoto(qr, width, height), width, height, true)).toBe(true);
  });

  it("cấu hình mặc định trượt ở nhiều bố cục thường gặp — bỏ TRY_HARDER là hỏng tính năng", () => {
    const failing = LAYOUTS.filter(
      ({ qr, width, height }) => !decodes(buildPhoto(qr, width, height), width, height, false),
    ).map((layout) => layout.label);

    expect(new Set(failing)).toEqual(DEFAULT_FAILS);
  });

  it("thu nhỏ ảnh không cứu được: QR co lại theo và vẫn trượt nếu thiếu TRY_HARDER", () => {
    // 3000x4000 thu về cạnh dài 1600 thì QR 300px chỉ còn 120px — đúng bố cục trượt ở trên.
    expect(decodes(buildPhoto(120, 1200, 1600), 1200, 1600, false)).toBe(false);
    expect(decodes(buildPhoto(120, 1200, 1600), 1200, 1600, true)).toBe(true);
  });
});
