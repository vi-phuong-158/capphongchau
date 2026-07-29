/**
 * Preflight schema — xác nhận bốn migration Public Intake V2 đã áp đúng, SAU khi chạy migration,
 * TRƯỚC khi deploy code mới.
 *
 *     npx tsx scripts/preflight-public-intake-v2-migrations.ts
 *
 * Chỉ đọc, không ghi, không tự chạy migration. Thoát mã khác 0 nếu bất kỳ điều kiện nào không đạt
 * — dùng được thẳng làm bước gate trong quy trình triển khai (CI hoặc chạy tay), xem
 * `evidence/PUBLIC_INTAKE_V2_PREVIEW_MIGRATION_RUNBOOK.md`.
 *
 * Bốn migration được kiểm:
 *   202607280001_assigned_officer_display_name.sql
 *   202607280002_officer_assisted_intake.sql
 *   202607280003_upload_attempt_metrics.sql
 *   202607280004_public_file_normalization_metadata.sql
 */

import { loadEnvConfig } from "@next/env";

import { getDatabase } from "@/modules/supabase/database";

loadEnvConfig(process.cwd());

interface CheckResult {
  readonly label: string;
  readonly ok: boolean;
  readonly detail: string;
}

async function columnExists(
  table: string,
  column: string,
): Promise<{ exists: boolean; nullable: boolean; hasDefault: boolean }> {
  const database = getDatabase();
  const rows = await database<{ is_nullable: string; column_default: string | null }[]>`
    select is_nullable, column_default from information_schema.columns
    where table_schema = 'public' and table_name = ${table} and column_name = ${column}
  `;
  const row = rows[0];
  return {
    exists: Boolean(row),
    nullable: row?.is_nullable === "YES",
    hasDefault: row?.column_default !== null && row?.column_default !== undefined,
  };
}

async function tableExists(table: string): Promise<boolean> {
  const database = getDatabase();
  const rows = await database<{ exists: boolean }[]>`
    select exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = ${table}
    ) as exists
  `;
  return rows[0]?.exists ?? false;
}

async function constraintExists(name: string): Promise<boolean> {
  const database = getDatabase();
  const rows = await database<{ exists: boolean }[]>`
    select exists (select 1 from pg_constraint where conname = ${name}) as exists
  `;
  return rows[0]?.exists ?? false;
}

async function indexExists(name: string): Promise<boolean> {
  const database = getDatabase();
  const rows = await database<{ exists: boolean }[]>`
    select exists (
      select 1 from pg_indexes where schemaname = 'public' and indexname = ${name}
    ) as exists
  `;
  return rows[0]?.exists ?? false;
}

/** Trạng thái RLS thật của một bảng, đọc thẳng từ `pg_class`. */
async function rowSecurityState(
  table: string,
): Promise<{ found: boolean; enabled: boolean; forced: boolean }> {
  const database = getDatabase();
  const rows = await database<{ relrowsecurity: boolean; relforcerowsecurity: boolean }[]>`
    select c.relrowsecurity, c.relforcerowsecurity
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = ${table}
  `;
  const row = rows[0];
  return {
    found: Boolean(row),
    enabled: row?.relrowsecurity === true,
    forced: row?.relforcerowsecurity === true,
  };
}

