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
import type { IntakeDraft } from "@/modules/public-intake/types";
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

  it("preflight kiểm ĐỦ cả 5 migration, không bỏ sót cái nào", () => {
    /*
     * Lỗ hổng đã xảy ra thật: script bỏ qua hoàn toàn `202607290001` nhưng vẫn in "Schema sẵn
     * sàng. Có thể deploy code." khi 20 kiểm tra kia đạt. Bỏ sót đúng migration dễ hỏng âm thầm
     * nhất — cả hai chỗ gọi `appendUploadAttempt` đều nuốt lỗi, nên RLS sai làm bảng rỗng vĩnh
     * viễn mà không tín hiệu nào. Một script nghiệm thu nói quá phạm vi nó kiểm còn nguy hiểm hơn
     * không có script.
     */
    const preflight = read("../scripts/preflight-public-intake-v2-migrations.ts");
    const directory = fileURLToPath(new URL("../supabase/migrations/", import.meta.url));
    const v2Migrations = readdirSync(directory)
      .filter((name) => /^20260728|^20260729/.test(name))
      .map((name) => name.slice(0, 12));

    expect(v2Migrations.length).toBeGreaterThanOrEqual(5);
    for (const version of v2Migrations) {
      expect(preflight, `preflight không nhắc tới migration ${version}`).toContain(version);
    }
  });

  it("preflight in project ref, không chỉ hostname", () => {
    /*
     * Hostname KHÔNG phân biệt được project: mọi project Supabase cùng region dùng chung endpoint
     * pooler. Bản đầu chỉ in host, nên chạy nhầm sang DB test vẫn trông y hệt chạy đúng production
     * — bước tự kiểm coi như vô tác dụng. Thứ phân biệt là `postgres.<project-ref>` ở username.
     */
    const preflight = read("../scripts/preflight-public-intake-v2-migrations.ts");
    expect(preflight).toContain("url.username");
    expect(preflight).toContain("project=");
  });

  it("preflight KHÔNG in mật khẩu của chuỗi kết nối", () => {
    // Log này hay bị dán nguyên văn vào báo cáo bàn giao và ảnh chụp màn hình.
    const code = read("../scripts/preflight-public-intake-v2-migrations.ts")
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("*") && !line.trimStart().startsWith("//"))
      .join("\n");
    expect(code).not.toContain("url.password");
    expect(code).not.toContain("SUPABASE_DATABASE_URL}");
  });

  it("preflight đọc relforcerowsecurity, không chỉ relrowsecurity", () => {
    // Bật RLS mà vẫn còn `force` là trạng thái hỏng im lặng; kiểm một nửa là không kiểm.
    const preflight = read("../scripts/preflight-public-intake-v2-migrations.ts");
    expect(preflight).toContain("relrowsecurity");
    expect(preflight).toContain("relforcerowsecurity");
    expect(preflight).toContain("no force row level security");
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
    expect(saveDraft).toContain("adoptServerDraft({ localDraft: payload })");
    expect(saveDraft).toContain("response = await patch(adopted.version)");
  });

  it("chỉ thử lại khi máy chủ ĐÃ có đúng nội dung định ghi", () => {
    /*
     * Đây là hàng rào chống ghi đè. Bỏ điều kiện `!adopted.hasLocalChanges` thì lần thử lại dùng
     * version vừa fetch nên LUÔN thành công — kể cả khi 409 đến từ một thiết bị khác đang sửa
     * thật, và thay đổi của thiết bị kia biến mất im lặng.
     */
    const saveDraft = wizard.slice(
      wizard.indexOf("const saveDraft = useCallback"),
      wizard.indexOf("const flushDraft = useCallback"),
    );
    expect(saveDraft).toContain("if (adopted && !adopted.hasLocalChanges)");
    expect(saveDraft.match(/response\.status === 409/g)).toHaveLength(1);
    expect(saveDraft).toContain("if (!response.ok)");
  });

  it("payload gửi đi và payload đem so sánh là cùng một object", () => {
    // So `draftToSave` (chưa gắn metadata ảnh GCN) với snapshot máy chủ (đã có) sẽ luôn ra
    // "khác nhau", làm nhánh tự phục hồi không bao giờ chạy.
    const saveDraft = wizard.slice(
      wizard.indexOf("const saveDraft = useCallback"),
      wizard.indexOf("const flushDraft = useCallback"),
    );
    expect(saveDraft).toContain("const payload = withCertificateMetadata(draftToSave");
    expect(saveDraft).toContain("adoptServerDraft({ localDraft: payload })");
    expect(saveDraft).toContain("body: JSON.stringify({ draft: payload, version })");
  });

  it("adoptServerDraft trả version ra ngoài, không chỉ gọi setState", () => {
    // `setServerVersion` là state setter: giá trị mới không thấy được trong cùng closure, nên
    // version phải đi ra theo đường trả về thì `saveDraft` mới thử lại đúng được.
    const adopt = wizard.slice(
      wizard.indexOf("const adoptServerDraft = useCallback"),
      wizard.indexOf("const saveDraft = useCallback"),
    );
    expect(adopt).toContain("version: adopted.version,");
    expect(adopt).toContain("hasLocalChanges: adopted.hasLocalChanges,");
  });
});

