/**
 * Rà soát tệp mồ côi giữa Google Drive và cơ sở dữ liệu.
 *
 *     npx tsx scripts/audit-orphan-public-files.ts              # chỉ đọc, mặc định
 *     npx tsx scripts/audit-orphan-public-files.ts --apply --confirm=<token>
 *
 * Ba loại lệch được báo:
 *
 *   1. DRIVE_ORPHAN — tệp nằm trong thư mục hồ sơ nhưng không có bản ghi nào trỏ tới. Thường do
 *      một lần ghi cơ sở dữ liệu hỏng sau khi tệp đã tải xong.
 *   2. MISSING_ON_DRIVE — bản ghi trỏ tới một Drive ID không còn tồn tại. **Không tự sửa được**:
 *      đây là mất bằng chứng, phải có người xem.
 *   3. FOLDER_UNREADABLE — không đọc được thư mục của hồ sơ (bị xóa, mất quyền).
 *
 * Mặc định **không xóa gì**. Xóa cần cả `--apply` lẫn `--confirm=` đúng token in ra ở lần chạy
 * khô, và chỉ xóa nhóm 1 — nhóm duy nhất chắc chắn không ai tham chiếu tới.
 *
 * Báo cáo không in tên tệp, tên người, số điện thoại hay CCCD: chỉ mã hồ sơ, Drive ID và dung
 * lượng. Bản in này được dán qua lại giữa nhiều người trong lúc xử lý sự cố.
 */

import { createHash } from "node:crypto";

import { loadEnvConfig } from "@next/env";

import { getPublicIntakeStorage } from "../src/modules/public-intake/storage";
import { getDatabase } from "../src/modules/supabase/database";

loadEnvConfig(process.cwd());

type FindingKind = "DRIVE_ORPHAN" | "MISSING_ON_DRIVE" | "FOLDER_UNREADABLE";

interface Finding {
  readonly kind: FindingKind;
  readonly submissionId: string;
  readonly driveFileId: string;
  readonly sizeBytes: number;
}

interface Options {
  readonly apply: boolean;
  readonly confirm: string;
  readonly limit: number;
}

function parseOptions(argv: readonly string[]): Options {
  const limitArgument = argv.find((value) => value.startsWith("--limit="));
  return {
    // `--dry-run` được chấp nhận nhưng thừa: không có `--apply` thì luôn là chạy khô.
    apply: argv.includes("--apply"),
    confirm: argv.find((value) => value.startsWith("--confirm="))?.slice("--confirm=".length) ?? "",
    limit: limitArgument ? Number(limitArgument.slice("--limit=".length)) : 500,
  };
}

/**
 * Token xác nhận buộc người chạy phải đọc kết quả khô trước.
 *
 * Gắn với đúng tập tệp sắp xóa: thêm hay bớt một tệp là token đổi, nên không thể lấy token của
 * lần chạy hôm qua để xóa tập của hôm nay.
 */
function confirmationToken(findings: readonly Finding[]): string {
  const material = findings
    .filter((item) => item.kind === "DRIVE_ORPHAN")
    .map((item) => `${item.submissionId}:${item.driveFileId}`)
    .sort()
    .join("|");
  return createHash("sha256").update(material).digest("hex").slice(0, 16);
}

async function audit(options: Options): Promise<void> {
  const database = getDatabase();
  const storage = getPublicIntakeStorage();

  const submissions = await database<{ submission_id: string; drive_folder_id: string }[]>`
    select submission_id, drive_folder_id
    from public.public_submissions
    where drive_folder_id <> ''
    order by created_at desc
    limit ${options.limit}
  `;

  const findings: Finding[] = [];

  for (const submission of submissions) {
    const rows = await database<{ drive_file_id: string }[]>`
      select drive_file_id from public.public_files
      where submission_id = ${submission.submission_id}
    `;
    // Đối chiếu với **mọi** trạng thái, kể cả REPLACED/DELETED: một tệp đã bị thay vẫn là tệp
    // được tham chiếu, xóa nó khỏi Drive là mất bằng chứng của hồ sơ.
    const known = new Set(rows.map((row) => row.drive_file_id));

    let onDrive: { id: string; sizeBytes: number }[];
    try {
      onDrive = await storage.listFolderFileIds(submission.drive_folder_id);
    } catch {
      findings.push({
        kind: "FOLDER_UNREADABLE",
        submissionId: submission.submission_id,
        driveFileId: "",
        sizeBytes: 0,
      });
      continue;
    }

    const driveIds = new Set(onDrive.map((file) => file.id));
    for (const file of onDrive) {
      if (!known.has(file.id)) {
        findings.push({
          kind: "DRIVE_ORPHAN",
          submissionId: submission.submission_id,
          driveFileId: file.id,
          sizeBytes: file.sizeBytes,
        });
      }
    }
    for (const driveFileId of known) {
      if (!driveIds.has(driveFileId)) {
        findings.push({
          kind: "MISSING_ON_DRIVE",
          submissionId: submission.submission_id,
          driveFileId,
          sizeBytes: 0,
        });
      }
    }
  }

  const orphans = findings.filter((item) => item.kind === "DRIVE_ORPHAN");
  const missing = findings.filter((item) => item.kind === "MISSING_ON_DRIVE");
  const unreadable = findings.filter((item) => item.kind === "FOLDER_UNREADABLE");

  console.log(`Đã soát ${submissions.length} hồ sơ.`);
  console.log(`  DRIVE_ORPHAN      : ${orphans.length}`);
  console.log(`  MISSING_ON_DRIVE  : ${missing.length}  (KHÔNG tự sửa — phải có người xem)`);
  console.log(`  FOLDER_UNREADABLE : ${unreadable.length}`);
  for (const item of findings) {
    console.log(`  ${item.kind}\t${item.submissionId}\t${item.driveFileId}\t${item.sizeBytes}`);
  }

  const token = confirmationToken(findings);
  if (!options.apply) {
    console.log("\nChạy khô — không xóa gì.");
    if (orphans.length > 0) {
      console.log(`Muốn xóa ${orphans.length} tệp mồ côi:`);
      console.log(
        `  npx tsx scripts/audit-orphan-public-files.ts --apply --confirm=${token} --limit=${options.limit}`,
      );
    }
    return;
  }

  if (options.confirm !== token) {
    console.error(
      `\nTừ chối: token xác nhận không khớp. Chạy lại ở chế độ khô để lấy token của đúng tập tệp hiện tại.`,
    );
    process.exitCode = 1;
    return;
  }

  let deleted = 0;
  for (const item of orphans) {
    try {
      await storage.discardFile(item.driveFileId);
      deleted += 1;
    } catch (error) {
      console.error(
        `  Không xóa được ${item.driveFileId}: ${error instanceof Error ? error.name : "lỗi không rõ"}`,
      );
    }
  }
  console.log(`\nĐã xóa ${deleted}/${orphans.length} tệp mồ côi.`);
}

audit(parseOptions(process.argv.slice(2)))
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Lỗi không rõ.");
    process.exit(1);
  });
