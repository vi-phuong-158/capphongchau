/**
 * Phase 2 §7.3 — kiểm tra theo bước của wizard 4 bước.
 *
 * Trọng tâm là **những gì không còn chặn**: đó chính là các góp ý của cán bộ đi thu hồ sơ (quá
 * nhiều trường phải nhập, hộ dân bỏ dở). Mỗi test "không block vì..." tương ứng một rào cản đã gỡ.
 *
 * Thứ tự bước (2026-07-29): "Ảnh Giấy chứng nhận" đứng TRƯỚC "Người kê khai và CCCD" — số điện
 * thoại và ô đồng ý chuyển sang đầu bước 1, vì server chỉ tạo được bản kê khai (và chỉ từ đó mới
 * có thư mục Drive để tải ảnh) khi có cả hai. Xem `public-wizard-validation.ts` mục comment ở
 * `PUBLIC_WIZARD_STEPS`.
 */
import { describe, expect, it } from "vitest";

import {
  PUBLIC_WIZARD_STEPS,
  STEP_CERTIFICATE_UPLOAD,
  STEP_CONTACT_AND_IDENTITY,
  STEP_PARCEL_QUICK,
  STEP_REVIEW_SUBMIT,
  errorKeyForFieldPath,
  optionalSummary,
  ownerNeedsIdentityPhotos,
  submitChecklist,
  validatePublicWizardStep,
  type WizardValidationInput,
} from "@/modules/public-intake/public-wizard-validation";
import {
  emptyDraft,
  emptyLandUse,
  emptyOwner,
  emptyParcel,
  type IntakeDraft,
} from "@/modules/public-intake/types";

function draftWithOwner(): IntakeDraft {
  const draft = emptyDraft("owner-1", "parcel-1", "use-1");
  draft.phone = "0987654321";
  draft.consentAccepted = true;
  draft.owners[0] = { ...emptyOwner("owner-1"), fullName: "Nguyễn Văn Test" };
  return draft;
}

function input(overrides: Partial<WizardValidationInput> = {}): WizardValidationInput {
  return {
    step: STEP_CONTACT_AND_IDENTITY,
    draft: draftWithOwner(),
    hasReceipt: true,
    hasCertificate: "CO",
    certificateCount: "MOT",
    uploadedIdentitySides: { "owner-1": ["CITIZEN_ID_FRONT", "CITIZEN_ID_BACK"] },
    uploadedCertificateCount: 1,
    hasPendingUpload: false,
    hasFailedUpload: false,
    ...overrides,
  };
}

describe("Wizard V2 có đúng 4 bước", () => {
  it("danh sách bước", () => {
    expect(PUBLIC_WIZARD_STEPS).toEqual([
      "Ảnh Giấy chứng nhận",
      "Người kê khai và CCCD",
      "Thông tin thửa đất",
      "Kiểm tra và gửi",
    ]);
  });

  it("không còn bước tài sản và bước loại đất riêng", () => {
    expect(PUBLIC_WIZARD_STEPS).not.toContain("Tài sản");
    expect(PUBLIC_WIZARD_STEPS).not.toContain("Loại đất");
  });
});

