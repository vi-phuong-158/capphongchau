import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { draftSchema, validateWorkingPayloadForSave } from "@/modules/public-intake/validation";
import { summarizeWorkingPayloadChanges } from "@/modules/public-intake/working-payload-audit";
import {
  emptyAsset,
  emptyDraft,
  emptyOwner,
  type IntakeDraft,
} from "@/modules/public-intake/types";

function fullDraft(): IntakeDraft {
  const draft = emptyDraft("owner-1", "parcel-1", "land-use-1");
  draft.wardAdministrativeCodeOverride = "07999";
  draft.wardAdministrativeCodeOverrideReason = "Theo quyết định điều chỉnh mã hành chính";
  draft.scannedFileNamesOverride = "GCN-da-doi-chieu.pdf";
  draft.scannedFileNamesOverrideReason = "Theo biên bản bàn giao hồ sơ đã xác nhận";
  draft.owners = [
    {
      ...emptyOwner("owner-1"),
      ownerType: "TO_CHUC",
      organisationName: "Công ty Phong Châu",
      organisationIdentityNumber: "0100109106",
      fullName: "Nguyễn Văn Đại Diện",
      identityNumber: "012345678901",
    },
  ];
  draft.parcels[0] = {
    ...draft.parcels[0],
    cadastralMapSheetNumber: "105",
    cadastralMapSheetOverrideReason: "Theo bản đồ địa chính đã đối chiếu",
    cadastralParcelNumber: "12-A",
  };
  draft.assets = [
    {
      ...emptyAsset("asset-1", "parcel-1"),
      assetType: "NHA_O",
      mixedUseBuildingName: "Khu hỗn hợp A",
      apartmentBuildingName: "Tòa CT1",
      apartmentNumber: "A-1203",
      constructionArea: "90",
      floorArea: "180",
      ownershipForm: "Sở hữu riêng",
      ownershipTerm: "Lâu dài",
      grade: "Cấp II",
    },
  ];
  return draft;
}

describe("full PL3 working payload", () => {
  it("round-trip JSON + Zod giữ nguyên mọi trường mới sau lưu/tải", () => {
    const source = fullDraft();
    const reloaded = draftSchema.parse(JSON.parse(JSON.stringify(source)));
    expect(reloaded).toEqual(source);
  });

  it("không cho quá 3 mục đích sử dụng trên một thửa", () => {
    const source = fullDraft();
    source.parcels[0].landUses = [1, 2, 3, 4].map((index) => ({
      ...source.parcels[0].landUses[0],
      id: `land-use-${index}`,
    }));
    expect(validateWorkingPayloadForSave(source)).toContain("tối đa 3");
  });

  it("ghi đè trường tự động bắt buộc lý do tối thiểu 10 ký tự", () => {
    const source = fullDraft();
    source.wardAdministrativeCodeOverrideReason = "ngắn";
    expect(draftSchema.safeParse(source).success).toBe(false);
  });

  it("audit chỉ chứa đường dẫn và lý do, không chứa giá trị CCCD", () => {
    const previous = fullDraft();
    const next = structuredClone(previous);
    next.owners[0].identityNumber = "109876543210";
    const summary = summarizeWorkingPayloadChanges(previous, next);
    const serialized = JSON.stringify(summary);
    expect(summary.changedFieldPaths).toContain("owners.0.identityNumber");
    expect(serialized).not.toContain("109876543210");
    expect(serialized).not.toContain("012345678901");
    expect(summary.automaticOverrideReasons).toHaveLength(3);
  });

  it("migration bổ sung đầy đủ cột normalized cho owner/parcel/asset và payload chính thức", () => {
    const migration = fs.readFileSync(
      path.join(process.cwd(), "supabase/migrations/202607290002_full_pl3_editor.sql"),
      "utf8",
    );
    for (const column of [
      "organisation_name",
      "organisation_identity_number",
      "cadastral_map_sheet_number",
      "cadastral_parcel_number",
      "mixed_use_building_name",
      "apartment_building_name",
      "apartment_number",
      "construction_area",
      "floor_area",
      "ownership_form",
      "ownership_term",
      "grade",
      "purpose_free_text",
    ]) {
      expect(migration).toContain(column);
    }
  });

  it("UI hiển thị nguồn/ghi đè B, V, AX và CRUD đủ nhóm dữ liệu", () => {
    const editor = fs.readFileSync(
      path.join(process.cwd(), "src/components/admin/working-payload-editor.tsx"),
      "utf8",
    );
    const parcels = fs.readFileSync(
      path.join(process.cwd(), "src/components/admin/editable-parcel-table.tsx"),
      "utf8",
    );
    for (const text of [
      "B — Mã ĐVHC cấp xã",
      "Nguồn tự động",
      "AX — Tên file quét GCN/CCCD",
      "+ Thêm chủ/người đại diện",
      "+ Thêm tài sản",
      "AO — Loại tài sản gắn liền với đất",
      "AW — Cấp hạng",
    ]) {
      expect(editor).toContain(text);
    }
    for (const text of [
      "V — Số hiệu tờ trên bản đồ địa chính",
      "Lý do ghi đè cột V",
      "+ Thêm thửa đất",
      "+ Thêm mục đích",
      "Xóa thửa",
      "Xóa mục đích",
    ]) {
      expect(parcels).toContain(text);
    }
  });
});