async function runChecks(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  const check = (label: string, ok: boolean, detail: string) => {
    results.push({ label, ok, detail });
  };

  // 202607280001 — cột tên hiển thị cán bộ tiếp nhận.
  {
    const column = await columnExists("public_submissions", "claimed_by_display_name");
    check(
      "public_submissions.claimed_by_display_name tồn tại (202607280001)",
      column.exists,
      column.exists ? "OK" : "THIẾU CỘT — migration 202607280001 chưa chạy",
    );
  }

  // 202607280002 — cột và ràng buộc chế độ cán bộ hỗ trợ.
  {
    const columns = await Promise.all(
      ["intake_channel", "assisted_by_email", "assisted_by_display_name", "assisted_at"].map(
        (column) => columnExists("public_submissions", column),
      ),
    );
    const allExist = columns.every((column) => column.exists);
    check(
      "public_submissions có đủ 4 cột assisted intake (202607280002)",
      allExist,
      allExist ? "OK" : "THIẾU ÍT NHẤT MỘT CỘT — migration 202607280002 chưa chạy đủ",
    );

    const intakeChannel = await columnExists("public_submissions", "intake_channel");
    check(
      "intake_channel NOT NULL với default (202607280002)",
      intakeChannel.exists && !intakeChannel.nullable && intakeChannel.hasDefault,
      intakeChannel.exists
        ? `nullable=${intakeChannel.nullable} default=${intakeChannel.hasDefault}`
        : "cột chưa tồn tại",
    );

    const channelCheck = await constraintExists("public_submissions_intake_channel_check");
    check(
      "CHECK public_submissions_intake_channel_check tồn tại",
      channelCheck,
      channelCheck ? "OK" : "THIẾU CONSTRAINT",
    );

    const actorCheck = await constraintExists("public_submissions_assisted_actor_check");
    check(
      "CHECK public_submissions_assisted_actor_check tồn tại",
      actorCheck,
      actorCheck ? "OK" : "THIẾU CONSTRAINT — hồ sơ OFFICER_ASSISTED có thể thiếu dấu vết cán bộ",
    );

    const channelIndex = await indexExists("public_submissions_intake_channel_idx");
    check(
      "Index public_submissions_intake_channel_idx tồn tại",
      channelIndex,
      channelIndex ? "OK" : "THIẾU INDEX",
    );
  }

  // 202607280003 — bảng số đo tải ảnh.
  {
    const table = await tableExists("public_upload_attempts");
    check(
      "Bảng public_upload_attempts tồn tại (202607280003)",
      table,
      table ? "OK" : "THIẾU BẢNG — migration 202607280003 chưa chạy",
    );

    if (table) {
      for (const constraint of [
        "public_upload_attempts_document_type_check",
        "public_upload_attempts_outcome_check",
        "public_upload_attempts_platform_check",
        "public_upload_attempts_connection_check",
        "public_upload_attempts_duration_check",
        "public_upload_attempts_size_check",
        "public_upload_attempts_retry_check",
      ]) {
        const exists = await constraintExists(constraint);
        check(`CHECK ${constraint} tồn tại`, exists, exists ? "OK" : "THIẾU CONSTRAINT");
      }
      for (const index of [
        "public_upload_attempts_created_idx",
        "public_upload_attempts_type_outcome_idx",
        "public_upload_attempts_submission_idx",
      ]) {
        const exists = await indexExists(index);
        check(`Index ${index} tồn tại`, exists, exists ? "OK" : "THIẾU INDEX");
      }
    }
  }

  // 202607280004 — metadata chuẩn hóa ảnh trên public_files.
  {
    const columns = await Promise.all(
      [
        "source_size_bytes",
        "source_mime_type",
        "source_width",
        "source_height",
        "upload_width",
        "upload_height",
        "normalization_version",
      ].map((column) => columnExists("public_files", column)),
    );
    const allExist = columns.every((column) => column.exists);
    check(
      "public_files có đủ 7 cột metadata chuẩn hóa (202607280004)",
      allExist,
      allExist ? "OK" : "THIẾU ÍT NHẤT MỘT CỘT — migration 202607280004 chưa chạy đủ",
    );

    const version = await columnExists("public_files", "normalization_version");
    check(
      "normalization_version NOT NULL với default rỗng",
      version.exists && !version.nullable && version.hasDefault,
      version.exists
        ? `nullable=${version.nullable} default=${version.hasDefault}`
        : "cột chưa tồn tại",
    );
  }

  /*
   * 202607290001 — RLS của bảng số đo.
   *
   * Trước bản vá này script bỏ QUA hoàn toàn migration thứ năm, nhưng vẫn in "Schema sẵn sàng. Có
   * thể deploy code." khi 20 kiểm tra kia đạt. Đúng cái migration dễ hỏng âm thầm nhất lại không
   * được kiểm: cả hai chỗ gọi `appendUploadAttempt` đều nuốt lỗi, nên `force row level security`
   * còn sót lại sẽ làm bảng rỗng vĩnh viễn mà không một dòng log nào báo.
   */
  {
    const security = await rowSecurityState("public_upload_attempts");
    check(
      "public_upload_attempts đã bật RLS (202607290001)",
      security.found && security.enabled,
      !security.found
        ? "THIẾU BẢNG — migration 202607280003 chưa chạy"
        : security.enabled
          ? "relrowsecurity=true"
          : "CHƯA BẬT RLS — migration 202607290001 chưa chạy",
    );
    check(
      "public_upload_attempts KHÔNG dùng FORCE RLS (202607290001)",
      security.found && !security.forced,
      !security.found
        ? "THIẾU BẢNG"
        : security.forced
          ? "relforcerowsecurity=true — bản migration CŨ đã được áp. Sửa tại chỗ không có tác dụng; " +
            "phải thêm migration mới: alter table public.public_upload_attempts no force row level security;"
          : "relforcerowsecurity=false",
    );
  }

  // Kiểm tra dữ liệu — hồ sơ cũ phải nhất quán, không phải chỉ schema đúng.
  {
    const database = getDatabase();
    const rows = await database<{ count: string }[]>`
      select count(*)::text as count from public.public_submissions
      where intake_channel = 'OFFICER_ASSISTED'
        and (assisted_by_email is null or assisted_by_email = '' or assisted_at is null)
    `.catch(() => [{ count: "skip" }]);
    const count = rows[0]?.count ?? "skip";
    check(
      "Không có hồ sơ OFFICER_ASSISTED thiếu dấu vết cán bộ",
      count === "0" || count === "skip",
      count === "skip" ? "BỎ QUA — bảng/cột chưa sẵn sàng để kiểm" : `${count} hồ sơ vi phạm`,
    );
  }

  return results;
}