describe("Bước 1 — ảnh Giấy chứng nhận", () => {
  const step = STEP_CERTIFICATE_UPLOAD;

  it("đủ phone + đồng ý + 1 ảnh thì đi tiếp được, dù bỏ trống toàn bộ thông tin GCN", () => {
    const draft = draftWithOwner();
    draft.certificate = { issueNumber: "", issueDate: "", registryNumber: "" };
    expect(validatePublicWizardStep(input({ step, draft }))).toEqual({});
  });

  it("giai đoạn trước khi tạo hồ sơ: hai câu hỏi sàng lọc luôn đã có giá trị mặc định", () => {
    // Không còn ô nhập cho hasCertificate/certificateCount trên màn hình — hệ thống tự gán
    // "CO"/"MOT". Test này khóa đúng điều đó: rỗng vẫn là trường hợp không xảy ra trong thực tế,
    // nhưng nếu ai đó quên gán mặc định thì phải chặn, không được âm thầm cho qua.
    const errors = validatePublicWizardStep(
      input({ step, hasReceipt: false, hasCertificate: "", certificateCount: "" }),
    );
    expect(errors.hasCertificate).toBeTruthy();
    expect(errors.certificateCount).toBeTruthy();
  });

  it("giai đoạn trước khi tạo hồ sơ không đòi tên chủ (chưa có màn hình nhập)", () => {
    const draft = draftWithOwner();
    draft.owners[0].fullName = "";
    const errors = validatePublicWizardStep(input({ step, hasReceipt: false, draft }));
    expect(errors["owner-0-name"]).toBeUndefined();
  });

  it("giai đoạn trước khi tạo hồ sơ không đòi ảnh Giấy chứng nhận — chưa có hồ sơ thì chưa có nơi tải ảnh", () => {
    const errors = validatePublicWizardStep(
      input({ step, hasReceipt: false, uploadedCertificateCount: 0 }),
    );
    expect(errors.certificatePhotos).toBeUndefined();
  });

  it("thiếu số điện thoại thì chặn đúng ô", () => {
    const draft = draftWithOwner();
    draft.phone = "12";
    expect(validatePublicWizardStep(input({ step, hasReceipt: false, draft })).phone).toBeTruthy();
  });

  it("chưa đồng ý thì chặn", () => {
    const draft = draftWithOwner();
    draft.consentAccepted = false;
    expect(
      validatePublicWizardStep(input({ step, hasReceipt: false, draft })).consent,
    ).toBeTruthy();
  });

  it("đã tạo hồ sơ rồi thì chưa có ảnh GCN nào là chặn", () => {
    const errors = validatePublicWizardStep(input({ step, uploadedCertificateCount: 0 }));
    expect(errors.certificatePhotos).toBe("Chưa có ảnh Giấy chứng nhận. Cần ít nhất một ảnh.");
  });

  it("ngày cấp nhập sai thì chặn đúng ô", () => {
    const draft = draftWithOwner();
    draft.certificate.issueDate = "2016-02-31";
    expect(validatePublicWizardStep(input({ step, draft })).issueDate).toBeTruthy();
  });

  it("lỗi của bước khác không rò sang bước này", () => {
    const draft = draftWithOwner();
    draft.owners[0].fullName = "";
    draft.parcels[0].area = "không phải số";
    expect(validatePublicWizardStep(input({ step, draft }))).toEqual({});
  });
});

describe("Bước 2 — người kê khai và CCCD", () => {
  it("đủ tên và hai mặt CCCD thì đi tiếp được", () => {
    expect(validatePublicWizardStep(input())).toEqual({});
  });

  it("thiếu tên chủ sử dụng thì chặn đúng owner", () => {
    const draft = draftWithOwner();
    draft.owners[0].fullName = "";
    expect(validatePublicWizardStep(input({ draft }))["owner-0-name"]).toBeTruthy();
  });

  it("thiếu ảnh CCCD báo riêng mặt trước và mặt sau", () => {
    const errors = validatePublicWizardStep(input({ uploadedIdentitySides: {} }));
    expect(errors["owner-0-front"]).toBe("Chưa có ảnh CCCD mặt trước.");
    expect(errors["owner-0-back"]).toBe("Chưa có ảnh CCCD mặt sau.");
  });

  it("thiếu riêng mặt sau chỉ báo mặt sau", () => {
    const errors = validatePublicWizardStep(
      input({ uploadedIdentitySides: { "owner-1": ["CITIZEN_ID_FRONT"] } }),
    );
    expect(errors["owner-0-front"]).toBeUndefined();
    expect(errors["owner-0-back"]).toBeTruthy();
  });

  it("KHÔNG block vì thiếu ngày sinh, giới tính, địa chỉ, vai trò, CCCD dạng chữ", () => {
    const draft = draftWithOwner();
    draft.owners[0] = {
      ...draft.owners[0],
      dateOfBirth: "",
      gender: "",
      residenceAddress: "",
      roleOnCertificate: "",
      identityNumber: "",
      identityStatus: "",
    };
    expect(validatePublicWizardStep(input({ draft }))).toEqual({});
  });

  it("KHÔNG block vì QR chưa đọc được (identityStatus rỗng)", () => {
    const draft = draftWithOwner();
    draft.owners[0].identityStatus = "PENDING_CONFIRMATION";
    expect(validatePublicWizardStep(input({ draft }))).toEqual({});
  });

  it("nhưng CCCD đã nhập sai định dạng thì block để người dân sửa hoặc xóa", () => {
    const draft = draftWithOwner();
    draft.owners[0].identityNumber = "01234567890";
    expect(validatePublicWizardStep(input({ draft }))["owner-0-id"]).toBeTruthy();
  });

  it("tổ chức không bị đòi ảnh CCCD", () => {
    const draft = draftWithOwner();
    draft.owners[0].ownerType = "TO_CHUC";
    expect(validatePublicWizardStep(input({ draft, uploadedIdentitySides: {} }))).toEqual({});
  });

  it("người trên GCN đã sang tên không bị đòi ảnh CCCD của họ", () => {
    const draft = draftWithOwner();
    draft.owners[0].hasDistinctCurrentUser = true;
    expect(validatePublicWizardStep(input({ draft, uploadedIdentitySides: {} }))).toEqual({});
  });

  it("còn ảnh đang tải thì chặn đi tiếp", () => {
    expect(validatePublicWizardStep(input({ hasPendingUpload: true })).uploadPending).toBeTruthy();
  });
});

