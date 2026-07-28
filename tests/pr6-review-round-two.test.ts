/**
 * Vòng rà soát PR #6 (lần hai) — khóa lại từng phát hiện đã sửa.
 *
 * Cùng tinh thần với `public-intake-v2-review-fixes.test.ts`: đây là những chỗ **đã từng sai**,
 * không phải những chỗ nghĩ là có thể sai. Một số test đọc mã nguồn thay vì gọi hàm, vì phần được
 * bảo vệ nằm trong route/migration cần Supabase + Google Drive thật mới chạy được — nhưng chúng
 * bắt đúng loại hồi quy đáng sợ: ai đó "dọn cho gọn" và làm mất một hàng rào.
 */
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { adoptServerDraftSnapshot } from "@/modules/public-intake/draft-adoption";
import { emptyDraft } from "@/modules/public-intake/types";
import {
  reportUploadMetricFailure,
  resetUploadMetricFailureReport,
} from "@/modules/public-intake/upload-metrics";

function read(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
}

/**
 * Bỏ dòng comment `--` trước khi soi nội dung migration.
 *
 * Migration 202607290001 giải thích ngay trong comment vì sao **không** dùng `force row level
 * security`. Soi cả comment thì chính lời giải thích làm test đỏ, và cách "sửa" dễ nhất là xóa lời
 * giải thích — đúng thứ cần giữ nhất.
 */
function sqlStatementsOnly(source: string): string {
  return source
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
}

describe("Telemetry tải ảnh không được hỏng trong im lặng", () => {
  it("migration KHÔNG dùng force row level security", () => {
    /*
     * `force` áp RLS lên cả chủ sở hữu bảng. Bảng không có policy nào, nên với role không mang
     * BYPASSRLS thì mọi insert đều trả 0 dòng — mà cả hai chỗ gọi `appendUploadAttempt` đều nuốt
     * lỗi vì số đo là việc phụ. Kết quả: bảng rỗng vĩnh viễn, không một dòng log nào báo, đúng cái
     * bảng dùng để nghiệm thu ngưỡng hiệu năng và để mở cờ chuẩn hóa ảnh.
     */
    const migration = sqlStatementsOnly(
      read("../supabase/migrations/202607290001_public_upload_attempts_rls.sql"),
    );
    expect(migration).toContain("enable row level security");
    expect(migration).not.toContain("force row level security");
    expect(migration).toContain("revoke all on table public.public_upload_attempts");
  });

  it("không migration nào trong repo dùng force row level security", () => {
    // Giữ đúng một bảng lệch mẫu là cách chắc chắn để sau này không ai nhớ vì sao nó khác.
    const directory = fileURLToPath(new URL("../supabase/migrations/", import.meta.url));
    const offenders = readdirSync(directory)
      .filter((name) => name.endsWith(".sql"))
      .filter((name) =>
        sqlStatementsOnly(readFileSync(`${directory}${name}`, "utf8")).includes("force row level"),
      );
    expect(offenders).toEqual([]);
  });

  it("lỗi ghi số đo được báo đúng một lần cho mỗi tiến trình", () => {
    resetUploadMetricFailureReport();
    const seen: string[] = [];
    const original = console.error;
    console.error = (message: unknown) => void seen.push(String(message));
    try {
      reportUploadMetricFailure({ code: "42501" });
      reportUploadMetricFailure({ code: "42501" });
      reportUploadMetricFailure(new Error("khác"));
    } finally {
      console.error = original;
      resetUploadMetricFailureReport();
    }

    expect(seen).toHaveLength(1);
    expect(seen[0]).toContain("public_upload_attempts");
    expect(seen[0]).toContain("pg_code=42501");
  });

  it("không ghi error.message vào log — Postgres có thể nhắc lại giá trị dòng vừa insert", () => {
    resetUploadMetricFailureReport();
    const seen: string[] = [];
    const original = console.error;
    console.error = (message: unknown) => void seen.push(String(message));
    try {
      reportUploadMetricFailure(new Error("012345678901 vi phạm ràng buộc"));
    } finally {
      console.error = original;
      resetUploadMetricFailureReport();
    }

    expect(seen[0]).not.toContain("012345678901");
    expect(seen[0]).toContain("pg_code=UNKNOWN");
  });

  it("bảng số đo có trần số dòng cho mỗi hồ sơ", () => {
    // `/uploads/metrics` nhận số đo của các lượt HỎNG nên không có gì buộc client phải dừng.
    const repository = read("../src/modules/public-intake/repository.ts");
    const method = repository.slice(
      repository.indexOf("async appendUploadAttempt"),
      repository.indexOf("async appendFile"),
    );
    expect(method).toContain("MAX_UPLOAD_ATTEMPTS_PER_SUBMISSION");
    expect(method).toContain("select count(*) from public.public_upload_attempts");
  });
});

