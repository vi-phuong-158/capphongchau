import { randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { AuthorizationError, requireActiveUser } from "@/modules/auth/authorization";
import { verifyCsrfToken } from "@/modules/auth/csrf";
import { createApiErrorPayload } from "@/modules/common/api-error";
import { loadServerEnvironment, loadPublicIntakeEnvironment } from "@/modules/common/env";
import { extensionFromMimeType } from "@/modules/public-intake/file-naming";
import { canonicalImageMimeType } from "@/modules/public-intake/image-format";
import { effectivePayload } from "@/modules/public-intake/payload-layers";
import { getPublicIntakeRepository } from "@/modules/public-intake/repository";
import { getPublicIntakeStorage } from "@/modules/public-intake/storage";
import {
  ensureSubmissionFolderReady,
  SubmissionFolderBusyError,
  SubmissionFolderUnavailableError,
} from "@/modules/public-intake/submission-folder";
import { requiresCitizenId } from "@/modules/public-intake/types";
import {
  MAX_CERTIFICATE_PHOTOS,
  SUBMISSION_BYTE_BUDGET,
} from "@/modules/public-intake/upload-commit";
import { mayStaffEdit, SUBMISSION_DECISION_ROLES } from "@/modules/submissions/review";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  documentType: z.enum(["CITIZEN_ID_FRONT", "CITIZEN_ID_BACK", "CERTIFICATE"]),
  ownerId: z.string().trim().max(64).default(""),
  replaceFileId: z.string().trim().max(64).default(""),
  /** Chỉ dùng để suy ra loại ảnh khi trình duyệt không khai được `mimeType`. */
  fileName: z.string().trim().max(255).default(""),
  mimeType: z.string().trim().max(100).default(""),
  sizeBytes: z.number().int().positive(),
});

/**
 * Cố tình chỉ dùng bộ mã có sẵn trong `API_ERROR_CODES`, không thêm mã mới cho bề mặt cán bộ.
 *
 * Đường công khai có thêm `SIZE_BUDGET_EXCEEDED`/`INVALID_STATE` riêng, nhưng nó **mở rộng cục bộ**
 * (`PublicErrorCode`) chứ không nới bộ mã chung. Nới bộ mã chung là đổi hợp đồng API cho mọi client
 * cán bộ đang `switch` theo mã, mà ở đây không cần: client chỉ hiển thị `error.message`, và thông
 * điệp đã nói rõ vướng gì. Trần dung lượng về `VALIDATION_FAILED`; các vướng do trạng thái ảnh của
 * hồ sơ về `VERSION_CONFLICT` — cùng một nghĩa "trạng thái không như bên gọi tưởng, hãy tải lại".
 */
type FailCode =
  | "ACCESS_DENIED"
  | "UNAUTHENTICATED"
  | "VALIDATION_FAILED"
  | "NOT_FOUND"
  | "VERSION_CONFLICT"
  | "IDEMPOTENCY_CONFLICT"
  | "SERVICE_UNAVAILABLE"
  | "INTERNAL_ERROR";

function fail(
  code: FailCode,
  message: string,
  requestId: string,
  status: number,
  headers?: Record<string, string>,
): NextResponse {
  return NextResponse.json(createApiErrorPayload({ code, message, requestId }), {
    status,
    headers: { "cache-control": "no-store", ...headers },
  });
}

