import { describe, expect, it } from "vitest";

import {
  CERTIFICATE_ROLE_OPTIONS,
  LAND_PURPOSE_OPTIONS,
  REFERENCE_CATALOG_VERSION,
  REFERENCE_IS_PLACEHOLDER,
  normalizeCertificateRole,
} from "@/modules/public-intake/reference";
import { OWNER_TYPES, OWNER_TYPE_LABELS } from "@/modules/public-intake/types";

describe("reference catalog", () => {
  it("uses the published land-type codes for the demo catalog", () => {
    expect(REFERENCE_IS_PLACEHOLDER).toBe(false);
    expect(REFERENCE_CATALOG_VERSION).toMatch(/^TT08-2024-BTNMT/);
    expect(LAND_PURPOSE_OPTIONS).toEqual(
      expect.arrayContaining([
        { code: "ONT", label: "Đất ở tại nông thôn" },
        { code: "ODT", label: "Đất ở tại đô thị" },
        { code: "LUC", label: "Đất chuyên trồng lúa" },
      ]),
    );
  });
});

/**
 * Hai danh mục này là chuỗi ghi thẳng ra file nộp, lấy từ ràng buộc dữ liệu nhúng trong
 * `Tai lieu/PL3.xlsx`. Test khóa cả **thứ tự** để một lần sửa nhãn cho "gọn" không âm thầm làm
 * lệch file nộp.
 */
describe("danh mục trường 12 và 13 của PL3", () => {
  it("trường 12 — pháp nhân trên GCN", () => {
    expect(OWNER_TYPES.map((type) => OWNER_TYPE_LABELS[type])).toEqual([
      "Cá nhân",
      "Hộ gia đình",
      "Vợ chồng",
      "Đồng sử dụng",
      "Cộng đồng dân cư",
      "Tổ chức",
    ]);
  });

  it("trường 13 — vai trò pháp nhân trên GCN", () => {
    expect(CERTIFICATE_ROLE_OPTIONS.map((option) => option.label)).toEqual([
      "Cá nhân",
      "Chủ hộ",
      "Chồng",
      "Vợ",
      "Người đại diện",
      "Thành viên",
    ]);
  });

  it("đổi được bốn mã vai trò cũ, và không đoán mã lạ", () => {
    expect(normalizeCertificateRole("CHU_SU_DUNG")).toBe("CA_NHAN");
    expect(normalizeCertificateRole("DAI_DIEN_HO")).toBe("CHU_HO");
    expect(normalizeCertificateRole("DAI_DIEN_TO_CHUC")).toBe("NGUOI_DAI_DIEN");
    expect(normalizeCertificateRole("DONG_SU_DUNG")).toBe("THANH_VIEN");

    expect(normalizeCertificateRole("CHU_HO")).toBe("CHU_HO");
    expect(normalizeCertificateRole("KHONG_BIET")).toBe("");
    expect(normalizeCertificateRole("")).toBe("");
  });
});