describe("PATCH nháp: 409 giả trên mạng yếu phải tự gỡ", () => {
  const wizard = read("../src/app/ke-khai/wizard.tsx");

  it("gặp 409 thì lấy lại snapshot rồi thử lại, không bỏ cuộc ngay", () => {
    /*
     * Máy chủ kiểm version khớp TUYỆT ĐỐI. Nguyên nhân 409 thường gặp nhất không phải hai thiết
     * bị cùng sửa mà là một PATCH đã ghi xong nhưng response rơi mất — lần thử lại gửi version cũ
     * và bị từ chối. Trước khi sửa, người dân kẹt ở bước đó kèm thông báo sai sự thật.
     */
    const saveDraft = wizard.slice(
      wizard.indexOf("const saveDraft = useCallback"),
      wizard.indexOf("const flushDraft = useCallback"),
    );
    expect(saveDraft).toContain("if (response.status === 409)");
    expect(saveDraft).toContain("adoptServerDraft({ localDraft: draftToSave })");
    expect(saveDraft).toContain("response = await patch(adopted.draft, adopted.version)");
  });

  it("chỉ thử lại đúng một lần — 409 thật vẫn nổi lên", () => {
    const saveDraft = wizard.slice(
      wizard.indexOf("const saveDraft = useCallback"),
      wizard.indexOf("const flushDraft = useCallback"),
    );
    expect(saveDraft.match(/response\.status === 409/g)).toHaveLength(1);
    expect(saveDraft).toContain("if (!response.ok)");
  });

  it("adoptServerDraft trả version ra ngoài, không chỉ gọi setState", () => {
    // `setServerVersion` là state setter: giá trị mới không thấy được trong cùng closure, nên
    // version phải đi ra theo đường trả về thì `saveDraft` mới thử lại đúng được.
    const adopt = wizard.slice(
      wizard.indexOf("const adoptServerDraft = useCallback"),
      wizard.indexOf("const saveDraft = useCallback"),
    );
    expect(adopt).toContain("return { draft: restoredDraft, version: adopted.version };");
  });
});

describe("hasLocalChanges không được phụ thuộc thứ tự khóa", () => {
  it("hai bản nháp giống hệt nhau nhưng khác thứ tự khóa vẫn là KHÔNG có thay đổi", () => {
    const server = emptyDraft("owner-1", "parcel-1", "landuse-1");
    // Dựng lại cùng nội dung theo thứ tự khóa đảo ngược — `JSON.stringify` sẽ báo khác nhau.
    const reordered = Object.fromEntries(
      Object.entries(server as unknown as Record<string, unknown>).reverse(),
    ) as unknown as typeof server;

    const adopted = adoptServerDraftSnapshot({
      serverDraft: server,
      serverVersion: 3,
      localDraft: reordered,
    });

    expect(adopted).not.toBeNull();
    expect(adopted?.version).toBe(3);
    expect(adopted?.hasLocalChanges).toBe(false);
  });

  it("khác nội dung thật thì vẫn báo có thay đổi", () => {
    const server = emptyDraft("owner-1", "parcel-1", "landuse-1");
    const local = structuredClone(server);
    local.phone = "0912345678";

    const adopted = adoptServerDraftSnapshot({
      serverDraft: server,
      serverVersion: 2,
      localDraft: local,
    });

    expect(adopted?.hasLocalChanges).toBe(true);
  });
});

