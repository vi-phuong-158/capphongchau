import { describe, expect, it } from "vitest";

import {
  lookupNewMapSheet,
  MAP_SHEET_REFERENCE,
  NEW_WARD_CODE,
  OLD_WARDS,
} from "@/modules/public-intake/map-sheet-reference";

describe("bảng tham chiếu tờ bản đồ Phong Châu", () => {
  it("có đúng 164 dòng của ba đơn vị cũ", () => {
    expect(MAP_SHEET_REFERENCE).toHaveLength(164);
    expect(MAP_SHEET_REFERENCE.filter((e) => e.ward === "PHU_HO")).toHaveLength(84);
    expect(MAP_SHEET_REFERENCE.filter((e) => e.ward === "HA_THACH")).toHaveLength(59);
    expect(MAP_SHEET_REFERENCE.filter((e) => e.ward === "PHONG_CHAU_CU")).toHaveLength(21);
  });

  it("mã đơn vị hành chính mới khớp với mẫu PL3", () => {
    expect(NEW_WARD_CODE).toBe("07954");
  });

  it("tờ mới phủ kín dải 1–164, không trùng, không khuyết", () => {
    const newSheets = MAP_SHEET_REFERENCE.map((e) => Number(e.newSheet)).sort((a, b) => a - b);
    expect(new Set(newSheets).size).toBe(164);
    expect(newSheets[0]).toBe(1);
    expect(newSheets[163]).toBe(164);
  });
});

describe("lookupNewMapSheet", () => {
  it("Phú Hộ giữ nguyên số tờ", () => {
    expect(lookupNewMapSheet("PHU_HO", "7")).toEqual({
      status: "RESOLVED",
      newSheet: "7",
      scale: "1/1000",
    });
    expect(lookupNewMapSheet("PHU_HO", "84")).toMatchObject({ newSheet: "84" });
  });

  it("Hà Thạch dịch thêm 84", () => {
    expect(lookupNewMapSheet("HA_THACH", "1")).toMatchObject({ newSheet: "85" });
    expect(lookupNewMapSheet("HA_THACH", "59")).toMatchObject({ newSheet: "143" });
  });

  it("Phong Châu cũ nằm ở dải 144–164", () => {
    expect(lookupNewMapSheet("PHONG_CHAU_CU", "1")).toMatchObject({ newSheet: "144" });
    expect(lookupNewMapSheet("PHONG_CHAU_CU", "29")).toMatchObject({ newSheet: "164" });
  });

  /** Số tờ trên GCN hay được viết có số 0 ở đầu — PL3 mẫu ghi "07", "06". */
  it("bỏ qua số 0 đứng đầu", () => {
    expect(lookupNewMapSheet("PHU_HO", "07")).toMatchObject({ newSheet: "7" });
    expect(lookupNewMapSheet("HA_THACH", "006")).toMatchObject({ newSheet: "90" });
  });

  /**
   * Ca quan trọng nhất: phường Phong Châu cũ có hai bộ bản đồ cùng đánh số từ 1. Tờ 7 tỷ lệ
   * 1/500 ra tờ 150, tờ 7 tỷ lệ 1/1000 ra tờ 156. Không có tỷ lệ thì KHÔNG được đoán.
   */
  it("báo mập mờ với tờ 7 của Phong Châu cũ khi không biết tỷ lệ", () => {
    const result = lookupNewMapSheet("PHONG_CHAU_CU", "7");
    expect(result.status).toBe("AMBIGUOUS");
    if (result.status !== "AMBIGUOUS") throw new Error("sai nhánh");
    expect(result.candidates.map((c) => c.newSheet).sort()).toEqual(["150", "156"]);
  });

  it("gỡ được mập mờ khi GCN có ghi tỷ lệ", () => {
    expect(lookupNewMapSheet("PHONG_CHAU_CU", "7", "1/500")).toMatchObject({ newSheet: "150" });
    expect(lookupNewMapSheet("PHONG_CHAU_CU", "7", "1/1000")).toMatchObject({ newSheet: "156" });
  });

  it("tờ 7 là trường hợp mập mờ duy nhất trong toàn bảng", () => {
    const ambiguous: string[] = [];
    for (const ward of OLD_WARDS) {
      const sheets = new Set(
        MAP_SHEET_REFERENCE.filter((e) => e.ward === ward).map((e) => e.oldSheet),
      );
      for (const sheet of sheets) {
        if (lookupNewMapSheet(ward, sheet).status === "AMBIGUOUS") {
          ambiguous.push(`${ward}/${sheet}`);
        }
      }
    }
    expect(ambiguous).toEqual(["PHONG_CHAU_CU/7"]);
  });

  /** Không có trong bảng — nhiều khả năng GCN cấp theo bản đồ giấy, cán bộ xử lý thủ công. */
  it("trả NOT_FOUND thay vì đoán khi tờ không có trong bảng", () => {
    expect(lookupNewMapSheet("PHU_HO", "85").status).toBe("NOT_FOUND");
    expect(lookupNewMapSheet("HA_THACH", "60").status).toBe("NOT_FOUND");
    expect(lookupNewMapSheet("PHONG_CHAU_CU", "20").status).toBe("NOT_FOUND");
    expect(lookupNewMapSheet("PHU_HO", "").status).toBe("NOT_FOUND");
  });
});
