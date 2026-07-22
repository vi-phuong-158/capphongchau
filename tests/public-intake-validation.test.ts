import { describe, expect, it } from "vitest";

import { emptyDraft } from "@/modules/public-intake/types";
import { validateDraftForSave, validateDraftForSubmit } from "@/modules/public-intake/validation";

function completeDraft() {
  const draft = emptyDraft("owner-1", "parcel-1", "use-1");
  draft.phone = "0987654321";
  draft.consentAccepted = true;
  draft.certificate = {
    issueNumber: "GCN-001",
    issueDate: "2016-03-11",
    registryNumber: "CS777",
  };
  draft.owners[0] = {
    id: "owner-1",
    ownerType: "CA_NHAN",
    fullName: "Trần Thị Demo",
    identityNumber: "098765432109",
    dateOfBirth: "1990-01-01",
    gender: "NU",
    residenceAddress: "Phường Phong Châu, Phú Thọ",
    identitySource: "MANUAL",
    qrPayloadHash: "",
    qrDecoderVersion: "",
    qrParserVersion: "",
    identityStatus: "MANUAL_COMPLETE",
    identityConfirmedAt: "",
    roleOnCertificate: "CHU_SU_DUNG",
  };
  draft.parcels[0] = {
    ...draft.parcels[0],
    addressOnCertificate: "Khu Thống Nhất, phường Phong Châu",
    oldWard: "PHONG_CHAU_CU",
    area: "220",
    landUses: [
      {
        id: "use-1",
        purposeCode: "ONT",
        originCode: "CN_QSD",
        formCode: "RIENG",
        termCode: "LAU_DAI",
        area: "",
      },
    ],
  };
  return draft;
}

describe("validateDraftForSave", () => {
  it("cho phép nháp còn trống vì người dân lưu theo từng bước", () => {
    expect(validateDraftForSave(emptyDraft("a", "b", "c"))).toBeNull();
  });

  it("từ chối số điện thoại sai định dạng dù đang là nháp", () => {
    const draft = emptyDraft("a", "b", "c");
    draft.phone = "002";

    expect(validateDraftForSave(draft)).toContain("Số điện thoại");
  });
});

describe("validateDraftForSubmit", () => {
  it("chấp nhận bản kê khai đủ 15 trường Phụ lục 8", () => {
    expect(validateDraftForSubmit(completeDraft())).toBeNull();
  });

  it("bắt buộc có số điện thoại liên hệ", () => {
    const draft = completeDraft();
    draft.phone = "";

    expect(validateDraftForSubmit(draft)).toContain("số điện thoại");
  });

  it("bắt buộc đủ số phát hành, ngày cấp và số vào sổ", () => {
    const draft = completeDraft();
    draft.certificate = { ...draft.certificate, registryNumber: "" };

    expect(validateDraftForSubmit(draft)).toContain("Giấy chứng nhận");
  });

  it("bắt buộc CCCD 12 số với cá nhân", () => {
    const draft = completeDraft();
    draft.owners[0] = { ...draft.owners[0], identityNumber: "123" };

    expect(validateDraftForSubmit(draft)).toContain("12 chữ số");
  });

  it("bắt buộc ngày sinh hợp lệ khi QR không đọc được", () => {
    const draft = completeDraft();
    draft.owners[0] = { ...draft.owners[0], dateOfBirth: "1990-02-31" };

    expect(validateDraftForSubmit(draft)).toContain("Ngày sinh");
  });

  it("không bắt buộc CCCD với tổ chức", () => {
    const draft = completeDraft();
    draft.owners[0] = {
      ...draft.owners[0],
      ownerType: "TO_CHUC",
      fullName: "Công ty Demo",
      identityNumber: "",
      roleOnCertificate: "DAI_DIEN_TO_CHUC",
    };

    expect(validateDraftForSubmit(draft)).toBeNull();
  });

  it("cho phép số tờ và số thửa để trống theo đúng Phụ lục 8", () => {
    const draft = completeDraft();
    draft.parcels[0] = { ...draft.parcels[0], mapSheetNumber: "", parcelNumber: "" };

    expect(validateDraftForSubmit(draft)).toBeNull();
  });

  it("bắt buộc đủ loại đất, nguồn gốc, hình thức và thời hạn", () => {
    const draft = completeDraft();
    draft.parcels[0].landUses[0] = { ...draft.parcels[0].landUses[0], originCode: "" };

    expect(validateDraftForSubmit(draft)).toContain("nguồn gốc");
  });

  /**
   * Trường này không thuộc Phụ lục 8 nhưng bắt buộc để quy đổi số tờ bản đồ (trường 19 của PL3):
   * ba xã cũ đều đánh số tờ từ 1 nên thiếu nó thì "tờ 5" có ba đáp án.
   */
  it("bắt buộc chọn đơn vị hành chính cũ của thửa đất", () => {
    const draft = completeDraft();
    draft.parcels[0].oldWard = "";
    expect(validateDraftForSubmit(draft)).toBe("Thiếu đơn vị hành chính cũ của thửa đất.");
  });

  it('chấp nhận "Không rõ" — thà biết là chưa xác định còn hơn để trống', () => {
    const draft = completeDraft();
    draft.parcels[0].oldWard = "KHONG_RO";
    expect(validateDraftForSubmit(draft)).toBeNull();
  });

  it("từ chối mã đơn vị cũ không có trong danh mục", () => {
    const draft = completeDraft();
    draft.parcels[0].oldWard = "XA_KHAC";
    expect(validateDraftForSubmit(draft)).toBe("Thiếu đơn vị hành chính cũ của thửa đất.");
  });

  it("chỉ kiểm tổng diện tích theo mục đích khi người dân có nhập", () => {
    const withoutAreas = completeDraft();
    expect(validateDraftForSubmit(withoutAreas)).toBeNull();

    const exceeding = completeDraft();
    exceeding.parcels[0].landUses[0] = { ...exceeding.parcels[0].landUses[0], area: "300" };
    expect(validateDraftForSubmit(exceeding)).toContain("vượt quá diện tích thửa");
  });
});
