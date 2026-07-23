/**
 * Phục hồi hậu cutover cho `public_submissions`.
 *
 * Dùng `--apply` mới ghi. Không in mã hồ sơ, CCCD, tên hoặc nội dung bản nháp.
 */
import { randomUUID } from "node:crypto";

import { loadEnvConfig } from "@next/env";
import type { Sql } from "postgres";

import { getDatabase } from "@/modules/supabase/database";

const REPAIR_REQUEST_ID = "migration-202607240001-public-submissions";

interface RepairCounts {
  readonly malformed_drafts: number;
  readonly max_legacy_row_index: string | null;
}

async function inspect(database: Sql): Promise<RepairCounts> {
  const rows = await database<RepairCounts[]>`
    select
      count(*) filter (
        where jsonb_typeof(draft_json) = 'object'
          and coalesce(jsonb_typeof(draft_json->'owners'), 'missing') <> 'array'
      )::int as malformed_drafts,
      max(legacy_row_index)::text as max_legacy_row_index
    from public.public_submissions
  `;
  return rows[0] ?? { malformed_drafts: 0, max_legacy_row_index: null };
}

async function alignIdentitySequence(transaction: Sql): Promise<void> {
  const sequences = await transaction<{ sequence_name: string | null }[]>`
    select pg_get_serial_sequence('public.public_submissions', 'legacy_row_index') as sequence_name
  `;
  const sequenceName = sequences[0]?.sequence_name;
  if (!sequenceName) throw new Error("Không tìm thấy sequence legacy_row_index.");

  const maximums = await transaction<{ maximum: string | null }[]>`
    select max(legacy_row_index)::text as maximum from public.public_submissions
  `;
  const maximum = maximums[0]?.maximum;
  await transaction.unsafe("select setval($1::regclass, $2::bigint, $3)", [
    sequenceName,
    maximum ?? "1",
    maximum !== null,
  ]);
}

async function repair(database: Sql): Promise<number> {
  return database.begin(async (transaction) => {
    await transaction.unsafe("lock table public.public_submissions in share row exclusive mode");
    await alignIdentitySequence(transaction);

    const repaired = await transaction<{ submission_id: string }[]>`
      update public.public_submissions
      set
        draft_json = jsonb_set(
          draft_json,
          '{owners}',
          jsonb_build_array(
            jsonb_build_object(
              'id', gen_random_uuid()::text,
              'ownerType', 'CA_NHAN',
              'fullName', '',
              'identityNumber', '',
              'dateOfBirth', '',
              'gender', '',
              'residenceAddress', '',
              'identitySource', '',
              'qrPayloadHash', '',
              'qrDecoderVersion', '',
              'qrParserVersion', '',
              'identityStatus', '',
              'identityConfirmedAt', '',
              'roleOnCertificate', '',
              'hasDistinctCurrentUser', false,
              'currentUserName', '',
              'currentUserCitizenId', '',
              'currentUserAddress', '',
              'changeReason', ''
            )
          ),
          true
        ),
        version = version + 1,
        updated_at = now()
      where jsonb_typeof(draft_json) = 'object'
        and coalesce(jsonb_typeof(draft_json->'owners'), 'missing') <> 'array'
      returning submission_id
    `;

    for (const row of repaired) {
      await transaction`
        insert into public.audit_logs
          (audit_id, actor_email, action, entity_type, entity_id, request_id, metadata)
        values (
          ${randomUUID()}, 'SYSTEM', 'PUBLIC_SUBMISSION_DRAFT_REPAIRED', 'PUBLIC_SUBMISSION',
          ${row.submission_id}, ${REPAIR_REQUEST_ID},
          ${transaction.json({ migration: "202607240001", repairedField: "owners" })}
        )
      `;
    }
    return repaired.length;
  });
}

async function main(): Promise<void> {
  loadEnvConfig(process.cwd());
  const apply = process.argv.slice(2).includes("--apply");
  const database = getDatabase();
  try {
    const before = await inspect(database);
    console.log(
      `Kiểm tra: ${before.malformed_drafts} nháp thiếu owners; legacy_row_index lớn nhất ${before.max_legacy_row_index ?? "(trống)"}.`,
    );
    if (!apply) {
      console.log("Chưa thay đổi dữ liệu. Chạy lại với --apply để phục hồi.");
      return;
    }
    const repaired = await repair(database);
    const after = await inspect(database);
    if (after.malformed_drafts !== 0) throw new Error("Còn nháp không hợp lệ sau khi phục hồi.");
    console.log(`Đã đồng bộ sequence và phục hồi ${repaired} nháp; không lộ dữ liệu cá nhân.`);
  } finally {
    await database.end({ timeout: 5 });
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Phục hồi public submissions thất bại.");
  process.exitCode = 1;
});
