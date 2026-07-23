import { createHash, randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { AuthorizationError, requireActiveUser } from "@/modules/auth/authorization";
import { verifyCsrfToken } from "@/modules/auth/csrf";
import { createApiErrorPayload } from "@/modules/common/api-error";
import { UserRole } from "@/modules/common/domain";
import { loadServerEnvironment } from "@/modules/common/env";
import { buildPl3Content, renderPl3Workbook } from "@/modules/public-intake/pl3-export";
import { getPublicIntakeRepository } from "@/modules/public-intake/repository";
import { getPublicIntakeStorage } from "@/modules/public-intake/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EXPORT_ROLES = [UserRole.REPORT_VIEWER, UserRole.WARD_ADMIN, UserRole.SYSTEM_ADMIN] as const;

const XLSX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function fail(
  code: "ACCESS_DENIED" | "UNAUTHENTICATED" | "INTERNAL_ERROR",
  message: string,
  requestId: string,
) {
  return NextResponse.json(createApiErrorPayload({ code, message, requestId }), {
    status: code === "UNAUTHENTICATED" ? 401 : code === "ACCESS_DENIED" ? 403 : 500,
    headers: { "cache-control": "no-store" },
  });
}

/** `2026-07-23T05:06:07.000Z` → `20260723-050607` cho tên file, không phụ thuộc locale. */
function fileTimestamp(now: Date): string {
  const iso = now.toISOString();
  return `${iso.slice(0, 10).replace(/-/g, "")}-${iso.slice(11, 19).replace(/:/g, "")}`;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = request.headers.get("x-request-id") ?? randomUUID();
  try {
    const user = await requireActiveUser(EXPORT_ROLES);
    const environment = loadServerEnvironment();
    if (
      !verifyCsrfToken(environment.AUTH_SECRET, user.email, request.headers.get("x-csrf-token"))
    ) {
      return fail("ACCESS_DENIED", "Yêu cầu bảo mật không hợp lệ hoặc đã hết hạn.", requestId);
    }

    const statusFilter = request.nextUrl.searchParams.get("status");
    if (!statusFilter) {
      return fail("ACCESS_DENIED", "Phải chọn trạng thái để xuất dữ liệu.", requestId);
    }

    const repository = getPublicIntakeRepository();
    const allRecords = await repository.list();
    const records = allRecords
      .filter((r) => r.status === statusFilter)
      .slice(0, 2000);

    const content = buildPl3Content(records);
    const bytes = await renderPl3Workbook(content);

    const now = new Date();
    const fileName = `PL3-PhongChau-${fileTimestamp(now)}.xlsx`;
    const checksum = createHash("sha256").update(bytes).digest("hex");
    const rowCount = content.official.rows.length + content.backlog.rows.length;
    const warningCount = content.official.warnings.length + content.backlog.warnings.length;
    const submissionCount = content.officialSubmissionCount + content.backlogSubmissionCount;
    const scopeJson = JSON.stringify({
      officialRows: content.official.rows.length,
      backlogRows: content.backlog.rows.length,
      officialSubmissions: content.officialSubmissionCount,
      backlogSubmissions: content.backlogSubmissionCount,
    });

    // Lưu trữ Drive là "best-effort": xuất phải trả được file cho cán bộ ngay cả khi Drive lỗi.
    // Trạng thái job ghi lại việc lưu trữ có thành công hay không để truy vết.
    let driveFileId = "";
    let jobStatus: "COMPLETED" | "ARCHIVE_FAILED" = "COMPLETED";
    try {
      driveFileId = await getPublicIntakeStorage().uploadExport({
        fileName,
        mimeType: XLSX_MIME_TYPE,
        bytes,
      });
    } catch {
      jobStatus = "ARCHIVE_FAILED";
    }

    const exportJobId = randomUUID();
    const completedAt = new Date().toISOString();
    await repository.appendExportJob({
      exportJobId,
      exportType: "PL3",
      status: jobStatus,
      driveFileId,
      fileName,
      rowCount,
      submissionCount,
      warningCount,
      checksumSha256: checksum,
      actorEmail: user.email,
      scopeJson,
      createdAt: now.toISOString(),
      completedAt,
    });
    await repository.appendAudit({
      actorEmail: user.email,
      action: "PL3_EXPORTED",
      entityId: exportJobId,
      requestId,
      metadata: { rowCount, submissionCount, warningCount, archived: jobStatus === "COMPLETED" },
    });

    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "content-type": XLSX_MIME_TYPE,
        "content-disposition": `attachment; filename="${fileName}"`,
        "cache-control": "no-store",
        "x-export-job-id": exportJobId,
        "x-export-row-count": String(rowCount),
        "x-export-warning-count": String(warningCount),
        "x-export-archived": jobStatus === "COMPLETED" ? "1" : "0",
      },
    });
  } catch (error) {
    if (error instanceof AuthorizationError) return fail(error.kind, error.message, requestId);
    return fail("INTERNAL_ERROR", "Không thể tạo bản kết xuất PL3.", requestId);
  }
}
