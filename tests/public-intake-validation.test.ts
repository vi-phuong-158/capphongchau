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
    roleOnCertificate: "CA_NHAN",
    hasDistinctCurrentUser: false,
    currentUserName: "",
    currentUserCitizenId: "",
    currentUserAddress: "",
    changeReason: "",
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

  /**
   * PL3 mẫu có CCCD ở cả ba dòng hộ gia đình (CCCD của chủ hộ). Trước 2026-07-22 chọn "Hộ gia đình"
   * là bỏ qua toàn bộ phần định danh, nộp được hồ sơ chỉ với một cái tên.
   */
  it("bắt buộc CCCD với hộ gia đình — không còn là lối thoát bỏ qua định danh", () => {
    const draft = completeDraft();
    draft.owners[0] = {
      ...draft.owners[0],
      ownerType: "HO_GIA_DINH",
      identityNumber: "",
      roleOnCertificate: "CHU_HO",
    };

    expect(validateDraftForSubmit(draft)).toContain("12 chữ số");
  });

  it("bắt buộc CCCD với đồng sử dụng", () => {
    const draft = completeDraft();
    draft.owners[0] = {
      ...draft.owners[0],
      ownerType: "DONG_SU_DUNG",
      identityNumber: "",
      roleOnCertificate: "THANH_VIEN",
    };

    expect(validateDraftForSubmit(draft)).toContain("12 chữ số");
  });

  it("tổ chức miễn CCCD nhưng phải có mã số thuế và trụ sở", () => {
    const base = completeDraft();
    base.owners[0] = {
      ...base.owners[0],
      ownerType: "TO_CHUC",
      fullName: "Công ty Demo",
      identityNumber: "",
      dateOfBirth: "",
      gender: "",
      roleOnCertificate: "NGUOI_DAI_DIEN",
    };
    expect(validateDraftForSubmit(base)).toContain("Mã số thuế");

    const withTaxCode = structuredClone(base);
    withTaxCode.owners[0].identityNumber = "0123456789";
    expect(validateDraftForSubmit(withTaxCode)).toBeNull();

    const branch = structuredClone(withTaxCode);
    branch.owners[0].identityNumber = "0123456789-001";
    expect(validateDraftForSubmit(branch)).toBeNull();

    const noOffice = structuredClone(withTaxCode);
    noOffice.owners[0].residenceAddress = "";
    expect(validateDraftForSubmit(noOffice)).toContain("trụ sở");
  });

  /**
   * PL3 cột O, P và trường 14, 15 — người sử dụng hiện tại khi người trên GCN đã mất / đã sang tên.
   * Khi bật, người trên GCN được miễn CCCD/ảnh, đổi lại phải khai đủ người sử dụng hiện tại.
   */
  it("người trên GCN đã mất: miễn CCCD của họ, nhưng bắt khai đủ người sử dụng hiện tại", () => {
    const draft = completeDraft();
    draft.owners[0] = {
      ...draft.owners[0],
      identityNumber: "",
      dateOfBirth: "",
      gender: "",
      residenceAddress: "",
      hasDistinctCurrentUser: true,
    };
    // Thiếu toàn bộ thông tin người sử dụng hiện tại.
    expect(validateDraftForSubmit(draft)).toContain("người sử dụng hiện tại");

    const filled = structuredClone(draft);
    filled.owners[0].currentUserName = "Nguyễn Văn Thừa Kế";
    filled.owners[0].currentUserCitizenId = "025167000291";
    filled.owners[0].currentUserAddress = "KDC Phú Cường, phường Phong Châu";
    filled.owners[0].changeReason = "THUA_KE";
    expect(validateDraftForSubmit(filled)).toBeNull();
  });

  it("người sử dụng hiện tại phải có CCCD 12 số và lý do trong danh mục", () => {
    const base = completeDraft();
    base.owners[0] = {
      ...base.owners[0],
      identityNumber: "",
      hasDistinctCurrentUser: true,
      currentUserName: "Người Thừa Kế",
      currentUserCitizenId: "025167000291",
      currentUserAddress: "Phong Châu",
      changeReason: "THUA_KE",
    };
    expect(validateDraftForSubmit(base)).toBeNull();

    const badId = structuredClone(base);
    badId.owners[0].currentUserCitizenId = "123";
    expect(validateDraftForSubmit(badId)).toContain("người sử dụng hiện tại phải gồm đúng 12");

    const badReason = structuredClone(base);
    badReason.owners[0].changeReason = "KHONG_BIET";
    expect(validateDraftForSubmit(badReason)).toContain("lý do thay đổi");
  });

  /** Bộ mã cũ (`CHU_SU_DUNG`…) không trùng giá trị nào trong dropdown của PL3. */
  it("từ chối vai trò ngoài danh mục trường 13 của PL3", () => {
    const draft = completeDraft();
    draft.owners[0] = { ...draft.owners[0], roleOnCertificate: "CHU_SU_DUNG" };

    expect(validateDraftForSubmit(draft)).toContain("không thuộc danh mục");
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

  /** Dòng 9 của `Tai lieu/PL3.xlsx`: thửa 29,16 m² nhưng loại đất ghi 29,2 m². */
  it("chấp nhận sai lệch làm tròn có thật trong PL3 mẫu", () => {
    const draft = completeDraft();
    draft.parcels[0].area = "29.16";
    draft.parcels[0].landUses[0] = { ...draft.parcels[0].landUses[0], area: "29.2" };

    expect(validateDraftForSubmit(draft)).toBeNull();
  });

  it("vẫn bắt lệch vượt biên làm tròn", () => {
    const draft = completeDraft();
    draft.parcels[0].area = "29.16";
    draft.parcels[0].landUses[0] = { ...draft.parcels[0].landUses[0], area: "30" };

    expect(validateDraftForSubmit(draft)).toContain("vượt quá diện tích thửa");
  });

  /** PL3 chỉ có ba bộ cột loại đất; dòng thứ tư sẽ mất khi xuất nếu không chặn từ đây. */
  it("giới hạn 3 dòng mục đích sử dụng mỗi thửa", () => {
    const draft = completeDraft();
    const template = draft.parcels[0].landUses[0];
    draft.parcels[0].landUses = [1, 2, 3, 4].map((n) => ({ ...template, id: `use-${n}` }));

    expect(validateDraftForSubmit(draft)).toContain("tối đa 3");
  });

  it("cho phép đúng 3 dòng mục đích", () => {
    const draft = completeDraft();
    const template = draft.parcels[0].landUses[0];
    draft.parcels[0].landUses = [1, 2, 3].map((n) => ({ ...template, id: `use-${n}` }));

    expect(validateDraftForSubmit(draft)).toBeNull();
  });
});
