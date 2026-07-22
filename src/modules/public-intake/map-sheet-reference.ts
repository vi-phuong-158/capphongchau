/**
 * Bảng tham chiếu tờ bản đồ: từ tờ ghi trên GCN (bản đồ trước sáp nhập) sang tờ bản đồ của
 * phường Phong Châu mới. Phục vụ trường 19 "Số hiệu tờ trên bản đồ địa chính" của PL3.
 *
 * Nguồn: `Tai lieu/DS THAM CHIEU PHUTHO VINHPHUC HOABINH 25052026.pdf`, trang 35–36 và 129–130.
 * Đã lọc đúng 164 dòng có xã mới là Phường Phong Châu (mã 07954).
 * Sinh tự động — sửa bảng gốc thì sinh lại, đừng sửa tay từng dòng.
 *
 * Ba đơn vị cũ gộp thành Phong Châu mới:
 * - Xã Phú Hộ (07954): tờ 1–84 giữ nguyên số.
 * - Xã Hà Thạch (07963): tờ 1–59 thành tờ 85–143.
 * - Phường Phong Châu cũ (07945): thành tờ 144–164.
 *
 * QUAN TRỌNG — khóa tra cứu gồm cả TỶ LỆ, không chỉ số tờ. Phường Phong Châu cũ có hai bộ bản đồ
 * đánh số độc lập: tờ 7 tỷ lệ 1/500 ra tờ 150, còn tờ 7 tỷ lệ 1/1000 ra tờ 156. GCN thường không
 * ghi tỷ lệ, nên trường hợp này bắt buộc cán bộ đối chiếu thủ công.
 */

/** Đơn vị hành chính cũ nơi cấp GCN — phải biết mới tra được, vì ba xã đều đánh số tờ từ 1. */
export const OLD_WARDS = ["PHU_HO", "HA_THACH", "PHONG_CHAU_CU"] as const;
export type OldWard = (typeof OLD_WARDS)[number];

export const OLD_WARD_LABELS: Record<OldWard, string> = {
  PHU_HO: "Xã Phú Hộ (cũ)",
  HA_THACH: "Xã Hà Thạch (cũ)",
  PHONG_CHAU_CU: "Phường Phong Châu (cũ)",
};

export const NEW_WARD_CODE = "07954";
export const NEW_WARD_NAME = "Phường Phong Châu";

export interface MapSheetEntry {
  readonly ward: OldWard;
  readonly oldSheet: string;
  readonly scale: string;
  readonly newSheet: string;
}

