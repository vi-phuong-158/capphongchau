/**
 * Dọn dữ liệu do bộ E2E `tests/e2e/public-intake-v2.spec.ts` tạo ra trên preview.
 *
 *     npx tsx scripts/cleanup-e2e-preview-data.ts                              # chỉ liệt kê
 *     npx tsx scripts/cleanup-e2e-preview-data.ts --apply --confirm=<token>    # xóa thật
 *
 * VÌ SAO DÙNG SỐ ĐIỆN THOẠI LÀM NHÃN, KHÔNG PHẢI "receipt prefix"
 * -----------------------------------------------------------------------------------------------
 * `receiptCode` do máy chủ sinh bằng HMAC (`deriveReceiptCode`) — client không đặt được tiền tố.
 * Toàn bộ hồ sơ E2E tạo ra dùng chung đúng một số điện thoại dựng sẵn (`E2E_TEST_PHONE`, mặc định
 * khớp `PHONE` trong file spec), nên đó là nhãn nhận diện thực tế — không phải người dân thật nào
 * dùng preview lại đúng số đó để kê khai.
 *
 * VÌ SAO DÒ BẢNG CON THAY VÌ LIỆT KÊ CỨNG
 * -----------------------------------------------------------------------------------------------
 * `public_submissions` có khoảng 16 bảng con tham chiếu `submission_id`, phần lớn KHÔNG có
 * `on delete cascade`. Liệt kê cứng tên bảng là cách chắc chắn để migration sau này thêm một bảng
 * con mới mà quên cập nhật script — dữ liệu bị bỏ sót hoặc lệnh xóa vỡ vì vi phạm khóa ngoại. Ở
 * đây script tự dò `information_schema` để tìm mọi bảng có cột `submission_id`, rồi xóa theo kiểu
 * thử-và-thử-lại: bảng nào xóa được (không còn con nào phụ thuộc) thì xóa, bảng nào còn vướng thì
 * để lại cho lượt sau — lặp tới khi xóa hết hoặc không còn tiến triển.
 *
 * Không chạm Google Drive: xóa xong, thư mục Drive của các hồ sơ này trở thành mồ côi thật —
 * chạy tiếp `npx tsx scripts/audit-orphan-public-files.ts --apply --confirm=...` để dọn nốt.
 */

import { createHash } from "node:crypto";

import { loadEnvConfig } from "@next/env";

import { getDatabase } from "@/modules/supabase/database";

loadEnvConfig(process.cwd());

const DEFAULT_TEST_PHONE = "0912345678";

interface Options {
  readonly apply: boolean;
  readonly confirm: string;
  readonly phone: string;
}

function parseOptions(argv: readonly string[]): Options {
  return {
    apply: argv.includes("--apply"),
    confirm: argv.find((value) => value.startsWith("--confirm="))?.slice("--confirm=".length) ?? "",
    phone: process.env.E2E_TEST_PHONE?.trim() || DEFAULT_TEST_PHONE,
  };
}

function confirmationToken(submissionIds: readonly string[]): string {
  return createHash("sha256")
    .update([...submissionIds].sort().join("|"))
    .digest("hex")
    .slice(0, 16);
}

/** Mọi bảng có cột `submission_id`, trừ chính `public_submissions`. */
async function discoverChildTables(): Promise<string[]> {
  const database = getDatabase();
  const rows = await database<{ table_name: string }[]>`
    select distinct table_name from information_schema.columns
    where table_schema = 'public' and column_name = 'submission_id' and table_name <> 'public_submissions'
  `;
  return rows.map((row) => row.table_name);
}

async function cleanup(options: Options): Promise<void> {
  const database = getDatabase();

  const submissions = await database<{ submission_id: string; receipt_code: string }[]>`
    select submission_id, receipt_code::text from public.public_submissions where phone = ${options.phone}
  `;

  if (submissions.length === 0) {
    console.log(`Không có hồ sơ nào với số điện thoại E2E (${options.phone}). Không có gì để dọn.`);
    return;
  }

  console.log(`Tìm thấy ${submissions.length} hồ sơ E2E (phone = ${options.phone}):`);
  for (const row of submissions) console.log(`  ${row.submission_id}\t${row.receipt_code}`);

  const submissionIds = submissions.map((row) => row.submission_id);
  const token = confirmationToken(submissionIds);

  if (!options.apply) {
    console.log("\nChạy khô — không xóa gì.");
    console.log(
      `  npx tsx scripts/cleanup-e2e-preview-data.ts --apply --confirm=${token}`,
    );
    return;
  }

  if (options.confirm !== token) {
    console.error(
      "\nTừ chối: token xác nhận không khớp. Chạy lại ở chế độ khô để lấy token của đúng tập hồ sơ hiện tại " +
        "— tránh xóa nhầm nếu có hồ sơ E2E mới phát sinh giữa hai lần chạy.",
    );
    process.exitCode = 1;
    return;
  }

  const childTables = await discoverChildTables();
  console.log(`\nDò được ${childTables.length} bảng con: ${childTables.join(", ")}`);

  const remaining = new Set(childTables);
  let deletedThisPass = true;
  let pass = 0;

  while (remaining.size > 0 && deletedThisPass) {
    pass += 1;
    deletedThisPass = false;
    for (const table of [...remaining]) {
      try {
        await database.unsafe(
          `delete from public.${table} where submission_id = any($1::text[])`,
          [submissionIds],
        );
        remaining.delete(table);
        deletedThisPass = true;
      } catch {
        // Còn bảng con khác phụ thuộc bảng này — thử lại ở lượt sau.
      }
    }
    console.log(`  Lượt ${pass}: còn ${remaining.size} bảng chưa xóa được (${[...remaining].join(", ") || "hết"}).`);
  }

  if (remaining.size > 0) {
    console.error(
      `\nDừng: không xóa được ${remaining.size} bảng sau ${pass} lượt (${[...remaining].join(", ")}). ` +
        "Có thể có phụ thuộc ngoài submission_id (ví dụ khóa ngoại sang bảng khác không thuộc " +
        "nhóm này). KHÔNG tự ý xóa thủ công — kiểm tra schema rồi chạy lại.",
    );
    process.exitCode = 1;
    return;
  }

  await database`delete from public.public_submissions where submission_id = any(${submissionIds})`;
  console.log(`\nĐã xóa ${submissions.length} hồ sơ E2E và toàn bộ bảng con liên quan.`);
  console.log(
    "Thư mục Drive của các hồ sơ này giờ là mồ côi thật. Chạy tiếp:\n" +
      "  npx tsx scripts/audit-orphan-public-files.ts --apply --confirm=<token in ra ở đó>",
  );
}

cleanup(parseOptions(process.argv.slice(2)))
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Lỗi không rõ.");
    process.exit(1);
  });
