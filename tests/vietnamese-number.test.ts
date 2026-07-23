import { describe, expect, it } from "vitest";

import { parseVietnameseDecimal } from "@/modules/public-intake/vietnamese-number";

describe("parseVietnameseDecimal", () => {
  it("đọc dấu phẩy làm dấu thập phân kiểu Việt", () => {
    expect(parseVietnameseDecimal("123,5")).toBe(123.5);
    expect(parseVietnameseDecimal("29,16")).toBe(29.16);
  });

  it("đọc dấu chấm làm dấu thập phân kiểu Anh", () => {
    expect(parseVietnameseDecimal("123.5")).toBe(123.5);
  });

  it("bỏ khoảng trắng phân nhóm hàng nghìn", () => {
    expect(parseVietnameseDecimal("1 234,5")).toBe(1234.5);
  });

  it("phân biệt dấu phân nhóm và dấu thập phân khi có cả hai", () => {
    expect(parseVietnameseDecimal("1.234,5")).toBe(1234.5);
    expect(parseVietnameseDecimal("1,234.5")).toBe(1234.5);
  });

  it("nhận số nguyên và số 0", () => {
    expect(parseVietnameseDecimal("220")).toBe(220);
    expect(parseVietnameseDecimal("0")).toBe(0);
  });

  it("trả null cho chuỗi rỗng hoặc không phải số", () => {
    expect(parseVietnameseDecimal("")).toBeNull();
    expect(parseVietnameseDecimal("   ")).toBeNull();
    expect(parseVietnameseDecimal("abc")).toBeNull();
    expect(parseVietnameseDecimal("12,3,4")).toBeNull();
  });
});