describe("Bước 3 — thông tin thửa đất", () => {
  const step = STEP_PARCEL_QUICK;

  it("bỏ trống toàn bộ vẫn đi tiếp được", () => {
    const draft = draftWithOwner();
    draft.parcels[0] = emptyParcel("parcel-1", "use-1");
    expect(validatePublicWizardStep(input({ step, draft }))).toEqual({});
  });

  it("diện tích không phải số thì chặn đúng ô", () => {
    const draft = draftWithOwner();
    draft.parcels[0].area = "khoảng 200";
    expect(validatePublicWizardStep(input({ step, draft }))["parcel-0-area"]).toBeTruthy();
  });

  it("diện tích kiểu Việt Nam được chấp nhận", () => {
    const draft = draftWithOwner();
    draft.parcels[0].area = "29,16";
    expect(validatePublicWizardStep(input({ step, draft }))).toEqual({});
  });

  it("ký hiệu loại đất quá dài thì chặn đúng ô", () => {
    const draft = draftWithOwner();
    draft.parcels[0].landUses = [{ ...emptyLandUse("use-1"), purposeFreeText: "x".repeat(200) }];
    expect(validatePublicWizardStep(input({ step, draft }))["use-0-0-purposefree"]).toBeTruthy();
  });

  it("KHÔNG block vì thiếu nguồn gốc, hình thức, thời hạn", () => {
    const draft = draftWithOwner();
    draft.parcels[0].landUses = [{ ...emptyLandUse("use-1"), purposeFreeText: "LUC" }];
    expect(validatePublicWizardStep(input({ step, draft }))).toEqual({});
  });

  it("KHÔNG block vì thiếu tổ dân phố / đơn vị cũ / địa chỉ trên GCN", () => {
    const draft = draftWithOwner();
    draft.parcels[0] = {
      ...draft.parcels[0],
      addressTwoLevel: "",
      oldWard: "",
      addressOnCertificate: "",
    };
    expect(validatePublicWizardStep(input({ step, draft }))).toEqual({});
  });

  it("ảnh đang tải không chặn bước này — người dân vẫn điền được trong lúc ảnh chạy", () => {
    expect(validatePublicWizardStep(input({ step, hasPendingUpload: true }))).toEqual({});
  });
});

describe("Bước 4 — kiểm tra và gửi", () => {
  const step = STEP_REVIEW_SUBMIT;

  it("hồ sơ tối thiểu đủ điều kiện gửi", () => {
    expect(validatePublicWizardStep(input({ step }))).toEqual({});
  });

  it("gom lỗi của mọi bước", () => {
    const draft = draftWithOwner();
    draft.phone = "1";
    draft.parcels[0].area = "sai";
    const errors = validatePublicWizardStep(input({ step, draft }));
    expect(errors.phone).toBeTruthy();
    expect(errors["parcel-0-area"]).toBeTruthy();
  });

  it("ảnh tải lỗi chặn gửi", () => {
    expect(
      validatePublicWizardStep(input({ step, hasFailedUpload: true })).uploadFailed,
    ).toBeTruthy();
  });

  it("không còn ô đồng ý ở bước này — chưa đồng ý từ bước 1 thì đã không tạo được hồ sơ để đi tới đây", () => {
    // consentAccepted vẫn được validateCitizenSubmitDraft kiểm ở STEP_REVIEW_SUBMIT (gom lỗi mọi
    // bước), nhưng trên thực tế không thể false ở đây: server chặn cứng consent trước khi tạo hồ
    // sơ (create-request.ts), và không có ô nhập nào ở bước 4 để đổi lại giá trị này về false.
    const draft = draftWithOwner();
    draft.consentAccepted = false;
    expect(validatePublicWizardStep(input({ step, draft })).consent).toBeTruthy();
  });
});