/**
 * Cán bộ tự tải ảnh giấy tờ vào hồ sơ (Đợt 2C) — bước tạo phiên tải lên.
 *
 * Vì sao không dùng lại `/api/public/submissions/current/uploads/initiate`: đường của người dân
 * khóa theo cookie phiên kê khai (`resolvePublicRequest`) và đòi `isEditable(record)`, tức chỉ
 * `DRAFT`/`NEEDS_SUPPLEMENT` và **không** đang do cán bộ nhận xử lý. Đúng lúc cán bộ cần thêm ảnh
 * thì cả hai điều kiện đều sai: hồ sơ đang `UNDER_REVIEW` và do chính họ giữ.
 *
 * Cửa vào ở đây là `mayStaffEdit` — cùng một chốt với `PATCH /api/submissions/:id` và Bàn làm việc
 * PL3: **người đang giữ hồ sơ** và hồ sơ đang `UNDER_REVIEW`. Không mở thêm khái niệm quyền mới;
 * ảnh giấy tờ là dữ liệu của hồ sơ nên đi đúng cửa đang dùng cho dữ liệu của hồ sơ.
 *
 * Hai trần (số ảnh GCN, ngân sách byte) dùng chung hằng số với đường người dân qua
 * `upload-commit.ts` — hai đường ghi vào cùng một thư mục Drive nên trần phải là trần của hồ sơ.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ submissionId: string }> },
): Promise<NextResponse> {
  const requestId = request.headers.get("x-request-id") ?? randomUUID();
  try {
    const body = schema.safeParse(await request.json().catch(() => null));
    if (!body.success) {
      return fail("VALIDATION_FAILED", "Thông tin tệp cần tải lên không hợp lệ.", requestId, 400);
    }

    const user = await requireActiveUser(SUBMISSION_DECISION_ROLES);
    const environment = loadServerEnvironment();
    if (
      !verifyCsrfToken(environment.AUTH_SECRET, user.email, request.headers.get("x-csrf-token"))
    ) {
      return fail("ACCESS_DENIED", "Yêu cầu bảo mật không hợp lệ hoặc đã hết hạn.", requestId, 403);
    }

    const { submissionId } = await context.params;
    const repository = getPublicIntakeRepository();
    const record = await repository.findById(submissionId);
    if (!record) return fail("NOT_FOUND", "Không tìm thấy bản kê khai.", requestId, 404);
    if (!mayStaffEdit(record, user.email)) {
      return fail(
        "ACCESS_DENIED",
        "Chỉ cán bộ đang nhận xử lý hồ sơ ở trạng thái Đang kiểm tra mới tải thêm ảnh được.",
        requestId,
        403,
      );
    }

    // Quy bí danh (`image/jpg`) và trường hợp trình duyệt không khai được loại về tên chuẩn trước
    // khi kiểm — ảnh cán bộ nhận qua Zalo hay tải về từ máy hộ dân hay rơi vào hai trường hợp này.
    const mimeType = canonicalImageMimeType(body.data.mimeType, body.data.fileName);
    if (!mimeType) {
      return fail(
        "VALIDATION_FAILED",
        "Chỉ chấp nhận ảnh JPEG, PNG, WebP hoặc HEIC.",
        requestId,
        400,
      );
    }

    const { documentType, ownerId, replaceFileId, sizeBytes } = body.data;
    const maxBytes = loadPublicIntakeEnvironment().MAX_UPLOAD_MB * 1024 * 1024;
    if (sizeBytes > maxBytes) {
      return fail(
        "VALIDATION_FAILED",
        `Mỗi ảnh không vượt quá ${loadPublicIntakeEnvironment().MAX_UPLOAD_MB} MB.`,
        requestId,
        400,
      );
    }

    // Đọc thẳng từ cơ sở dữ liệu, không dùng `record.fileSummaries`: đường cán bộ không có phiên
    // nào giữ bản chụp, và ảnh có thể vừa được thêm ở tab khác.
    const files = await repository.listFiles(submissionId);
    const replaceTarget = replaceFileId
      ? files.find((file) => file.fileId === replaceFileId)
      : undefined;
    if (replaceFileId && !replaceTarget) {
      return fail("VALIDATION_FAILED", "Ảnh cần thay không hợp lệ.", requestId, 400);
    }
    if (replaceTarget && replaceTarget.documentType !== documentType) {
      return fail("VALIDATION_FAILED", "Ảnh cần thay không cùng loại giấy tờ.", requestId, 400);
    }

    const usedBytes =
      files.reduce((sum, file) => sum + file.sizeBytes, 0) - (replaceTarget?.sizeBytes ?? 0);
    if (usedBytes + sizeBytes > SUBMISSION_BYTE_BUDGET) {
      return fail("VALIDATION_FAILED", "Tổng dung lượng hồ sơ đã vượt giới hạn.", requestId, 400);
    }

    if (documentType === "CERTIFICATE") {
      if (
        !replaceFileId &&
        files.filter((file) => file.documentType === "CERTIFICATE").length >= MAX_CERTIFICATE_PHOTOS
      ) {
        return fail(
          "VERSION_CONFLICT",
          `Tối đa ${MAX_CERTIFICATE_PHOTOS} ảnh Giấy chứng nhận.`,
          requestId,
          409,
        );
      }
    } else {
      /*
       * Chủ sử dụng đọc từ **lớp dữ liệu đang có hiệu lực**, không từ `record.draft` như đường
       * người dân: khi hồ sơ đã được nhận xử lý thì cán bộ làm việc trên `working_payload`, và chủ
       * sử dụng do cán bộ thêm ở Bàn làm việc PL3 chỉ tồn tại ở lớp đó. Đọc `draft_json` là ảnh
       * CCCD của chủ vừa thêm không gắn được vào ai.
       */
      const owners = effectivePayload(record)?.owners;
      if (!Array.isArray(owners)) {
        return fail(
          "VERSION_CONFLICT",
          "Dữ liệu hồ sơ chưa đầy đủ. Tải lại trang và thử lại.",
          requestId,
          409,
        );
      }
      const owner = owners.find((candidate) => candidate.id === ownerId);
      if (!owner || !requiresCitizenId(owner.ownerType)) {
        return fail("VALIDATION_FAILED", "Chủ sử dụng của ảnh CCCD không hợp lệ.", requestId, 400);
      }
      const existing = files.find(
        (file) => file.ownerId === ownerId && file.documentType === documentType,
      );
      /*
       * Mỗi chủ chỉ một ảnh cho từng mặt CCCD. Đòi `replaceFileId` khớp đúng ảnh đang có thay vì im
       * lặng cho ghi đè: `appendFile` tự đánh `REPLACED` cho ảnh cùng chủ + cùng mặt, nên một lần
       * bấm nhầm sẽ đẩy bằng chứng đang dùng xuống lịch sử mà cán bộ không hề biết.
       */
      if (existing && existing.fileId !== replaceFileId) {
        return fail(
          "VERSION_CONFLICT",
          "Người này đã có ảnh cho mặt CCCD đó. Dùng chức năng thay ảnh nếu cần đổi.",
          requestId,
          409,
        );
      }
      if (!existing && replaceFileId) {
        return fail("VALIDATION_FAILED", "Ảnh CCCD cần thay không hợp lệ.", requestId, 400);
      }
    }

    /*
     * Tên tệp trong kho do **máy chủ** đặt, không ghép mảnh nào của tên client gửi lên — tên do máy
     * ảnh sinh hay do người dân đặt rất hay mang số CCCD, họ tên, ngày giờ, đôi khi cả toạ độ.
     *
     * Tiền tố `OFFICER` là chủ ý: nhìn thư mục Drive của hồ sơ là biết ảnh nào do cán bộ bổ sung,
     * ảnh nào do hộ dân tự tải. Ai bổ sung thì tra `audit_logs`, không nhét email vào tên tệp.
     */
    const fileName = `OFFICER-${documentType}-${Date.now()}-${randomUUID().slice(0, 8)}.${extensionFromMimeType(mimeType)}`;

    /*
     * Từ Phase 3 (lazy Drive folder) `record.driveFolderId` có thể là `null`: hồ sơ được tạo mà
     * chưa gọi Drive lần nào. Đường cán bộ đi qua **đúng** cơ chế của đường công khai —
     * `ensureSubmissionFolderReady` giữ lease PostgreSQL 60 giây, commit trước khi gọi Google, và
     * list-before-create nên retry sau sự cố nhận lại đúng thư mục đã tạo.
     *
     * Truyền thẳng `record.driveFolderId` như trước là lỗi kiểu (`string | null`) và, nếu ép kiểu
     * cho qua build, sẽ tạo phiên upload không có thư mục đích.
     */
    let folderId: string;
    try {
      folderId = await ensureSubmissionFolderReady(record);
    } catch (error) {
      if (
        error instanceof SubmissionFolderBusyError ||
        error instanceof SubmissionFolderUnavailableError
      ) {
        return fail(
          "SERVICE_UNAVAILABLE",
          "Kho ảnh đang được chuẩn bị. Vui lòng thử lại sau ít giây.",
          requestId,
          503,
          {
            "Retry-After": String(
              error instanceof SubmissionFolderBusyError ? error.retryAfterSeconds : 2,
            ),
          },
        );
      }
      throw error;
    }

    const session = await getPublicIntakeStorage().createUploadSession({
      folderId,
      fileName,
      mimeType,
      sizeBytes,
      // Lấy từ URL của chính request, không lấy từ header `Origin` do client gửi.
      browserOrigin: new URL(request.url).origin,
    });

    // URL phiên là bí mật: trả cho đúng trình duyệt đang giữ cookie, không ghi vào log hay audit.
    return NextResponse.json(
      { uploadUrl: session.uploadUrl, mimeType, requestId },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return fail(
        error.kind,
        error.message,
        requestId,
        error.kind === "UNAUTHENTICATED" ? 401 : 403,
      );
    }
    return fail("INTERNAL_ERROR", "Không tạo được phiên tải lên.", requestId, 500);
  }
}
