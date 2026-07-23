import { describe, expect, it } from "vitest";

import { assembleIsoDate, splitIsoDate } from "@/modules/public-intake/vietnamese-date";

const TODAY = new Date("2026-07-23T00:00:00Z");

describe("splitIsoDate", () => {
  it("tách YYYY-MM-DD thành ba ô", () => {
    expect(splitIsoDate("1967-08-28")).toEqual({ day: "28", month: "08", year: "1967" });
  });

  it("chuỗi rỗng hoặc sai định dạng trả ba ô rỗng", () => {
    expect(splitIsoDate("")).toEqual({ day: "", month: "", year: "" });
    expect(splitIsoDate("28/8/1967")).toEqual({ day: "", month: "", year: "" });
  });
});

describe("assembleIsoDate", () => {
  it("ghép ngày hợp lệ thành YYYY-MM-DD", () => {
    expect(assembleIsoDate("28", "8", "1967", {}, TODAY)).toBe("1967-08-28");
    expect(assembleIsoDate("5", "3", "2016", {}, TODAY)).toBe("2016-03-05");
  });

  it("từ chối ngày không tồn tại", () => {
    expect(assembleIsoDate("31", "2", "2020", {}, TODAY)).toBeNull();
    expect(assembleIsoDate("29", "2", "2019", {}, TODAY)).toBeNull(); // 2019 không nhuận
    expect(assembleIsoDate("29", "2", "2020", {}, TODAY)).toBe("2020-02-29"); // 2020 nhuận
  });

  it("từ chối khi thiếu ô hoặc năm không đủ 4 số", () => {
    expect(assembleIsoDate("", "8", "1967", {}, TODAY)).toBeNull();
    expect(assembleIsoDate("28", "8", "67", {}, TODAY)).toBeNull();
  });

  it("chặn ngày tương lai theo mặc định", () => {
    expect(assembleIsoDate("24", "7", "2026", {}, TODAY)).toBeNull();
    expect(assembleIsoDate("23", "7", "2026", {}, TODAY)).toBe("2026-07-23");
  });

  it("áp khoảng năm cho phép — bắt được lỗi kiểu năm 1017 của PL3 mẫu", () => {
    expect(assembleIsoDate("9", "10", "1017", { minYear: 1987 }, TODAY)).toBeNull();
    expect(assembleIsoDate("12", "11", "2017", { minYear: 1987 }, TODAY)).toBe("2017-11-12");
  });

  it("ngày sinh cho phép năm xa nhưng không cho tương lai", () => {
    expect(assembleIsoDate("12", "12", "1936", { minYear: 1900 }, TODAY)).toBe("1936-12-12");
    expect(assembleIsoDate("1", "1", "1899", { minYear: 1900 }, TODAY)).toBeNull();
  });
});
