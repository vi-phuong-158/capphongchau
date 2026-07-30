"use client";

import { useState } from "react";

import { canonicalImageMimeType } from "@/modules/public-intake/image-format";
import { safeUploadFileName } from "@/modules/public-intake/image-normalization.client";
import { uploadWithResume, UploadCancelledError } from "@/modules/public-intake/resumable-upload";
import { createXhrTransport } from "@/modules/public-intake/xhr-upload-transport.client";
import { requiresCitizenId, type OwnerType } from "@/modules/public-intake/types";
import type { DocumentFile } from "@/components/admin/document-viewer";

type DocumentType = DocumentFile["documentType"];

export type UploadableOwner = {
  readonly id: string;
  readonly ownerType: string;
  readonly fullName: string;
};

const DOCUMENT_TYPE_LABELS: Readonly<Record<DocumentType, string>> = {
  CERTIFICATE: "Giấy chứng nhận",
  CITIZEN_ID_FRONT: "CCCD — mặt trước",
  CITIZEN_ID_BACK: "CCCD — mặt sau",
};

async function csrfToken(): Promise<string> {
  const response = await fetch("/api/security/csrf", { cache: "no-store" });
  if (!response.ok) throw new Error("Không lấy được mã bảo mật. Tải lại trang rồi thử lại.");
  return ((await response.json()) as { csrfToken: string }).csrfToken;
}

async function errorMessage(response: Response, fallback: string): Promise<string> {
  const data = (await response.json().catch(() => null)) as {
    error?: { message?: string };
  } | null;
  return data?.error?.message ?? fallback;
}

/**
 * Cán bộ tự tải ảnh giấy tờ bổ sung vào hồ sơ (Đợt 2C).
 *
 * Vì sao cần: hồ sơ hộ dân nộp thiếu ảnh là chuyện thường — thiếu một mặt CCCD, thiếu trang GCN.
 * Trước bản này đường duy nhất là bảo hộ dân mở lại phiên kê khai và tự tải, mà phiên đó đã khóa
 * khi cán bộ nhận xử lý. Cán bộ đang ngồi trước mặt hộ dân với ảnh trong tay thì không có nút nào.
 *
 * Ba điều được giữ có chủ ý:
 *
 *   1. **Không chuẩn hóa ảnh ở client** như luồng của người dân. Bên đó nén để hộ dân dùng 3G tải
 *      được ảnh 12 MP; cán bộ ngồi máy có dây và cần giữ nguyên nét để đọc số GCN. Trần
 *      `MAX_UPLOAD_MB` của server vẫn áp, nên ảnh quá lớn bị từ chối kèm thông điệp rõ.
 *   2. **Thay ảnh phải chọn tường minh.** Khi mặt CCCD đó đã có ảnh, ô chọn tệp bị khóa cho tới khi
 *      cán bộ tích "Thay ảnh đang có" — server cũng từ chối lượt không kèm `replaceFileId`, đây chỉ
 *      là lớp thứ nhất. Ảnh cũ chuyển sang `REPLACED`, không bị xóa.
 *   3. **Không có tiến độ phần trăm.** Ảnh giấy tờ vài MB trên mạng của phường xong trong 1–2 giây;
 *      một thanh tiến độ nhấp nháy rồi biến mất chỉ thêm nhiễu. Vẫn dùng `uploadWithResume` để được
 *      thử lại tự động khi mạng chớp tắt.
 */
