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
    certificateFileMetadata: local.certificateFileMetadata ?? server.certificateFileMetadata,
  };
}

/**
 * So sánh sâu, không phụ thuộc thứ tự khóa.
 *
 * `JSON.stringify(a) !== JSON.stringify(b)` đọc thì gọn nhưng nhạy với **thứ tự chèn khóa**:
 * `preserveLocalFields` dựng đối tượng bằng `{...server, ...local}`, nên hôm nay thứ tự trùng
 * server và phép so sánh đúng. Chỉ cần một trường mới xuất hiện ở một phía là thứ tự lệch và
 * `hasLocalChanges` báo "có thay đổi" cho hai bản nháp giống hệt nhau — hệ quả là một PATCH thừa
 * mỗi lần khôi phục phiên. Giá trị này quyết định có ghi đè dữ liệu người dân hay không, nên nó
 * không nên phụ thuộc vào chi tiết dựng đối tượng ở nơi khác.
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, index) => deepEqual(item, b[index]));
  }
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every(
    (key) => Object.prototype.hasOwnProperty.call(right, key) && deepEqual(left[key], right[key]),
  );
}

/**
 * Nhận snapshot GET `/current`: version luôn thuộc server; dữ liệu local chỉ được giữ ở lần
 * CREATE, còn các ID sinh phía server được thay vào theo vị trí để upload sau đó tham chiếu đúng.
 */
export function adoptServerDraftSnapshot(input: AdoptServerDraftInput): AdoptedServerDraft | null {
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
    hasLocalChanges: !deepEqual(draft, input.serverDraft),
  };
}