export const MAP_SHEET_REFERENCE: readonly MapSheetEntry[] = [
  { ward: "PHU_HO", oldSheet: "1", scale: "1/1000", newSheet: "1" },
  { ward: "PHU_HO", oldSheet: "2", scale: "1/1000", newSheet: "2" },
  { ward: "PHU_HO", oldSheet: "3", scale: "1/1000", newSheet: "3" },
  { ward: "PHU_HO", oldSheet: "4", scale: "1/1000", newSheet: "4" },
  { ward: "PHU_HO", oldSheet: "5", scale: "1/1000", newSheet: "5" },
  { ward: "PHU_HO", oldSheet: "6", scale: "1/1000", newSheet: "6" },
  { ward: "PHU_HO", oldSheet: "7", scale: "1/1000", newSheet: "7" },
  { ward: "PHU_HO", oldSheet: "8", scale: "1/1000", newSheet: "8" },
  { ward: "PHU_HO", oldSheet: "9", scale: "1/1000", newSheet: "9" },
  { ward: "PHU_HO", oldSheet: "10", scale: "1/1000", newSheet: "10" },
  { ward: "PHU_HO", oldSheet: "11", scale: "1/1000", newSheet: "11" },
  { ward: "PHU_HO", oldSheet: "12", scale: "1/1000", newSheet: "12" },
  { ward: "PHU_HO", oldSheet: "13", scale: "1/1000", newSheet: "13" },
  { ward: "PHU_HO", oldSheet: "14", scale: "1/1000", newSheet: "14" },
  { ward: "PHU_HO", oldSheet: "15", scale: "1/1000", newSheet: "15" },
  { ward: "PHU_HO", oldSheet: "16", scale: "1/1000", newSheet: "16" },
  { ward: "PHU_HO", oldSheet: "17", scale: "1/1000", newSheet: "17" },
  { ward: "PHU_HO", oldSheet: "18", scale: "1/1000", newSheet: "18" },
  { ward: "PHU_HO", oldSheet: "19", scale: "1/1000", newSheet: "19" },
  { ward: "PHU_HO", oldSheet: "20", scale: "1/1000", newSheet: "20" },
  { ward: "PHU_HO", oldSheet: "21", scale: "1/1000", newSheet: "21" },
  { ward: "PHU_HO", oldSheet: "22", scale: "1/1000", newSheet: "22" },
  { ward: "PHU_HO", oldSheet: "23", scale: "1/1000", newSheet: "23" },
  { ward: "PHU_HO", oldSheet: "24", scale: "1/1000", newSheet: "24" },
  { ward: "PHU_HO", oldSheet: "25", scale: "1/1000", newSheet: "25" },
  { ward: "PHU_HO", oldSheet: "26", scale: "1/1000", newSheet: "26" },
  { ward: "PHU_HO", oldSheet: "27", scale: "1/1000", newSheet: "27" },
  { ward: "PHU_HO", oldSheet: "28", scale: "1/1000", newSheet: "28" },
  { ward: "PHU_HO", oldSheet: "29", scale: "1/1000", newSheet: "29" },
  { ward: "PHU_HO", oldSheet: "30", scale: "1/1000", newSheet: "30" },
  { ward: "PHU_HO", oldSheet: "31", scale: "1/1000", newSheet: "31" },
  { ward: "PHU_HO", oldSheet: "32", scale: "1/1000", newSheet: "32" },
  { ward: "PHU_HO", oldSheet: "33", scale: "1/1000", newSheet: "33" },
  { ward: "PHU_HO", oldSheet: "34", scale: "1/1000", newSheet: "34" },
  { ward: "PHU_HO", oldSheet: "35", scale: "1/1000", newSheet: "35" },
  { ward: "PHU_HO", oldSheet: "36", scale: "1/1000", newSheet: "36" },
  { ward: "PHU_HO", oldSheet: "37", scale: "1/1000", newSheet: "37" },
  { ward: "PHU_HO", oldSheet: "38", scale: "1/1000", newSheet: "38" },
  { ward: "PHU_HO", oldSheet: "39", scale: "1/1000", newSheet: "39" },
  { ward: "PHU_HO", oldSheet: "40", scale: "1/1000", newSheet: "40" },
  { ward: "PHU_HO", oldSheet: "41", scale: "1/1000", newSheet: "41" },
  { ward: "PHU_HO", oldSheet: "42", scale: "1/1000", newSheet: "42" },
  { ward: "PHU_HO", oldSheet: "43", scale: "1/1000", newSheet: "43" },
  { ward: "PHU_HO", oldSheet: "44", scale: "1/1000", newSheet: "44" },
  { ward: "PHU_HO", oldSheet: "45", scale: "1/1000", newSheet: "45" },
  { ward: "PHU_HO", oldSheet: "46", scale: "1/1000", newSheet: "46" },
  { ward: "PHU_HO", oldSheet: "47", scale: "1/1000", newSheet: "47" },
  { ward: "PHU_HO", oldSheet: "48", scale: "1/1000", newSheet: "48" },
  { ward: "PHU_HO", oldSheet: "49", scale: "1/1000", newSheet: "49" },
  { ward: "PHU_HO", oldSheet: "50", scale: "1/1000", newSheet: "50" },
  { ward: "PHU_HO", oldSheet: "51", scale: "1/1000", newSheet: "51" },
  { ward: "PHU_HO", oldSheet: "52", scale: "1/1000", newSheet: "52" },
  { ward: "PHU_HO", oldSheet: "53", scale: "1/1000", newSheet: "53" },
  { ward: "PHU_HO", oldSheet: "54", scale: "1/1000", newSheet: "54" },
  { ward: "PHU_HO", oldSheet: "55", scale: "1/1000", newSheet: "55" },
  { ward: "PHU_HO", oldSheet: "56", scale: "1/1000", newSheet: "56" },
  { ward: "PHU_HO", oldSheet: "57", scale: "1/1000", newSheet: "57" },
  { ward: "PHU_HO", oldSheet: "58", scale: "1/1000", newSheet: "58" },
  { ward: "PHU_HO", oldSheet: "59", scale: "1/1000", newSheet: "59" },
  { ward: "PHU_HO", oldSheet: "60", scale: "1/1000", newSheet: "60" },
  { ward: "PHU_HO", oldSheet: "61", scale: "1/1000", newSheet: "61" },
  { ward: "PHU_HO", oldSheet: "62", scale: "1/1000", newSheet: "62" },
  { ward: "PHU_HO", oldSheet: "63", scale: "1/1000", newSheet: "63" },
  { ward: "PHU_HO", oldSheet: "64", scale: "1/1000", newSheet: "64" },
  { ward: "PHU_HO", oldSheet: "65", scale: "1/1000", newSheet: "65" },
  { ward: "PHU_HO", oldSheet: "66", scale: "1/1000", newSheet: "66" },
  { ward: "PHU_HO", oldSheet: "67", scale: "1/1000", newSheet: "67" },
  { ward: "PHU_HO", oldSheet: "68", scale: "1/1000", newSheet: "68" },
  { ward: "PHU_HO", oldSheet: "69", scale: "1/1000", newSheet: "69" },
  { ward: "PHU_HO", oldSheet: "70", scale: "1/1000", newSheet: "70" },
  { ward: "PHU_HO", oldSheet: "71", scale: "1/1000", newSheet: "71" },
  { ward: "PHU_HO", oldSheet: "72", scale: "1/1000", newSheet: "72" },
  { ward: "PHU_HO", oldSheet: "73", scale: "1/1000", newSheet: "73" },
  { ward: "PHU_HO", oldSheet: "74", scale: "1/1000", newSheet: "74" },
  { ward: "PHU_HO", oldSheet: "75", scale: "1/1000", newSheet: "75" },
  { ward: "PHU_HO", oldSheet: "76", scale: "1/1000", newSheet: "76" },
  { ward: "PHU_HO", oldSheet: "77", scale: "1/1000", newSheet: "77" },
  { ward: "PHU_HO", oldSheet: "78", scale: "1/1000", newSheet: "78" },
  { ward: "PHU_HO", oldSheet: "79", scale: "1/1000", newSheet: "79" },
  { ward: "PHU_HO", oldSheet: "80", scale: "1/1000", newSheet: "80" },
  { ward: "PHU_HO", oldSheet: "81", scale: "1/1000", newSheet: "81" },
  { ward: "PHU_HO", oldSheet: "82", scale: "1/1000", newSheet: "82" },
  { ward: "PHU_HO", oldSheet: "83", scale: "1/1000", newSheet: "83" },
  { ward: "PHU_HO", oldSheet: "84", scale: "1/1000", newSheet: "84" },
  { ward: "HA_THACH", oldSheet: "1", scale: "1/1000", newSheet: "85" },
  { ward: "HA_THACH", oldSheet: "2", scale: "1/1000", newSheet: "86" },
  { ward: "HA_THACH", oldSheet: "3", scale: "1/1000", newSheet: "87" },
  { ward: "HA_THACH", oldSheet: "4", scale: "1/1000", newSheet: "88" },
  { ward: "HA_THACH", oldSheet: "5", scale: "1/1000", newSheet: "89" },
  { ward: "HA_THACH", oldSheet: "6", scale: "1/1000", newSheet: "90" },
  { ward: "HA_THACH", oldSheet: "7", scale: "1/1000", newSheet: "91" },
  { ward: "HA_THACH", oldSheet: "8", scale: "1/1000", newSheet: "92" },
  { ward: "HA_THACH", oldSheet: "9", scale: "1/1000", newSheet: "93" },
  { ward: "HA_THACH", oldSheet: "10", scale: "1/1000", newSheet: "94" },
  { ward: "HA_THACH", oldSheet: "11", scale: "1/1000", newSheet: "95" },
  { ward: "HA_THACH", oldSheet: "12", scale: "1/1000", newSheet: "96" },
  { ward: "HA_THACH", oldSheet: "13", scale: "1/1000", newSheet: "97" },
  { ward: "HA_THACH", oldSheet: "14", scale: "1/1000", newSheet: "98" },
  { ward: "HA_THACH", oldSheet: "15", scale: "1/1000", newSheet: "99" },
  { ward: "HA_THACH", oldSheet: "16", scale: "1/1000", newSheet: "100" },
  { ward: "HA_THACH", oldSheet: "17", scale: "1/1000", newSheet: "101" },
  { ward: "HA_THACH", oldSheet: "18", scale: "1/1000", newSheet: "102" },
  { ward: "HA_THACH", oldSheet: "19", scale: "1/1000", newSheet: "103" },
  { ward: "HA_THACH", oldSheet: "20", scale: "1/1000", newSheet: "104" },
  { ward: "HA_THACH", oldSheet: "21", scale: "1/1000", newSheet: "105" },
  { ward: "HA_THACH", oldSheet: "22", scale: "1/1000", newSheet: "106" },
  { ward: "HA_THACH", oldSheet: "23", scale: "1/1000", newSheet: "107" },
  { ward: "HA_THACH", oldSheet: "24", scale: "1/1000", newSheet: "108" },
  { ward: "HA_THACH", oldSheet: "25", scale: "1/1000", newSheet: "109" },
  { ward: "HA_THACH", oldSheet: "26", scale: "1/1000", newSheet: "110" },
  { ward: "HA_THACH", oldSheet: "27", scale: "1/1000", newSheet: "111" },
  { ward: "HA_THACH", oldSheet: "28", scale: "1/1000", newSheet: "112" },
  { ward: "HA_THACH", oldSheet: "29", scale: "1/1000", newSheet: "113" },
  { ward: "HA_THACH", oldSheet: "30", scale: "1/1000", newSheet: "114" },
  { ward: "HA_THACH", oldSheet: "31", scale: "1/1000", newSheet: "115" },
  { ward: "HA_THACH", oldSheet: "32", scale: "1/1000", newSheet: "116" },
  { ward: "HA_THACH", oldSheet: "33", scale: "1/1000", newSheet: "117" },
  { ward: "HA_THACH", oldSheet: "34", scale: "1/1000", newSheet: "118" },
  { ward: "HA_THACH", oldSheet: "35", scale: "1/1000", newSheet: "119" },
  { ward: "HA_THACH", oldSheet: "36", scale: "1/1000", newSheet: "120" },
  { ward: "HA_THACH", oldSheet: "37", scale: "1/1000", newSheet: "121" },
  { ward: "HA_THACH", oldSheet: "38", scale: "1/1000", newSheet: "122" },
  { ward: "HA_THACH", oldSheet: "39", scale: "1/1000", newSheet: "123" },
  { ward: "HA_THACH", oldSheet: "40", scale: "1/1000", newSheet: "124" },
  { ward: "HA_THACH", oldSheet: "41", scale: "1/1000", newSheet: "125" },
  { ward: "HA_THACH", oldSheet: "42", scale: "1/1000", newSheet: "126" },
  { ward: "HA_THACH", oldSheet: "43", scale: "1/1000", newSheet: "127" },
  { ward: "HA_THACH", oldSheet: "44", scale: "1/1000", newSheet: "128" },
  { ward: "HA_THACH", oldSheet: "45", scale: "1/1000", newSheet: "129" },
  { ward: "HA_THACH", oldSheet: "46", scale: "1/1000", newSheet: "130" },
  { ward: "HA_THACH", oldSheet: "47", scale: "1/1000", newSheet: "131" },
  { ward: "HA_THACH", oldSheet: "48", scale: "1/1000", newSheet: "132" },
  { ward: "HA_THACH", oldSheet: "49", scale: "1/1000", newSheet: "133" },
  { ward: "HA_THACH", oldSheet: "50", scale: "1/1000", newSheet: "134" },
  { ward: "HA_THACH", oldSheet: "51", scale: "1/1000", newSheet: "135" },
  { ward: "HA_THACH", oldSheet: "52", scale: "1/1000", newSheet: "136" },
  { ward: "HA_THACH", oldSheet: "53", scale: "1/1000", newSheet: "137" },
  { ward: "HA_THACH", oldSheet: "54", scale: "1/1000", newSheet: "138" },
  { ward: "HA_THACH", oldSheet: "55", scale: "1/1000", newSheet: "139" },
  { ward: "HA_THACH", oldSheet: "56", scale: "1/1000", newSheet: "140" },
  { ward: "HA_THACH", oldSheet: "57", scale: "1/1000", newSheet: "141" },
  { ward: "HA_THACH", oldSheet: "58", scale: "1/1000", newSheet: "142" },
  { ward: "HA_THACH", oldSheet: "59", scale: "1/1000", newSheet: "143" },
  { ward: "PHONG_CHAU_CU", oldSheet: "1", scale: "1/500", newSheet: "144" },
  { ward: "PHONG_CHAU_CU", oldSheet: "2", scale: "1/500", newSheet: "145" },
  { ward: "PHONG_CHAU_CU", oldSheet: "3", scale: "1/500", newSheet: "146" },
  { ward: "PHONG_CHAU_CU", oldSheet: "4", scale: "1/500", newSheet: "147" },
  { ward: "PHONG_CHAU_CU", oldSheet: "5", scale: "1/500", newSheet: "148" },
  { ward: "PHONG_CHAU_CU", oldSheet: "6", scale: "1/500", newSheet: "149" },
  { ward: "PHONG_CHAU_CU", oldSheet: "7", scale: "1/500", newSheet: "150" },
  { ward: "PHONG_CHAU_CU", oldSheet: "8", scale: "1/500", newSheet: "151" },
  { ward: "PHONG_CHAU_CU", oldSheet: "9", scale: "1/500", newSheet: "152" },
  { ward: "PHONG_CHAU_CU", oldSheet: "10", scale: "1/500", newSheet: "153" },
  { ward: "PHONG_CHAU_CU", oldSheet: "11", scale: "1/500", newSheet: "154" },
  { ward: "PHONG_CHAU_CU", oldSheet: "12", scale: "1/500", newSheet: "155" },
  { ward: "PHONG_CHAU_CU", oldSheet: "7", scale: "1/1000", newSheet: "156" },
  { ward: "PHONG_CHAU_CU", oldSheet: "14", scale: "1/1000", newSheet: "157" },
  { ward: "PHONG_CHAU_CU", oldSheet: "15", scale: "1/1000", newSheet: "158" },
  { ward: "PHONG_CHAU_CU", oldSheet: "16", scale: "1/1000", newSheet: "159" },
  { ward: "PHONG_CHAU_CU", oldSheet: "22", scale: "1/1000", newSheet: "160" },
  { ward: "PHONG_CHAU_CU", oldSheet: "23", scale: "1/1000", newSheet: "161" },
  { ward: "PHONG_CHAU_CU", oldSheet: "24", scale: "1/1000", newSheet: "162" },
  { ward: "PHONG_CHAU_CU", oldSheet: "28", scale: "1/1000", newSheet: "163" },
  { ward: "PHONG_CHAU_CU", oldSheet: "29", scale: "1/1000", newSheet: "164" },
];

