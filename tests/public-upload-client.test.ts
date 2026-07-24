import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("trình duyệt hoàn tất tải ảnh công khai", () => {
  it("gửi idempotency key khi xác nhận file đã tải lên Drive", () => {
    const wizardPath = path.join(process.cwd(), "src/app/ke-khai/wizard.tsx");
    const wizardCode = fs.readFileSync(wizardPath, "utf8");

    expect(wizardCode).toMatch(
      /uploads\/complete[\s\S]*?"idempotency-key": crypto\.randomUUID\(\)/,
    );
  });
});