export function OfficerFileUpload({
  submissionId,
  files,
  owners,
  onUploaded,
}: {
  readonly submissionId: string;
  readonly files: readonly DocumentFile[];
  readonly owners: readonly UploadableOwner[];
  readonly onUploaded: () => Promise<void> | void;
}) {
  const [documentType, setDocumentType] = useState<DocumentType>("CERTIFICATE");
  const identityOwners = owners.filter((owner) => requiresCitizenId(owner.ownerType as OwnerType));
  const [ownerId, setOwnerId] = useState(identityOwners[0]?.id ?? "");
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const isIdentity = documentType !== "CERTIFICATE";
  /** Ảnh đang chiếm đúng chỗ này — chỉ CCCD có khái niệm "một chỗ một ảnh". */
  const occupying = isIdentity
    ? files.find((file) => file.documentType === documentType && file.ownerId === ownerId)
    : undefined;
  const needsReplaceConfirmation = Boolean(occupying);
  const missingOwner = isIdentity && !ownerId;
  const blocked = busy || missingOwner || (needsReplaceConfirmation && !confirmReplace);

  const reset = (next: Partial<{ documentType: DocumentType; ownerId: string }>) => {
    if (next.documentType) setDocumentType(next.documentType);
    if (next.ownerId !== undefined) setOwnerId(next.ownerId);
    setConfirmReplace(false);
    setError(null);
    setDone(null);
  };

  const handleFile = async (file: File) => {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const declaredMimeType = canonicalImageMimeType(file.type, file.name);
      if (!declaredMimeType) {
        setError("Không nhận dạng được định dạng tệp. Chọn ảnh JPG, PNG, WebP hoặc HEIC.");
        return;
      }

      const token = await csrfToken();
      const replaceFileId = occupying?.fileId ?? "";
      const headers = {
        "content-type": "application/json",
        "x-csrf-token": token,
      };

      const initiate = await fetch(`/api/submissions/${submissionId}/uploads/initiate`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          documentType,
          ownerId: isIdentity ? ownerId : "",
          replaceFileId,
          // Tên trung tính, KHÔNG phải tên tệp gốc: tên do máy ảnh hay hộ dân đặt hay mang số CCCD,
          // họ tên, ngày giờ. Server cũng tự đặt lại tên, đây chỉ để suy ra loại ảnh.
          fileName: safeUploadFileName(
            documentType === "CERTIFICATE" ? "CERTIFICATE" : "CITIZEN_ID",
            declaredMimeType,
          ),
          mimeType: declaredMimeType,
          sizeBytes: file.size,
        }),
      });
      if (!initiate.ok) {
        setError(await errorMessage(initiate, "Không tạo được phiên tải lên."));
        return;
      }
      // Dùng đúng loại server đã đăng ký với phiên, không dùng lại `file.type`.
      const { uploadUrl, mimeType } = (await initiate.json()) as {
        uploadUrl: string;
        mimeType: string;
      };

      let driveFileId: string;
      try {
        driveFileId = await uploadWithResume({
          uploadUrl,
          file,
          contentType: mimeType,
          transport: createXhrTransport(),
        });
      } catch (reason) {
        setError(
          reason instanceof UploadCancelledError
            ? "Đã hủy tải ảnh."
            : reason instanceof Error
              ? `${reason.message} Kiểm tra mạng rồi chọn lại tệp.`
              : "Tải ảnh lên thất bại.",
        );
        return;
      }

      const idempotencyKey = crypto.randomUUID();
      let complete: Response | undefined;
      let lastNetworkError: unknown;

      for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
          complete = await fetch(`/api/submissions/${submissionId}/uploads/complete`, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-csrf-token": token,
              "idempotency-key": idempotencyKey,
            },
            body: JSON.stringify({
              driveFileId,
              documentType,
              ownerId: isIdentity ? ownerId : "",
              replaceFileId,
            }),
          });
          if (complete.ok || complete.status < 500) break;
        } catch (networkError) {
          lastNetworkError = networkError;
        }
        if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
      }

      if (!complete) {
        throw lastNetworkError ?? new Error("Không thể kết nối đến máy chủ.");
      }
      if (!complete.ok) {
        setError(await errorMessage(complete, "Không nhận được ảnh vừa tải lên."));
        return;
      }

      setConfirmReplace(false);
      setDone(
        replaceFileId
          ? `Đã thay ${DOCUMENT_TYPE_LABELS[documentType]}.`
          : `Đã thêm ${DOCUMENT_TYPE_LABELS[documentType]}.`,
      );
      await onUploaded();
    } catch (globalError) {
      setError(
        globalError instanceof Error
          ? globalError.message
          : "Đã có lỗi không xác định. Vui lòng tải lại trang.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt-2 rounded-xl border border-stone-200 bg-white p-3 shadow-sm">
      <h3 className="text-xs font-bold uppercase tracking-wider text-stone-800">
        Tải thêm ảnh giấy tờ
      </h3>
      <p className="mt-1 text-xs text-stone-500">
        Dùng khi hộ dân nộp thiếu ảnh. Ảnh tải ở đây được ghi nhận là do cán bộ bổ sung.
      </p>

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium text-stone-700">Loại giấy tờ</span>
          <select
            value={documentType}
            disabled={busy}
            onChange={(event) => reset({ documentType: event.target.value as DocumentType })}
            className="rounded-lg border border-stone-300 px-2 py-1.5 text-xs"
          >
            {(Object.keys(DOCUMENT_TYPE_LABELS) as DocumentType[]).map((type) => (
              <option key={type} value={type}>
                {DOCUMENT_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </label>

        {isIdentity && (
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-medium text-stone-700">Của chủ sử dụng</span>
            <select
              value={ownerId}
              disabled={busy}
              onChange={(event) => reset({ ownerId: event.target.value })}
              className="rounded-lg border border-stone-300 px-2 py-1.5 text-xs"
            >
              <option value="">— Chọn chủ sử dụng —</option>
              {identityOwners.map((owner, index) => (
                <option key={owner.id} value={owner.id}>
                  {`Chủ ${index + 1}${owner.fullName ? ` — ${owner.fullName}` : ""}`}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium text-stone-700">Chọn ảnh</span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            disabled={blocked}
            onChange={(event) => {
              const file = event.target.files?.[0];
              // Xóa giá trị input để chọn lại đúng tệp đó sau một lượt lỗi vẫn kích hoạt `change`.
              event.target.value = "";
              if (file) void handleFile(file);
            }}
            className="text-xs file:mr-2 file:rounded-lg file:border-0 file:bg-emerald-700 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white disabled:opacity-50"
          />
        </label>
      </div>

      {missingOwner && (
        <p className="mt-2 text-xs text-amber-800">
          {identityOwners.length === 0
            ? "Hồ sơ chưa có chủ sử dụng nào cần ảnh CCCD. Thêm chủ sử dụng ở Bàn làm việc trước."
            : "Chọn chủ sử dụng của ảnh CCCD trước khi chọn tệp."}
        </p>
      )}

      {needsReplaceConfirmation && (
        <label className="mt-2 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
          <input
            type="checkbox"
            checked={confirmReplace}
            disabled={busy}
            onChange={(event) => setConfirmReplace(event.target.checked)}
            className="mt-0.5"
          />
          <span>
            Mặt CCCD này của chủ đã chọn <strong>đã có ảnh</strong>. Tích vào đây để thay bằng ảnh
            mới. Ảnh cũ được giữ trong lịch sử hồ sơ, không bị xóa.
          </span>
        </label>
      )}

      {busy && <p className="mt-2 text-xs text-stone-600">Đang tải ảnh lên…</p>}
      {error && <p className="mt-2 text-xs font-medium text-rose-700">{error}</p>}
      {done && !error && <p className="mt-2 text-xs font-medium text-emerald-700">{done}</p>}
    </section>
  );
}
