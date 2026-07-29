import type { Sql } from "postgres";

import { isOrganisationOwner, type IntakeDraft } from "@/modules/public-intake/types";

/**
 * Ghi/đồng bộ dữ liệu chính thức của một hồ sơ (`case_id`) từ bản kê khai.
 *
 * Dùng chung bởi HAI đường:
 *   1. Saga tiếp nhận chính thức, bước `RECORDS_WRITTEN` — lần ghi đầu tiên.
 *   2. Điều chỉnh hồ sơ đã tiếp nhận (`commitOfficialAmendment`) — ghi lại sau khi cán bộ sửa.
 *
 * Vì sao phải dùng chung: nếu hai đường tự viết SQL riêng thì sớm muộn chúng lệch nhau, và lúc đó
 * hồ sơ chính thức sẽ khác nhau tùy theo nó đi qua đường nào. Một hàm — một định nghĩa "dữ liệu
 * chính thức trông như thế nào".
 *
 * Ngữ nghĩa là ĐỒNG BỘ (sync), không phải chèn thêm:
 *   - Bản ghi còn trong bản kê khai  → upsert (`on conflict do update`).
 *   - Bản ghi đã bị xóa khỏi bản kê khai → xóa khỏi bảng chính thức.
 * Nhờ vậy cán bộ xóa một thửa trong bản kê khai thì thửa đó cũng biến mất khỏi hồ sơ chính thức,
 * không để lại dòng mồ côi mà không ai biết.
 *
 * AN TOÀN KHÓA NGOẠI: `certificates`/`owners`/`parcels`/`assets` chỉ tham chiếu `cases(case_id)`,
 * **không tham chiếu lẫn nhau** (schema 202607230001), và `files.owner_id` là text không có ràng
 * buộc. Nên thứ tự xóa giữa bốn bảng này không quan trọng — khác hẳn cặp
 * `public_land_uses → public_parcels` ở phía bản kê khai, nơi thứ tự là bắt buộc.
 *
 * Hàm này KHÔNG mở transaction. Bên gọi phải truyền transaction đang mở, để việc ghi dữ liệu chính
 * thức và việc ghi `draft_json`/audit/timeline cùng thành công hoặc cùng thất bại.
 */

/**
 * Khóa tất định cho bản ghi con của hồ sơ chính thức.
 *
 * Rơi về chỉ số mảng khi phần tử thiếu `id`: bản kê khai cũ nhập từ Sheets có thể thiếu, và nếu
 * hai phần tử cùng thiếu id thì chúng sẽ sinh cùng một khóa — bản ghi thứ hai bị nuốt mất im lặng.
 */
export function officialChildId(
  submissionId: string,
  rawId: string | undefined,
  index: number,
): string {
  return `ACC:${submissionId}:${rawId?.trim() || `idx-${index}`}`;
}

export interface OfficialRecordCounts {
  readonly ownerCount: number;
  readonly parcelCount: number;
  readonly assetCount: number;
  readonly certificateCount: number;
}

