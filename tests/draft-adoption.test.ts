import { describe, expect, it } from "vitest";

import { adoptServerDraftSnapshot } from "@/modules/public-intake/draft-adoption";
import { emptyDraft, emptyLandUse, emptyOwner, emptyParcel } from "@/modules/public-intake/types";

describe("adoptServerDraftSnapshot", () => {
  it("đồng bộ ID server và version nhưng giữ toàn bộ dữ liệu người dùng đã nhập", () => {
    const local = emptyDraft("owner-local", "parcel-local", "land-use-local");
    local.phone = "0912345678";
    local.consentAccepted = true;
    local.certificate.issueNumber = "CS-LOCAL";
    local.certificate.registryNumber = "REG-LOCAL";
    local.owners[0].fullName = "Người dùng thử";
    local.owners[0].identityNumber = "012345678901";
    local.owners[0].residenceAddress = "Địa chỉ local";
    const secondLocalOwner = emptyOwner("owner-local-2");
    secondLocalOwner.fullName = "Người dùng thử thứ hai";
    secondLocalOwner.identityNumber = "012345678902";
    local.owners.push(secondLocalOwner);
    local.parcels[0].mapSheetNumber = "12";
    local.parcels[0].landUses[0].purposeFreeText = "Loại đất local";
    const secondLocalLandUse = emptyLandUse("land-use-local-2");
    secondLocalLandUse.purposeFreeText = "Loại đất local thứ hai";
    local.parcels[0].landUses.push(secondLocalLandUse);
    const secondLocalParcel = emptyParcel("parcel-local-2", "land-use-local-3");
    secondLocalParcel.parcelNumber = "99";
    secondLocalParcel.landUses[0].purposeFreeText = "Loại đất của thửa thứ hai";
    local.parcels.push(secondLocalParcel);
    local.assets.push({
      id: "asset-local",
      assetType: "NHA_O",
      description: "Tài sản local",
    });
    local.certificateFileMetadata = [{ fileId: "file-local", pageLabel: "Trang bìa" }];

    const server = emptyDraft("owner-server", "parcel-server", "land-use-server");
    server.phone = "0912345678";
    server.consentAccepted = true;
    server.owners.push(emptyOwner("owner-server-2"));
    server.parcels[0].landUses.push(emptyLandUse("land-use-server-2"));
    server.parcels.push(emptyParcel("parcel-server-2", "land-use-server-3"));

    const adopted = adoptServerDraftSnapshot({
      localDraft: local,
      serverDraft: server,
      serverVersion: 7,
    });

    expect(adopted).not.toBeNull();
    expect(adopted?.version).toBe(7);
    expect(adopted?.hasLocalChanges).toBe(true);
    expect(adopted?.draft.phone).toBe(local.phone);
    expect(adopted?.draft.consentAccepted).toBe(true);
    expect(adopted?.draft.owners[0]).toMatchObject({
      id: "owner-server",
      fullName: local.owners[0].fullName,
      identityNumber: local.owners[0].identityNumber,
      residenceAddress: local.owners[0].residenceAddress,
    });
    expect(adopted?.draft.owners[1]).toMatchObject({
      id: "owner-server-2",
      fullName: secondLocalOwner.fullName,
      identityNumber: secondLocalOwner.identityNumber,
    });
    expect(adopted?.draft.certificate).toEqual(local.certificate);
    expect(adopted?.draft.parcels[0]).toMatchObject({
      id: "parcel-server",
      mapSheetNumber: "12",
    });
    expect(adopted?.draft.parcels[0].landUses[0]).toMatchObject({
      id: "land-use-server",
      purposeFreeText: "Loại đất local",
    });
    expect(adopted?.draft.parcels[0].landUses[1]).toMatchObject({
      id: "land-use-server-2",
      purposeFreeText: secondLocalLandUse.purposeFreeText,
    });
    expect(adopted?.draft.parcels[1]).toMatchObject({
      id: "parcel-server-2",
      parcelNumber: secondLocalParcel.parcelNumber,
    });
    expect(adopted?.draft.parcels[1].landUses[0]).toMatchObject({
      id: "land-use-server-3",
      purposeFreeText: secondLocalParcel.landUses[0].purposeFreeText,
    });
    expect(adopted?.draft.assets).toEqual(local.assets);
    expect(adopted?.draft.certificateFileMetadata).toEqual(local.certificateFileMetadata);
  });

  it("khôi phục phiên dùng nguyên draft và version server, không trộn draft local rỗng", () => {
    const server = emptyDraft("owner-server", "parcel-server", "land-use-server");
    server.phone = "0987654321";
    server.consentAccepted = true;
    server.owners[0].fullName = "Tên đã lưu";

    const adopted = adoptServerDraftSnapshot({
      serverDraft: server,
      serverVersion: 11,
    });

    expect(adopted).toEqual({
      draft: server,
      version: 11,
      hasLocalChanges: false,
    });
    expect(adopted?.draft).toBe(server);
  });

  it("từ chối snapshot thiếu server version hợp lệ", () => {
    const server = emptyDraft("owner-server", "parcel-server", "land-use-server");

    expect(adoptServerDraftSnapshot({ serverDraft: server, serverVersion: undefined })).toBeNull();
    expect(adoptServerDraftSnapshot({ serverDraft: server, serverVersion: 0 })).toBeNull();
  });
});
