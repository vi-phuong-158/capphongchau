import { describe, expect, it } from "vitest";

import {
  CODE_ALPHABET,
  checkCharacter,
  createAccessSecret,
  createReceiptCode,
  isValidReceiptCode,
  lastSecretGroup,
  receiptYear,
} from "@/modules/public-intake/receipt-code";

describe("bảng chữ mã tiếp nhận", () => {
  it("không chứa ký tự dễ nhầm khi đọc qua điện thoại", () => {
    for (const char of ["0", "O", "1", "I", "L", "U"]) {
      expect(CODE_ALPHABET).not.toContain(char);
    }
  });
});

describe("receiptYear", () => {
  it("tính năm theo Asia/Ho_Chi_Minh chứ không theo UTC", () => {
    // 31/12/2026 lúc 23:00 UTC đã là 06:00 ngày 01/01/2027 tại Việt Nam.
    expect(receiptYear(new Date("2026-12-31T23:00:00Z"))).toBe("2027");
    expect(receiptYear(new Date("2026-06-30T12:00:00Z"))).toBe("2026");
  });
});

describe("createReceiptCode", () => {
  it("đúng định dạng PC-KK-{năm}-{8 ký tự}", () => {
    expect(createReceiptCode(new Date("2026-06-30T12:00:00Z"))).toMatch(/^PC-KK-2026-[A-Z0-9]{8}$/);
  });

  it("sinh mã hợp lệ và không tuần tự", () => {
    const codes = new Set<string>();
    for (let index = 0; index < 200; index += 1) {
      const code = createReceiptCode();
      expect(isValidReceiptCode(code)).toBe(true);
      codes.add(code);
    }
    expect(codes.size).toBe(200);
  });
});

describe("isValidReceiptCode", () => {
  it("từ chối mã sai ký tự kiểm tra", () => {
    const code = createReceiptCode(new Date("2026-06-30T12:00:00Z"));
    const body = code.slice(-8, -1);
    const wrongCheck = CODE_ALPHABET[(CODE_ALPHABET.indexOf(checkCharacter(body)) + 1) % 30];

    expect(isValidReceiptCode(`PC-KK-2026-${body}${wrongCheck}`)).toBe(false);
  });

  it("từ chối mã sai định dạng hoặc chứa ký tự ngoài bảng chữ", () => {
    expect(isValidReceiptCode("PC-KK-2026-ABC")).toBe(false);
    expect(isValidReceiptCode("XX-KK-2026-ABCDEFGH")).toBe(false);
    expect(isValidReceiptCode("PC-KK-2026-OOOOOOOO")).toBe(false);
  });

  it("chấp nhận mã người dân gõ thường hoặc thừa khoảng trắng", () => {
    const code = createReceiptCode();
    expect(isValidReceiptCode(`  ${code.toLowerCase()}  `)).toBe(true);
  });
});

describe("createAccessSecret", () => {
  it("gồm 16 ký tự chia thành 4 nhóm", () => {
    const secret = createAccessSecret();
    const groups = secret.split("-");

    expect(groups).toHaveLength(4);
    expect(groups.every((group) => group.length === 4)).toBe(true);
    expect(secret.replace(/-/g, "")).toHaveLength(16);
  });

  it("chỉ dùng ký tự trong bảng chữ cho phép", () => {
    for (const char of createAccessSecret().replace(/-/g, "")) {
      expect(CODE_ALPHABET).toContain(char);
    }
  });

  it("trả về nhóm cuối để đối chiếu khi người dân xác nhận đã lưu mã", () => {
    const secret = createAccessSecret();
    expect(lastSecretGroup(secret)).toBe(secret.split("-")[3]);
  });
});
