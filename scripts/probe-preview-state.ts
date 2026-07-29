/**
 * Khảo sát CHỈ ĐỌC trạng thái database trước khi áp migration 202607290002/202607290003.
 *
 *     npx tsx scripts/probe-preview-state.ts
 *
 * Không ghi, không sửa, không xóa. In ra:
 *   - số bản ghi từng bảng nghiệp vụ chính (để xác nhận "chưa có hồ sơ nào");
 *   - migration nào đã được Supabase CLI ghi nhận (nếu bảng theo dõi tồn tại);
 *   - sự tồn tại của các cột mà hai migration sắp đụng tới.
 *
 * KHÔNG in bất kỳ giá trị dữ liệu nào — chỉ đếm và tên cột.
 */

import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

import { getDatabase } from "@/modules/supabase/database";

async function main(): Promise<void> {
  const database = getDatabase();

  const identity = await database<{ db: string; usr: string }[]>`
    select current_database() as db, current_user as usr
  `;
  console.log(`\n[DANH TÍNH] database=${identity[0]?.db} user=${identity[0]?.usr}`);

  console.log("\n[SỐ BẢN GHI] — chỉ đếm, không đọc nội dung");
  const tables = [
    "public_submissions",
    "public_owners",
    "public_parcels",
    "public_assets",
    "public_land_uses",
    "cases",
    "certificates",
    "owners",
    "official_parcels",
    "audit_logs",
  ];
  for (const table of tables) {
    const exists = await database<{ ok: boolean }[]>`
      select exists (
        select 1 from information_schema.tables
        where table_schema = 'public' and table_name = ${table}
      ) as ok
    `;
    if (!exists[0]?.ok) {
      console.log(`  ${table.padEnd(22)} : BẢNG KHÔNG TỒN TẠI`);
      continue;
    }
    // Tên bảng lấy từ hằng số trong file này, không phải input ngoài — `unsafe` ở đây là an toàn.
    const rows = (await database.unsafe(
      `select count(*)::int as n from public.${table}`,
    )) as unknown as { n: number }[];
    console.log(`  ${table.padEnd(22)} : ${rows[0]?.n ?? "?"} bản ghi`);
  }

  console.log("\n[MIGRATION SUPABASE CLI ĐÃ GHI NHẬN]");
  const tracker = await database<{ ok: boolean }[]>`
    select exists (
      select 1 from information_schema.tables
      where table_schema = 'supabase_migrations' and table_name = 'schema_migrations'
    ) as ok
  `;
  if (!tracker[0]?.ok) {
    console.log("  Không có bảng supabase_migrations.schema_migrations");
    console.log("  => Migration trước đây được áp THỦ CÔNG, không qua Supabase CLI.");
  } else {
    const applied = await database<{ version: string }[]>`
      select version from supabase_migrations.schema_migrations order by version
    `;
    console.log(`  ${applied.length} migration đã ghi nhận:`);
    for (const row of applied) console.log(`    ${row.version}`);
  }

  console.log("\n[CỘT CỦA 202607290002] — phải CÓ sau khi áp");
  const target2: [string, string][] = [
    ["public_owners", "organisation_name"],
    ["public_owners", "organisation_identity_number"],
    ["public_parcels", "cadastral_map_sheet_number"],
    ["public_parcels", "cadastral_parcel_number"],
    ["public_assets", "parcel_id"],
    ["public_assets", "grade"],
    ["owners", "data_json"],
    ["official_parcels", "parcel_id_code"],
    ["official_land_uses", "purpose_free_text"],
  ];
  for (const [table, column] of target2) {
    const rows = await database<{ ok: boolean }[]>`
      select exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = ${table} and column_name = ${column}
      ) as ok
    `;
    console.log(`  ${`${table}.${column}`.padEnd(46)} : ${rows[0]?.ok ? "CÓ" : "CHƯA CÓ"}`);
  }

  console.log("\n[CỘT CỦA 202607290003] — phải KHÔNG CÒN sau khi áp");
  for (const column of [
    "ward_admin_code_override",
    "ward_admin_code_override_reason",
    "scanned_file_names_override",
    "scanned_file_names_override_reason",
  ]) {
    const rows = await database<{ ok: boolean }[]>`
      select exists (
        select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name = 'public_submissions'
          and column_name = ${column}
      ) as ok
    `;
    console.log(`  public_submissions.${column.padEnd(38)} : ${rows[0]?.ok ? "CÒN" : "KHÔNG CÒN"}`);
  }

  await database.end();
}

main().catch((error: unknown) => {
  console.error("Khảo sát thất bại:", error instanceof Error ? error.message : error);
  process.exit(1);
});