describe("Script xóa dữ liệu E2E không được chạy nhầm trên production", () => {
  const script = read("../scripts/cleanup-e2e-preview-data.ts");

  it("từ chối khi NODE_ENV=production", () => {
    expect(script).toContain('process.env.NODE_ENV === "production"');
  });

  it("từ chối khi APP_BASE_URL không giống môi trường thử", () => {
    expect(script).toContain("APP_BASE_URL");
    expect(script).toContain("preview|staging|vercel");
  });

  it("chỉ bỏ qua được khi khai báo có ý thức", () => {
    expect(script).toContain("--i-know-this-is-not-preview");
  });

  it("kiểm tra chạy TRƯỚC khi gọi cleanup", () => {
    expect(script.indexOf("const refusal = refusesToRunHere")).toBeLessThan(
      script.indexOf("cleanup(parseOptions(argv))"),
    );
  });
});

describe("Chỉ mục tra cứu CCCD phủ cả hồ sơ MỨC A", () => {
  /*
   * Từ V2, CCCD là **tùy chọn** với người dân. Trước khi sửa, `pendingIdentityHmacs` chỉ được ghi
   * ở `submit` khi `status === "SUBMITTED"`, nên hai nhóm hồ sơ nằm ngoài chỉ mục vĩnh viễn:
   *   - người dân điền CCCD ở lần GỬI BỔ SUNG (`RESUBMITTED`);
   *   - cán bộ điền hộ CCCD lúc hoàn thiện hoặc tiếp nhận chính thức.
   * Cả hai nhóm đều là nhóm mà V2 sinh ra nhiều nhất. Quyết định 2026-07-29: ghi cả hai, dùng
   * `kind = 'PENDING'` giống người dân tự khai.
   */
  it("route submit công khai ghi chỉ mục cho cả SUBMITTED lẫn RESUBMITTED", () => {
    const route = read("../src/app/api/public/submissions/current/submit/route.ts");
    const block = route.slice(route.indexOf("const pendingIdentityHmacs"));
    expect(block).toContain("citizenIdsForLookup(draft)");
    expect(block.slice(0, block.indexOf("try {"))).not.toContain('status === "SUBMITTED"');
  });

  it("route submit của cán bộ hỗ trợ cũng ghi cho cả hai trạng thái", () => {
    const route = read("../src/app/api/staff/assisted-submissions/current/submit/route.ts");
    const block = route.slice(route.indexOf("pendingIdentityHmacs:"));
    expect(block).toContain("citizenIdsForLookup(draft)");
    expect(block.slice(0, 400)).not.toContain('status === "SUBMITTED"');
  });

  it("cả ba đường ghi của cán bộ đều truyền pendingIdentityHmacs", () => {
    // Thiếu một đường là hồ sơ đi qua đúng đường đó lọt khỏi chỉ mục mà không ai biết.
    for (const relative of [
      "../src/app/api/submissions/[submissionId]/route.ts",
      "../src/app/api/submissions/[submissionId]/working-payload/route.ts",
      "../src/app/api/submissions/[submissionId]/ai-draft/apply/route.ts",
    ]) {
      const route = read(relative);
      expect(route, relative).toContain("pendingIdentityHmacs");
      expect(route, relative).toContain("citizenIdsForLookup");
      expect(route, relative).toContain("DATA_HASH_PEPPER");
    }
  });

  it("repository ghi chỉ mục với kind PENDING, idempotent", () => {
    const repository = read("../src/modules/public-intake/repository.ts");
    expect(repository).toContain("insert into public.public_lookup_index");
    expect(repository).toContain("values ('PENDING', ${hmac}, ${submissionId}) on conflict do nothing");
  });

  it("repository KHÔNG tự tính HMAC — pepper chỉ nằm ở tầng route", () => {
    // Giữ đúng phân lớp sẵn có: repository không bao giờ đọc biến môi trường.
    const repository = read("../src/modules/public-intake/repository.ts");
    expect(repository).not.toContain("DATA_HASH_PEPPER");
    expect(repository).not.toContain("identityHmac(");
  });
});

describe("Truy vấn Drive escape đúng giá trị nội suy", () => {
  it("listFolderFileIds không ghép thẳng folderId vào chuỗi q", () => {
    const storage = read("../src/modules/public-intake/storage.ts");
    expect(storage).toContain("escapeQueryValue(folderId)");
    expect(storage).not.toContain("`'${folderId}' in parents");
  });
});
