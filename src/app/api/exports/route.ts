import { createHash, randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { AuthorizationError, requireActiveUser } from "@/modules/auth/authorization";
import { verifyCsrfToken } from "@/modules/auth/csrf";
import { createApiErrorPayload } from "@/modules/common/api-error";
import { UserRole } from "@/modules/common/domain";
import { loadServerEnvironment } from "@/modules/common/env";
import {
  BACKLOG_EXPORT_STATUSES,
  createPl3Accumulator,
  OFFICIAL_EXPORT_STATUSES,
  renderPl3Workbook,
} from "@/modules/public-intake/pl3-export";
import { getPublicIntakeRepository } from "@/modules/public-intake/repository";
import { getPublicIntakeStorage } from "@/modules/public-intake/storage";
import type { PublicStatus } from "@/modules/public-intake/workflow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EXPORT_ROLES = [UserRole.REPORT_VIEWER, UserRole.WARD_ADMIN, UserRole.SYSTEM_ADMIN] as const;

const XLSX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const MAX_EXPORT_SUBMISSIONS = 20000;

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

function parseStatuses(scopeParam: string | null): readonly PublicStatus[] {
  if (scopeParam === "official") return OFFICIAL_EXPORT_STATUSES;
  if (scopeParam === "backlog") return BACKLOG_EXPORT_STATUSES;
  return [...OFFICIAL_EXPORT_STATUSES, ...BACKLOG_EXPORT_STATUSES];
}

function parseIsoDate(param: string | null, isEnd: boolean): string | undefined {
  if (!param) return undefined;
  const trimmed = param.trim();
  if (!trimmed) return undefined;
  if (trimmed.includes("T")) return trimmed;
  return isEnd ? `${trimmed}T23:59:59.999Z` : `${trimmed}T00:00:00.000Z`;
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

    const searchParams = request.nextUrl.searchParams;
    const scopeParam = searchParams.get("scope");
    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");
    const officerParam = searchParams.get("officer");

    const statuses = parseStatuses(scopeParam);
    const fromDate = parseIsoDate(fromParam, false);
    const toDate = parseIsoDate(toParam, true);

    const repository = getPublicIntakeRepository();
    const accumulator = createPl3Accumulator();

    let totalSubmissionsProcessed = 0;
    let truncated = false;

    for await (const chunk of repository.listForExport({
      statuses,
      fromDate,
      toDate,
      officer: officerParam || undefined,
      batchSize: 500,
    })) {
      if (totalSubmissionsProcessed + chunk.length > MAX_EXPORT_SUBMISSIONS) {
        const takeCount = MAX_EXPORT_SUBMISSIONS - totalSubmissionsProcessed;
        accumulator.addChunk(chunk.slice(0, takeCount));
        totalSubmissionsProcessed += takeCount;
        truncated = true;
        break;
      }

      accumulator.addChunk(chunk);
      totalSubmissionsProcessed += chunk.length;
    }

    const content = accumulator.getContent(truncated);
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
      truncated,
    });

    let driveFileId = "";
    let archived = false;
    try {
      driveFileId = await getPublicIntakeStorage().uploadExport({
        fileName,
        mimeType: XLSX_MIME_TYPE,
        bytes,
      });
      archived = true;
    } catch {
      archived = false;
    }

    const exportJobId = randomUUID();
    const completedAt = new Date().toISOString();
    try {
      await repository.appendExportJob({
        exportJobId,
        exportType: "PL3",
        status: archived ? "COMPLETED" : "ARCHIVE_FAILED",
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
    } catch {
      // db export_jobs insert failure is non-fatal
    }

    let audited = true;
    try {
      await repository.appendAudit({
        actorEmail: user.email,
        action: "PL3_EXPORTED",
        entityId: exportJobId,
        requestId,
        metadata: { rowCount, submissionCount, warningCount, archived, truncated },
      });
    } catch {
      audited = false;
    }

    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "content-type": XLSX_MIME_TYPE,
        "content-disposition": `attachment; filename="${fileName}"`,
        "cache-control": "no-store",
        "x-export-job-id": exportJobId,
        "x-export-row-count": String(rowCount),
        "x-export-submission-count": String(submissionCount),
        "x-export-warning-count": String(warningCount),
        "x-export-truncated": truncated ? "1" : "0",
        "x-export-archived": archived ? "1" : "0",
        "x-export-audit": audited ? "success" : "failed",
      },
    });
  } catch (error) {
    if (error instanceof AuthorizationError) return fail(error.kind, error.message, requestId);
    return fail("INTERNAL_ERROR", "Không thể tạo bản kết xuất PL3.", requestId);
  }
}
