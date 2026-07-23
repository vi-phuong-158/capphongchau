import { randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { AuthorizationError, requireActiveUser } from "@/modules/auth/authorization";
import { createApiErrorPayload } from "@/modules/common/api-error";
import { getPublicIntakeRepository } from "@/modules/public-intake/repository";
import { maskPhone, SUBMISSION_READ_ROLES } from "@/modules/submissions/review";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function responseError(
  code: "ACCESS_DENIED" | "UNAUTHENTICATED" | "INTERNAL_ERROR",
  message: string,
  requestId: string,
) {
  return NextResponse.json(createApiErrorPayload({ code, message, requestId }), {
    status: code === "UNAUTHENTICATED" ? 401 : code === "ACCESS_DENIED" ? 403 : 500,
    headers: { "cache-control": "no-store" },
  });
}

const PAGE_LIMIT = 100;

/** Cắt trang theo con trỏ `submissionId` trên danh sách đã sắp xếp; trả trang và con trỏ kế. */
function paginate<T extends { submissionId: string }>(
  items: readonly T[],
  cursor: string | null,
): { page: T[]; nextCursor: string | null } {
  let startIndex = 0;
  if (cursor) {
    const idx = items.findIndex((item) => item.submissionId === cursor);
    if (idx >= 0) startIndex = idx + 1;
  }
  const page = items.slice(startIndex, startIndex + PAGE_LIMIT);
  const nextCursor =
    startIndex + PAGE_LIMIT < items.length ? page[page.length - 1].submissionId : null;
  return { page, nextCursor };
}

const byUpdatedAtDesc = (a: { updatedAt: string }, b: { updatedAt: string }): number =>
  b.updatedAt.localeCompare(a.updatedAt);

export async function GET(request: NextRequest): Promise<NextResponse> {
  const requestId = request.headers.get("x-request-id") ?? randomUUID();
  try {
    await requireActiveUser(SUBMISSION_READ_ROLES);
    const status = request.nextUrl.searchParams.get("status");
    const query = request.nextUrl.searchParams.get("q")?.trim().toLocaleLowerCase("vi") ?? "";
    const cursor = request.nextUrl.searchParams.get("cursor");
    const repository = getPublicIntakeRepository();

    // Tìm kiếm phải quét số GCN + tên chủ (nằm trong draft_json) nên buộc đọc đầy đủ. Không tìm kiếm
    // thì dùng đường đọc nhẹ (bỏ draft_json) rồi nạp phần hiển thị cho đúng trang — với 20k hồ sơ đây
    // là khác biệt giữa tải ~cả trăm MB draft mỗi request và chỉ tải phần tóm tắt + 100 ô draft.
    if (query) {
      const filtered = (await repository.list())
        .filter((record) => !status || record.status === status)
        .filter((record) =>
          [
            record.receiptCode,
            record.draft?.certificate.issueNumber ?? "",
            record.draft?.owners[0]?.fullName ?? "",
          ]
            .join(" ")
            .toLocaleLowerCase("vi")
            .includes(query),
        )
        .sort(byUpdatedAtDesc);
      const { page, nextCursor } = paginate(filtered, cursor);
      const submissions = page.map((record) => ({
        submissionId: record.submissionId,
        receiptCode: record.receiptCode,
        status: record.status,
        phone: maskPhone(record.phone),
        issueNumber: record.draft?.certificate.issueNumber ?? "",
        ownerName: record.draft?.owners[0]?.fullName ?? "",
        claimedBy: record.claimedBy || null,
        updatedAt: record.updatedAt,
        version: record.version,
      }));
      return NextResponse.json(
        { submissions, nextCursor, requestId },
        { headers: { "cache-control": "no-store" } },
      );
    }

    const summaries = (await repository.listSummaries())
      .filter((summary) => !status || summary.status === status)
      .sort(byUpdatedAtDesc);
    const { page, nextCursor } = paginate(summaries, cursor);
    const display = await repository.getDraftDisplayFields(page.map((summary) => summary.rowIndex));
    const submissions = page.map((summary) => ({
      submissionId: summary.submissionId,
      receiptCode: summary.receiptCode,
      status: summary.status,
      phone: maskPhone(summary.phone),
      issueNumber: display.get(summary.rowIndex)?.issueNumber ?? "",
      ownerName: display.get(summary.rowIndex)?.ownerName ?? "",
      claimedBy: summary.claimedBy || null,
      updatedAt: summary.updatedAt,
      version: summary.version,
    }));
    return NextResponse.json(
      { submissions, nextCursor, requestId },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof AuthorizationError)
      return responseError(error.kind, error.message, requestId);
    return responseError("INTERNAL_ERROR", "Không thể tải hàng chờ hồ sơ.", requestId);
  }
}