export async function syncOfficialRecord(
  transaction: Sql,
  input: {
    caseId: string;
    submissionId: string;
    draft: IntakeDraft | null;
  },
): Promise<OfficialRecordCounts> {
  const { caseId, submissionId, draft } = input;
  const owners = Array.isArray(draft?.owners) ? draft.owners : [];
  const parcels = Array.isArray(draft?.parcels) ? draft.parcels : [];
  const assets = Array.isArray(draft?.assets) ? draft.assets : [];
  const certificate = draft?.certificate;

  const ownerIds = owners.map((owner, index) => officialChildId(submissionId, owner.id, index));
  const parcelIds = parcels.map((parcel, index) => officialChildId(submissionId, parcel.id, index));
  const assetIds = assets.map((asset, index) => officialChildId(submissionId, asset.id, index));
  const certificateId = `ACC:${submissionId}:CERT`;
  const primaryOwner = owners[0];
  const landUserName = primaryOwner
    ? isOrganisationOwner(primaryOwner.ownerType)
      ? primaryOwner.organisationName || primaryOwner.fullName || ""
      : primaryOwner.fullName || ""
    : "";

  // --- Giấy chứng nhận -------------------------------------------------------------------------
  if (certificate) {
    await transaction`
      insert into public.certificates (
        certificate_id, case_id, issue_number, issue_date, registry_number, land_user_name, notes
      ) values (
        ${certificateId}, ${caseId}, ${certificate.issueNumber || ""},
        ${certificate.issueDate || ""}, ${certificate.registryNumber || ""}, ${landUserName}, ${""}
      )
      on conflict (certificate_id) do update set
        issue_number = excluded.issue_number,
        issue_date = excluded.issue_date,
        registry_number = excluded.registry_number,
        land_user_name = excluded.land_user_name,
        updated_at = now()
    `;
  } else {
    await transaction`
      delete from public.certificates
      where case_id = ${caseId} and certificate_id = ${certificateId}
    `;
  }

  // --- Chủ sử dụng -----------------------------------------------------------------------------
  for (const [index, owner] of owners.entries()) {
    await transaction`
      insert into public.owners (
        owner_id, case_id, full_name, citizen_id, date_of_birth, gender, address, source, data_json
      ) values (
        ${ownerIds[index]}, ${caseId}, ${owner.fullName || ""}, ${owner.identityNumber || ""},
        ${owner.dateOfBirth || ""}, ${owner.gender || ""}, ${owner.residenceAddress || ""},
        ${owner.identitySource || "MANUAL"}, ${JSON.stringify(owner)}::jsonb
      )
      on conflict (owner_id) do update set
        full_name = excluded.full_name,
        citizen_id = excluded.citizen_id,
        date_of_birth = excluded.date_of_birth,
        gender = excluded.gender,
        address = excluded.address,
        source = excluded.source,
        data_json = excluded.data_json,
        updated_at = now()
    `;
  }
  await transaction`
    delete from public.owners
    where case_id = ${caseId} and not (owner_id = any(${ownerIds}::text[]))
  `;

  // --- Thửa đất (mục đích sử dụng nằm trong data_json và bảng chuẩn hóa) -----------------------
  for (const [index, parcel] of parcels.entries()) {
    const officialParcelId = parcelIds[index];
    const areaNum = Number(parcel.area) || 0;

    await transaction`
      insert into public.parcels (parcel_id, case_id, data_json)
      values (${officialParcelId}, ${caseId}, ${JSON.stringify({ ...parcel, sortOrder: index })}::jsonb)
      on conflict (parcel_id) do update set
        data_json = excluded.data_json,
        updated_at = now()
    `;

    await transaction`
      insert into public.official_parcels (
        official_parcel_id, official_case_id, submission_id, map_sheet_number,
        parcel_number, parcel_id_code, address_on_cert, address_two_level, old_ward,
        cadastral_map_sheet_number, cadastral_map_sheet_override_reason,
        cadastral_parcel_number, area
      ) values (
        ${officialParcelId}, ${caseId}, ${submissionId}, ${parcel.mapSheetNumber || ""},
        ${parcel.parcelNumber || ""}, ${parcel.parcelIdCode || ""},
        ${parcel.addressOnCertificate || ""}, ${parcel.addressTwoLevel || ""},
        ${parcel.oldWard || ""}, ${parcel.cadastralMapSheetNumber || ""},
        ${parcel.cadastralMapSheetOverrideReason || ""}, ${parcel.cadastralParcelNumber || ""},
        ${areaNum}
      )
      on conflict (official_parcel_id) do update set
        map_sheet_number = excluded.map_sheet_number,
        parcel_number = excluded.parcel_number,
        parcel_id_code = excluded.parcel_id_code,
        address_on_cert = excluded.address_on_cert,
        address_two_level = excluded.address_two_level,
        old_ward = excluded.old_ward,
        cadastral_map_sheet_number = excluded.cadastral_map_sheet_number,
        cadastral_map_sheet_override_reason = excluded.cadastral_map_sheet_override_reason,
        cadastral_parcel_number = excluded.cadastral_parcel_number,
        area = excluded.area
    `;

    const landUses = Array.isArray(parcel.landUses) ? parcel.landUses : [];
    const landUseIds: string[] = [];
    for (const [luIndex, lu] of landUses.entries()) {
      const officialLuId = `${officialParcelId}:${lu.id || luIndex}`;
      landUseIds.push(officialLuId);
      const luAreaNum = lu.area !== undefined && lu.area !== "" ? Number(lu.area) : null;
      await transaction`
        insert into public.official_land_uses (
          official_land_use_id, official_parcel_id, purpose_code, purpose_free_text, origin_code,
          form_code, term_code, area
        ) values (
          ${officialLuId}, ${officialParcelId}, ${lu.purposeCode || ""},
          ${lu.purposeFreeText || ""}, ${lu.originCode || ""},
          ${lu.formCode || ""}, ${lu.termCode || ""}, ${luAreaNum}
        )
        on conflict (official_land_use_id) do update set
          purpose_code = excluded.purpose_code,
          purpose_free_text = excluded.purpose_free_text,
          origin_code = excluded.origin_code,
          form_code = excluded.form_code,
          term_code = excluded.term_code,
          area = excluded.area
      `;
    }
    await transaction`
      delete from public.official_land_uses
      where official_parcel_id = ${officialParcelId} and not (official_land_use_id = any(${landUseIds}::text[]))
    `;
  }
  await transaction`
    delete from public.parcels
    where case_id = ${caseId} and not (parcel_id = any(${parcelIds}::text[]))
  `;
  await transaction`
    delete from public.official_parcels
    where official_case_id = ${caseId} and not (official_parcel_id = any(${parcelIds}::text[]))
  `;

  // --- Tài sản gắn liền với đất ----------------------------------------------------------------
  for (const [index, asset] of assets.entries()) {
    await transaction`
      insert into public.assets (asset_id, case_id, data_json)
      values (${assetIds[index]}, ${caseId}, ${JSON.stringify({ ...asset, sortOrder: index })}::jsonb)
      on conflict (asset_id) do update set
        data_json = excluded.data_json,
        updated_at = now()
    `;
  }
  await transaction`
    delete from public.assets
    where case_id = ${caseId} and not (asset_id = any(${assetIds}::text[]))
  `;

  return {
    ownerCount: owners.length,
    parcelCount: parcels.length,
    assetCount: assets.length,
    certificateCount: certificate ? 1 : 0,
  };
}