describe("Quy tắc quyết định của nhánh 409 — hai tình huống, hai kết quả ngược nhau", () => {
  /*
   * `hasLocalChanges` là TOÀN BỘ căn cứ để wizard quyết định có thử lại PATCH hay không. Hai test
   * dưới đây kiểm chính quy tắc đó bằng dữ liệu thật, không đọc mã nguồn — vì đây là chỗ mà một
   * lỗi sẽ làm mất dữ liệu của người dân chứ không chỉ làm đỏ CI.
   */
  const seed = (): IntakeDraft => {
    const draft = emptyDraft("owner-1", "parcel-1", "landuse-1");
    draft.phone = "0912345678";
    draft.owners[0].fullName = "Nguyễn Văn A";
    return draft;
  };

  it("TÌNH HUỐNG 1 — PATCH đã commit, response rơi mất: cho phép thử lại", () => {
    // Máy chủ đang giữ CHÍNH nội dung ta vừa gửi; chỉ số version là khác.
    const sent = seed();
    const serverDraft = structuredClone(sent);

    const adopted = adoptServerDraftSnapshot({
      serverDraft,
      serverVersion: 7,
      localDraft: sent,
    });

    expect(adopted?.hasLocalChanges).toBe(false);
    expect(adopted?.version).toBe(7);
  });

  it("TÌNH HUỐNG 2 — thiết bị khác đã sửa: KHÔNG được thử lại", () => {
    // Máy chủ giữ tên do thiết bị B nhập; máy ta giữ tên khác. Thử lại là xóa mất dữ liệu của B.
    const local = seed();
    local.owners[0].fullName = "Nguyễn Văn A";
    const serverDraft = seed();
    serverDraft.owners[0].fullName = "Trần Thị B";

    const adopted = adoptServerDraftSnapshot({
      serverDraft,
      serverVersion: 9,
      localDraft: local,
    });

    expect(adopted?.hasLocalChanges).toBe(true);
  });

  it("TÌNH HUỐNG 2b — thiết bị khác thêm dữ liệu ở trường ta để trống: vẫn là xung đột", () => {
    // Trường hợp dễ lọt nhất: `{...server, ...local}` giữ chuỗi rỗng của local đè lên dữ liệu của
    // server. Nếu quy tắc báo "không có thay đổi" ở đây thì ta sẽ xóa trắng ô cán bộ vừa điền.
    const local = seed();
    const serverDraft = seed();
    serverDraft.certificate.issueNumber = "CG 123456";

    const adopted = adoptServerDraftSnapshot({
      serverDraft,
      serverVersion: 4,
      localDraft: local,
    });

    expect(adopted?.hasLocalChanges).toBe(true);
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