describe("Checklist bước gửi", () => {
  it("đủ điều kiện thì mọi mục done", () => {
    expect(submitChecklist(input()).every((item) => item.done)).toBe(true);
  });

  it("thiếu ảnh GCN thì đúng một mục chưa done", () => {
    const items = submitChecklist(input({ uploadedCertificateCount: 0 }));
    expect(items.filter((item) => !item.done).map((item) => item.key)).toEqual(["certificate"]);
  });

  it("thiếu cả hai mặt CCCD thì hai mục chưa done", () => {
    const items = submitChecklist(input({ uploadedIdentitySides: {} }));
    expect(items.filter((item) => !item.done).map((item) => item.key)).toEqual([
      "identityFront",
      "identityBack",
    ]);
  });

  it("chủ sử dụng là tổ chức thì hai mục ảnh CCCD coi như xong", () => {
    const draft = draftWithOwner();
    draft.owners[0].ownerType = "TO_CHUC";
    const items = submitChecklist(input({ draft, uploadedIdentitySides: {} }));
    expect(items.find((item) => item.key === "identityFront")?.done).toBe(true);
  });

  it("còn ảnh đang tải thì mục “mọi ảnh đã tải xong” chưa done", () => {
    const items = submitChecklist(input({ hasPendingUpload: true }));
    expect(items.find((item) => item.key === "uploads")?.done).toBe(false);
  });
});

describe("Tóm tắt thông tin không bắt buộc", () => {
  it("hồ sơ tối thiểu: mọi mục là “cán bộ sẽ bổ sung”", () => {
    expect(optionalSummary(draftWithOwner()).every((item) => !item.done)).toBe(true);
  });

  it("nhập ký hiệu loại đất thì mục đó thành đã nhập", () => {
    const draft = draftWithOwner();
    draft.parcels[0].landUses[0].purposeFreeText = "LUC";
    expect(optionalSummary(draft).find((item) => item.key === "landPurpose")?.done).toBe(true);
  });

  it("các mục này không bao giờ là lỗi — chỉ là trạng thái", () => {
    const draft = draftWithOwner();
    expect(validatePublicWizardStep(input({ step: STEP_REVIEW_SUBMIT, draft }))).toEqual({});
    expect(optionalSummary(draft).length).toBeGreaterThan(0);
  });
});

describe("Ánh xạ fieldPath sang khóa ô nhập", () => {
  it.each([
    ["phone", "phone"],
    ["consentAccepted", "consent"],
    ["owners.0.fullName", "owner-0-name"],
    ["owners.2.identityNumber", "owner-2-id"],
    ["owners.1.dateOfBirth", "owner-1-dob"],
    ["owners.0.currentUserCitizenId", "owner-0-cu-id"],
    ["certificate.issueDate", "issueDate"],
    ["parcels.0.area", "parcel-0-area"],
    ["parcels.3.oldWard", "parcel-3-oldward"],
    ["parcels.0.landUses", "parcel-0-usearea"],
    ["parcels.1.landUses.2.purposeFreeText", "use-1-2-purposefree"],
  ])("%s -> %s", (fieldPath, expected) => {
    expect(errorKeyForFieldPath(fieldPath)).toBe(expected);
  });

  it("đường dẫn không có ô nhập trả chuỗi rỗng", () => {
    expect(errorKeyForFieldPath("")).toBe("");
  });
});

describe("ownerNeedsIdentityPhotos", () => {
  it("cá nhân và hộ gia đình cần ảnh", () => {
    expect(ownerNeedsIdentityPhotos("CA_NHAN", false)).toBe(true);
    expect(ownerNeedsIdentityPhotos("HO_GIA_DINH", false)).toBe(true);
  });

  it("tổ chức và cộng đồng dân cư không cần", () => {
    expect(ownerNeedsIdentityPhotos("TO_CHUC", false)).toBe(false);
    expect(ownerNeedsIdentityPhotos("CONG_DONG_DAN_CU", false)).toBe(false);
  });

  it("người trên GCN đã sang tên không cần", () => {
    expect(ownerNeedsIdentityPhotos("CA_NHAN", true)).toBe(false);
  });
});
