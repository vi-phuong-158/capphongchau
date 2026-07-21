import { describe, expect, it } from "vitest";

import { parseCitizenIdQr } from "@/modules/public-intake/citizen-id-qr";

describe("parseCitizenIdQr", () => {
  it("tách dữ liệu từ định dạng QR CCCD bảy trường", () => {
    const parsed = parseCitizenIdQr(
      "012345678901|123456789|NGUYEN VAN DEMO|15081992|Nam|Phường Phong Châu, Phú Thọ|08042021",
    );

    expect(parsed).toEqual({
      identityNumber: "012345678901",
      fullName: "NGUYEN VAN DEMO",
      dateOfBirth: "1992-08-15",
      gender: "NAM",
      residenceAddress: "Phường Phong Châu, Phú Thọ",
    });
  });

  it("chuẩn hóa giới tính nữ và bác bỏ ngày không tồn tại", () => {
    expect(parseCitizenIdQr("012345678901||TRAN THI DEMO|31022000|Nữ|Phú Thọ|08042021")).toBeNull();
    expect(
      parseCitizenIdQr("012345678901||TRAN THI DEMO|29022000|Nữ|Phú Thọ|08042021"),
    ).toMatchObject({ gender: "NU", dateOfBirth: "2000-02-29" });
  });

  it("không suy đoán payload không đủ cấu trúc", () => {
    expect(parseCitizenIdQr("012345678901|NGUYEN VAN DEMO")).toBeNull();
    expect(parseCitizenIdQr("123|x|y|15081992|Nam|Phú Thọ|08042021")).toBeNull();
  });
});
