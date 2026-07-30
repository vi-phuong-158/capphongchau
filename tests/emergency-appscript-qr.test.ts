import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const indexHtml = readFileSync(
  resolve(process.cwd(), "phong-chau-emergency-appscript", "Index.html"),
  "utf8",
);

describe("emergency Apps Script CCCD QR intake", () => {
  it("loads the same pinned ZXing Browser runtime as the main project", () => {
    expect(indexHtml).toContain("https://cdn.jsdelivr.net/npm/@zxing/browser@0.1.5/umd/zxing-browser.min.js");
    expect(indexHtml).toContain("function loadZxingBrowser()");
  });

  it("places the CCCD scan before the form and keeps manual entry as fallback", () => {
    expect(indexHtml.indexOf("CCCD và quét QR")).toBeLessThan(indexHtml.indexOf("Thông tin người kê khai"));
    expect(indexHtml).toContain("Bạn vẫn có thể nhập thông tin thủ công.");
  });

  it("attempts the QR decoder for both CCCD faces", () => {
    expect(indexHtml).toContain("void readCitizenIdQr(file, side)");
    expect(indexHtml).toContain("qrReadRequest: { front: 0, back: 0 }");
    expect(indexHtml).toContain("mặt trước hoặc mặt sau");
  });

  it("uses the conservative CCCD parser and tries every card orientation locally", () => {
    expect(indexHtml).toContain("function parseCitizenIdQr(payload)");
    expect(indexHtml).toContain("/^\\d{12}$/.test(fields[0])");
    expect(indexHtml).toContain("for (const degrees of [0, 90, 180, 270])");
    expect(indexHtml).toContain("new Map([[3, true]])");
  });

  it("does not send QR content to an Apps Script server function", () => {
    const qrReader = indexHtml.slice(
      indexHtml.indexOf("async function readCitizenIdQr"),
      indexHtml.indexOf("function validateClientFile"),
    );
    expect(qrReader).not.toContain("callServer(");
    expect(qrReader).not.toContain("console.");
  });
});