/**
 * Cơ sở dữ liệu đang kiểm là cái nào.
 *
 * Script đọc `.env.local` của thư mục đang chạy, nên rất dễ chạy nhầm sang DB dev rồi kết luận
 * "production sẵn sàng". Phải in ra thứ ĐỦ SỨC PHÂN BIỆT.
 *
 * Hostname KHÔNG đủ: mọi project Supabase trong cùng một region dùng chung endpoint pooler
 * (`aws-1-ap-northeast-2.pooler.supabase.com`), nên hai project khác nhau in ra y hệt nhau. Thứ
 * phân biệt là **project ref**, nằm trong username dạng `postgres.<project-ref>`.
 *
 * Project ref không phải bí mật — nó nằm trong mọi URL công khai của project. Mật khẩu thì có, và
 * nó nằm ở `url.password`: tuyệt đối không in, kể cả rút gọn, vì log này hay bị dán vào báo cáo.
 */
function connectionTarget(): string {
  const raw = process.env.SUPABASE_DATABASE_URL ?? "";
  if (!raw) return "KHÔNG RÕ (thiếu SUPABASE_DATABASE_URL)";
  try {
    const url = new URL(raw);
    const projectRef = url.username.includes(".")
      ? url.username.slice(url.username.indexOf(".") + 1)
      : "";
    const host = `${url.hostname}${url.port ? `:${url.port}` : ""}${url.pathname}`;
    return projectRef
      ? `project=${projectRef}  (${host})`
      : `${host}  [KHÔNG đọc được project ref từ username — không thể phân biệt project]`;
  } catch {
    return "KHÔNG ĐỌC ĐƯỢC";
  }
}

async function main(): Promise<void> {
  console.log(`Cơ sở dữ liệu đang kiểm: ${connectionTarget()}\n`);
  const results = await runChecks();
  const failed = results.filter((result) => !result.ok);

  for (const result of results) {
    console.log(`  [${result.ok ? "OK" : "FAIL"}] ${result.label} — ${result.detail}`);
  }

  console.log(`\n${results.length - failed.length}/${results.length} kiểm tra đạt.`);

  if (failed.length > 0) {
    console.error(
      `\n${failed.length} kiểm tra KHÔNG đạt. KHÔNG deploy code mới — xem ` +
        "evidence/PUBLIC_INTAKE_V2_PREVIEW_MIGRATION_RUNBOOK.md mục dấu hiệu rollback.",
    );
    process.exit(1);
  }

  console.log("\nSchema sẵn sàng. Có thể deploy code.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Lỗi không rõ.");
  process.exit(1);
});