export type MapSheetLookup =
  /** Tra được đúng một tờ mới. */
  | { status: "RESOLVED"; newSheet: string; scale: string }
  /** Cùng số tờ nhưng hai tỷ lệ khác nhau — GCN không ghi tỷ lệ nên không tự quyết được. */
  | { status: "AMBIGUOUS"; candidates: readonly MapSheetEntry[] }
  /** Không có trong bảng: nhiều khả năng GCN cấp theo bản đồ giấy, cán bộ đối chiếu thủ công. */
  | { status: "NOT_FOUND" };

/**
 * Tra tờ bản đồ mới. Không bao giờ đoán: gặp mập mờ hoặc không thấy thì trả về trạng thái tương
 * ứng để cán bộ xử lý, tuyệt đối không tự chọn một ứng viên.
 *
 * @param scale Tỷ lệ nếu GCN có ghi — chỉ dùng để gỡ trường hợp mập mờ.
 */
export function lookupNewMapSheet(ward: OldWard, oldSheet: string, scale?: string): MapSheetLookup {
  // Số tờ trên GCN hay được viết "07", "7", " 7 " — so sánh theo giá trị số khi có thể.
  const wanted = oldSheet.trim().replace(/^0+(?=\d)/, "");
  const matches = MAP_SHEET_REFERENCE.filter(
    (entry) => entry.ward === ward && entry.oldSheet.replace(/^0+(?=\d)/, "") === wanted,
  );

  if (matches.length === 0) {
    return { status: "NOT_FOUND" };
  }
  if (matches.length === 1) {
    return { status: "RESOLVED", newSheet: matches[0].newSheet, scale: matches[0].scale };
  }

  const byScale = scale ? matches.filter((entry) => entry.scale === scale.trim()) : [];
  if (byScale.length === 1) {
    return { status: "RESOLVED", newSheet: byScale[0].newSheet, scale: byScale[0].scale };
  }

  return { status: "AMBIGUOUS", candidates: matches };
}
