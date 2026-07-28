import type { Asset, IntakeDraft, LandUse, Owner, Parcel } from "./types";

export interface AdoptServerDraftInput {
  readonly serverDraft: IntakeDraft;
  readonly serverVersion: unknown;
  /**
   * Chỉ truyền ngay sau CREATE. Khi khôi phục phiên, bỏ trống để draft server là nguồn duy nhất.
   */
  readonly localDraft?: IntakeDraft;
}

export interface AdoptedServerDraft {
  readonly draft: IntakeDraft;
  readonly version: number;
  readonly hasLocalChanges: boolean;
}

function mergeOwners(local: readonly Owner[], server: readonly Owner[]): Owner[] {
  const merged = local.map((owner, index) =>
    server[index] ? { ...server[index], ...owner, id: server[index].id } : owner,
  );
  return [...merged, ...server.slice(local.length)];
}

function mergeLandUses(local: readonly LandUse[], server: readonly LandUse[]): LandUse[] {
  const merged = local.map((landUse, index) =>
    server[index] ? { ...server[index], ...landUse, id: server[index].id } : landUse,
  );
  return [...merged, ...server.slice(local.length)];
}

function mergeParcels(local: readonly Parcel[], server: readonly Parcel[]): Parcel[] {
  const merged = local.map((parcel, index) => {
    const serverParcel = server[index];
    if (!serverParcel) return parcel;
    return {
      ...serverParcel,
      ...parcel,
      id: serverParcel.id,
      landUses: mergeLandUses(parcel.landUses, serverParcel.landUses),
    };
  });
  return [...merged, ...server.slice(local.length)];
}

function mergeAssets(local: readonly Asset[], server: readonly Asset[]): Asset[] {
  const merged = local.map((asset, index) =>
    server[index] ? { ...server[index], ...asset, id: server[index].id } : asset,
  );
  return [...merged, ...server.slice(local.length)];
}

function preserveLocalFields(local: IntakeDraft, server: IntakeDraft): IntakeDraft {
  return {
    ...server,
    ...local,
    certificate: { ...server.certificate, ...local.certificate },
    owners: mergeOwners(local.owners, server.owners),
    parcels: mergeParcels(local.parcels, server.parcels),
    assets: mergeAssets(local.assets, server.assets),
    certificateFileMetadata:
      local.certificateFileMetadata ?? server.certificateFileMetadata,
  };
}

/**
 * Nhận snapshot GET `/current`: version luôn thuộc server; dữ liệu local chỉ được giữ ở lần
 * CREATE, còn các ID sinh phía server được thay vào theo vị trí để upload sau đó tham chiếu đúng.
 */
export function adoptServerDraftSnapshot(
  input: AdoptServerDraftInput,
): AdoptedServerDraft | null {
  if (
    typeof input.serverVersion !== "number" ||
    !Number.isInteger(input.serverVersion) ||
    input.serverVersion < 1
  ) {
    return null;
  }

  const draft = input.localDraft
    ? preserveLocalFields(input.localDraft, input.serverDraft)
    : input.serverDraft;

  return {
    draft,
    version: input.serverVersion,
    hasLocalChanges: JSON.stringify(draft) !== JSON.stringify(input.serverDraft),
  };
}
