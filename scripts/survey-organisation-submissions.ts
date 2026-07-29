/**
 * Thống kê CHỈ ĐỌC: hồ sơ có chủ sử dụng là TỔ CHỨC, đang chờ tiếp nhận, mà thiếu thông tin
 * NGƯỜI ĐẠI DIỆN theo yêu cầu mới của Bàn biên tập PL3 (họ tên, ngày sinh, giới tính, địa chỉ).
 *
 *     npx tsx scripts/survey-organisation-submissions.ts
 *
 * Trả lời đúng một câu hỏi vận hành: bật PR #7 lên thì bao nhiêu hồ sơ tổ chức bị chặn tiếp nhận?
 *
 * KHÔNG sửa dữ liệu. KHÔNG in thông tin cá nhân — không họ tên, CCCD, ngày sinh, địa chỉ, điện
 * thoại. Chỉ in: số đếm, mã biên nhận (định danh hồ sơ, cần để cán bộ tra cứu) và TÊN TRƯỜNG bị
 * thiếu.
 */

import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

import { getDatabase } from "@/modules/supabase/database";
import { isOrganisationOwner, type IntakeDraft, type Owner } from "@/modules/public-intake/types";
import { isValidDate } from "@/modules/public-intake/validation";

/** Khớp BACKLOG_EXPORT_STATUSES — các trạng thái chưa tiếp nhận xong. */
const PENDING_STATUSES = [
  "SUBMITTED",
  "RESUBMITTED",
  "UNDER_REVIEW",
  "NEEDS_SUPPLEMENT",
  "ACCEPTING",
];

interface Row {
  submission_id: string;
  receipt_code: string;
  status: string;
  official_payload_json: unknown;
  working_payload_json: unknown;
  citizen_payload_json: unknown;
  draft_json: unknown;
}

function parse(value: unknown): IntakeDraft | null {
  if (!value) return null;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as IntakeDraft;
    } catch {
      return null;
    }
  }
  return value as IntakeDraft;
}

/** Cùng thứ tự ưu tiên với `effectivePayload`: official > working > citizen > draft. */
function effective(row: Row): IntakeDraft | null {
  return (
    parse(row.official_payload_json) ??
    parse(row.working_payload_json) ??
    parse(row.citizen_payload_json) ??
    parse(row.draft_json)
  );
}

/** Đúng các điều kiện `checkOwner` áp cho dòng tổ chức sau PR #7. */
function missingRepresentativeFields(owner: Owner): string[] {
  const missing: string[] = [];
  if (!owner.fullName?.trim()) missing.push("họ tên người đại diện (H)");
  if (!isValidDate((owner.dateOfBirth ?? "").trim())) missing.push("ngày sinh (I)");
  if (owner.gender !== "NAM" && owner.gender !== "NU") missing.push("giới tính (J)");
  if (!owner.residenceAddress?.trim()) missing.push("địa chỉ thường trú (L)");
  return missing;
}

async function main(): Promise<void> {
  const database = getDatabase();

  const rows = await database<Row[]>`
    select submission_id, receipt_code, status,
           official_payload_json, working_payload_json, citizen_payload_json, draft_json
    from public.public_submissions
    where status = any(${PENDING_STATUSES})
    order by receipt_code
  `;

  console.log(`\nTổng hồ sơ ở trạng thái chờ tiếp nhận: ${rows.length}`);
  console.log(`(trạng thái xét: ${PENDING_STATUSES.join(", ")})\n`);

  let organisationSubmissions = 0;
  let blockedSubmissions = 0;
  let blockedOwnerRows = 0;
  const fieldTally = new Map<string, number>();
  const statusTally = new Map<string, number>();
  const affected: { receipt: string; status: string; rows: number; missing: string[] }[] = [];

  for (const row of rows) {
    const payload = effective(row);
    const owners = payload?.owners ?? [];
    const organisationOwners = owners.filter((owner) => isOrganisationOwner(owner.ownerType));
    if (organisationOwners.length === 0) continue;
    organisationSubmissions += 1;

    const missingHere = new Set<string>();
    let rowsMissing = 0;
    for (const owner of organisationOwners) {
      const missing = missingRepresentativeFields(owner);
      if (missing.length === 0) continue;
      rowsMissing += 1;
      for (const field of missing) missingHere.add(field);
    }
    if (rowsMissing === 0) continue;

    blockedSubmissions += 1;
    blockedOwnerRows += rowsMissing;
    for (const field of missingHere) fieldTally.set(field, (fieldTally.get(field) ?? 0) + 1);
    statusTally.set(row.status, (statusTally.get(row.status) ?? 0) + 1);
    affected.push({
      receipt: row.receipt_code || row.submission_id,
      status: row.status,
      rows: rowsMissing,
      missing: [...missingHere].sort(),
    });
  }

  console.log(`Hồ sơ có chủ sử dụng là TỔ CHỨC:            ${organisationSubmissions}`);
  console.log(`Trong đó SẼ BỊ CHẶN tiếp nhận:             ${blockedSubmissions}`);
  console.log(`Tổng số dòng tổ chức cần bổ sung:          ${blockedOwnerRows}\n`);

  if (blockedSubmissions === 0) {
    console.log("Không có hồ sơ nào bị ảnh hưởng.");
    await database.end();
    return;
  }

  console.log("Thiếu theo trường (số hồ sơ):");
  for (const [field, count] of [...fieldTally].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${field.padEnd(32)} : ${count}`);
  }

  console.log("\nThiếu theo trạng thái:");
  for (const [status, count] of [...statusTally].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${status.padEnd(32)} : ${count}`);
  }

  console.log("\nDanh sách mã biên nhận cần bổ sung (KHÔNG kèm thông tin cá nhân):");
  for (const item of affected) {
    console.log(
      `  ${item.receipt.padEnd(22)} [${item.status}] ${item.rows} dòng — thiếu: ${item.missing.join(", ")}`,
    );
  }

  await database.end();
}

main().catch((error: unknown) => {
  console.error("Thống kê thất bại:", error instanceof Error ? error.message : error);
  process.exit(1);
});
