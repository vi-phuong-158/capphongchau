"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

export type DocumentFile = {
  fileId: string;
  documentType: "CITIZEN_ID_FRONT" | "CITIZEN_ID_BACK" | "CERTIFICATE";
  ownerId: string;
};

interface DocumentViewerProps {
  submissionId: string;
  files: readonly DocumentFile[];
  ownerIds: readonly string[];
  /**
   * Gỡ ảnh đang xem khỏi hồ sơ (Đợt 2C). Không truyền = không hiện nút, nên quyền "ai được gỡ" nằm ở
   * bên gọi chứ không nằm ở đây — cùng nơi đã quyết định có hiện ô tải ảnh hay không.
   *
   * Chỉ ảnh Giấy chứng nhận gỡ được; server cũng từ chối loại khác. Nút không hiện với ảnh CCCD.
   */
  onDeleteFile?: (fileId: string) => Promise<void>;
}

export function documentFileLabel(
  file: DocumentFile,
  files: readonly DocumentFile[],
  ownerIds: readonly string[],
): string {
  if (file.documentType === "CERTIFICATE") {
    return `GCN trang ${files.slice(0, files.indexOf(file) + 1).filter((item) => item.documentType === "CERTIFICATE").length}`;
  }
  const ownerNumber = ownerIds.indexOf(file.ownerId) + 1;
  const ownerLabel = ownerNumber > 0 ? `chủ ${ownerNumber}` : "chủ chưa gắn";
  const side = file.documentType === "CITIZEN_ID_FRONT" ? "mặt trước" : "mặt sau";
  return `CCCD ${ownerLabel} — ${side}`;
}

export function DocumentViewer(props: DocumentViewerProps) {
  const filesKey = props.files.map((file) => file.fileId).join(":");
  return <DocumentViewerState key={filesKey} {...props} />;
}

/**
 * Tải ảnh xem trước **theo yêu cầu** và giữ lại trong bộ nhớ của trang.
 *
 * Vì sao không để `<img src>` tự tải: route ảnh trả `cache-control: private, no-store` — đúng, ảnh
 * giấy tờ là PII, không được nằm trong cache đĩa của trình duyệt — nên mỗi lần thẻ `<img>` được
 * mount lại là một lần tải lại từ Drive kèm một dòng audit nữa. Hệ quả trước đây: mở toàn màn hình
 * render thêm một `<img>` cùng `src` nên tải đúng ảnh đó **hai lần**, và chuyển qua lại giữa các
 * tab ảnh thì lần nào cũng tải lại từ đầu.
 *
 * Cách làm: fetch một lần cho mỗi ảnh thành blob, rồi dùng chung object URL cho cả khung nhỏ và
 * khung toàn màn hình. Ảnh chỉ được tải khi cán bộ thật sự chọn nó, và object URL được thu hồi khi
 * rời trang để không giữ ảnh PII trong bộ nhớ lâu hơn mức cần.
 */
function usePreviewImages(submissionId: string) {
  const cache = useRef(new Map<string, string>());
  const pending = useRef(new Set<string>());
  const [, bumpRender] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const cached = cache.current;
    return () => {
      for (const url of cached.values()) URL.revokeObjectURL(url);
      cached.clear();
    };
  }, []);

  const request = useCallback(
    (fileId: string) => {
      if (cache.current.has(fileId) || pending.current.has(fileId)) return;
      pending.current.add(fileId);
      setErrors((previous) => {
        if (!(fileId in previous)) return previous;
        const next = { ...previous };
        delete next[fileId];
        return next;
      });
      fetch(`/api/submissions/${submissionId}/files/${fileId}`, { cache: "no-store" })
        .then(async (response) => {
          if (!response.ok) {
            const data = (await response.json().catch(() => null)) as {
              error?: { message?: string };
            } | null;
            throw new Error(data?.error?.message ?? "Không tải được ảnh xem trước.");
          }
          return response.blob();
        })
        .then((blob) => {
          cache.current.set(fileId, URL.createObjectURL(blob));
          bumpRender((value) => value + 1);
        })
        .catch((reason: unknown) => {
          setErrors((previous) => ({
            ...previous,
            [fileId]:
              reason instanceof Error ? reason.message : "Không tải được ảnh xem trước.",
          }));
        })
        .finally(() => {
          pending.current.delete(fileId);
        });
    },
    [submissionId],
  );

  return {
    request,
    sourceFor: (fileId: string) => cache.current.get(fileId) ?? null,
    errorFor: (fileId: string) => errors[fileId] ?? null,
  };
}

function DocumentViewerState({
  submissionId,
  files,
  ownerIds,
  onDeleteFile,
}: DocumentViewerProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  /** Xác nhận hai bước ngay tại chỗ — `window.confirm` bị chặn ở một số cấu hình trình duyệt. */
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const lightboxTitleId = useId();
  const { request: requestPreview, sourceFor, errorFor } = usePreviewImages(submissionId);
  /** Chỉ tải ảnh đang được chọn — các ảnh còn lại chờ cán bộ bấm sang tab của nó. */
  const activeFileId = (files[selectedIndex] || files[0])?.fileId ?? null;
  useEffect(() => {
    if (activeFileId) requestPreview(activeFileId);
  }, [activeFileId, requestPreview]);

  useEffect(() => {
    if (!fullscreen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [fullscreen]);

  if (files.length === 0) {
    return (
      <div className="flex h-64 flex-col items-center justify-center rounded-xl border border-dashed border-stone-300 bg-stone-50 p-6 text-center text-stone-500">
        <svg
          className="h-10 w-10 text-stone-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
        <p className="mt-2 text-sm font-medium">Chưa có ảnh giấy tờ được tải lên</p>
      </div>
    );
  }

  const activeFile = files[selectedIndex] || files[0];
  const activeLabel = documentFileLabel(activeFile, files, ownerIds);
  // Chỉ ảnh GCN gỡ được: CCCD là ràng buộc bắt buộc của `completionChecks`, luồng đúng là thay ảnh.
  const canDelete = Boolean(onDeleteFile) && activeFile.documentType === "CERTIFICATE";

  const handleZoomIn = () => setZoom((z) => Math.min(z + 0.5, 3));
  const handleZoomOut = () => setZoom((z) => Math.max(z - 0.5, 1));
  const handleRotate = () => setRotation((r) => (r + 90) % 360);
  const handleReset = () => {
    setZoom(1);
    setRotation(0);
  };

  const imageSrc = sourceFor(activeFile.fileId);
  const imageError = errorFor(activeFile.fileId);

  return (
    <div className="flex flex-col rounded-xl border border-stone-200 bg-white shadow-sm overflow-hidden sticky top-4">
      {/* Header Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200 bg-stone-50 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800 border border-emerald-200">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            {activeLabel}
          </span>
          <span className="text-xs text-stone-500">
            ({selectedIndex + 1}/{files.length})
          </span>
        </div>

        {/* Action toolbar for zoom/rotate */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleZoomOut}
            disabled={zoom <= 1}
            title="Thu nhỏ"
            className="rounded p-1 text-stone-600 hover:bg-stone-200 disabled:opacity-30"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
            </svg>
          </button>
          <span className="min-w-[40px] text-center text-xs font-semibold text-stone-700">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={handleZoomIn}
            disabled={zoom >= 3}
            title="Phóng to"
            className="rounded p-1 text-stone-600 hover:bg-stone-200 disabled:opacity-30"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
          </button>
          <div className="h-4 w-px bg-stone-300 mx-1" />
          <button
            type="button"
            onClick={handleRotate}
            title="Xoay ảnh 90°"
            className="rounded p-1 text-stone-600 hover:bg-stone-200"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </button>
          {(zoom > 1 || rotation > 0) && (
            <button
              type="button"
              onClick={handleReset}
              title="Đặt lại"
              className="rounded px-1.5 py-0.5 text-xs text-amber-700 hover:bg-amber-100 font-medium"
            >
              Đặt lại
            </button>
          )}
          <div className="h-4 w-px bg-stone-300 mx-1" />
          <button
            type="button"
            onClick={() => setFullscreen(true)}
            title="Xem toàn màn hình"
            className="rounded p-1 text-stone-600 hover:bg-stone-200"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 8V4m0 0h4M4 4l5 5m11-2V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
              />
            </svg>
          </button>
          {canDelete && (
            <>
              <div className="h-4 w-px bg-stone-300 mx-1" />
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                disabled={deleting || confirmingDelete}
                title="Gỡ ảnh này khỏi hồ sơ"
                className="rounded p-1 text-rose-700 hover:bg-rose-100 disabled:opacity-40"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              </button>
            </>
          )}
        </div>
      </div>

      {canDelete && confirmingDelete && (
        <div className="flex flex-wrap items-center gap-2 border-b border-rose-200 bg-rose-50 px-4 py-2 text-xs text-rose-900">
          <span>
            Gỡ <strong>{activeLabel}</strong> khỏi hồ sơ? Ảnh vẫn được lưu lại trong lịch sử hồ sơ,
            không bị xóa khỏi kho.
          </span>
          <button
            type="button"
            disabled={deleting}
            onClick={async () => {
              setDeleting(true);
              setDeleteError(null);
              try {
                await onDeleteFile!(activeFile.fileId);
                // Danh sách ảnh do bên gọi tải lại; `key` theo bộ fileId sẽ dựng lại component nên
                // không cần tự đặt lại `selectedIndex` ở đây.
                setConfirmingDelete(false);
              } catch (reason) {
                setDeleteError(reason instanceof Error ? reason.message : "Không gỡ được ảnh.");
              } finally {
                setDeleting(false);
              }
            }}
            className="rounded bg-rose-600 px-2.5 py-1 font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
          >
            {deleting ? "Đang gỡ…" : "Xác nhận gỡ"}
          </button>
          <button
            type="button"
            disabled={deleting}
            onClick={() => setConfirmingDelete(false)}
            className="rounded border border-rose-300 px-2.5 py-1 font-medium text-rose-800 hover:bg-rose-100"
          >
            Hủy
          </button>
          {deleteError && <span className="font-medium">{deleteError}</span>}
        </div>
      )}

      {/* Image Thumbnail Selector Tabs */}
      <div className="flex gap-1.5 overflow-x-auto border-b border-stone-200 bg-stone-100 p-2">
        {files.map((file, idx) => {
          const label = documentFileLabel(file, files, ownerIds);
          const isSelected = idx === selectedIndex;
          return (
            <button
              key={file.fileId}
              type="button"
              onClick={() => {
                setSelectedIndex(idx);
                setZoom(1);
                setRotation(0);
                setConfirmingDelete(false);
                setDeleteError(null);
              }}
              className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                isSelected
                  ? "bg-white text-emerald-900 shadow-sm ring-1 ring-emerald-600/30 font-semibold"
                  : "text-stone-600 hover:bg-stone-200/70"
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${isSelected ? "bg-emerald-600" : "bg-stone-400"}`}
              />
              {label}
            </button>
          );
        })}
      </div>

      {/* Main Display Box */}
      <div className="relative h-[480px] w-full flex-1 overflow-auto bg-stone-900/95 p-4 flex items-center justify-center">
        {imageError ? (
          <div className="text-center text-sm text-stone-200">
            <p>{imageError}</p>
            <button
              type="button"
              onClick={() => requestPreview(activeFile.fileId)}
              className="mt-3 rounded bg-stone-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-stone-600"
            >
              Thử lại
            </button>
          </div>
        ) : imageSrc ? (
          <div
            className="transition-transform duration-200 ease-out flex items-center justify-center"
            style={{
              transform: `scale(${zoom}) rotate(${rotation}deg)`,
              transformOrigin: "center center",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageSrc}
              alt={activeLabel}
              decoding="async"
              className="max-h-[440px] w-auto max-w-full rounded object-contain shadow-2xl transition-all"
            />
          </div>
        ) : (
          <p className="animate-pulse text-sm text-stone-300">Đang tải ảnh…</p>
        )}
      </div>

      {/* Fullscreen Lightbox Modal */}
      {fullscreen && (
        <div
          aria-labelledby={lightboxTitleId}
          aria-modal="true"
          className="fixed inset-0 z-50 flex flex-col bg-black/95 p-4"
          role="dialog"
        >
          <div className="flex items-center justify-between border-b border-stone-800 pb-3 text-white">
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold" id={lightboxTitleId}>
                {activeLabel}
              </span>
              <span className="text-xs text-stone-400">
                ({selectedIndex + 1}/{files.length})
              </span>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleRotate}
                className="rounded bg-stone-800 px-3 py-1.5 text-xs text-stone-200 hover:bg-stone-700"
              >
                Xoay 90°
              </button>
              <button
                type="button"
                onClick={() => setFullscreen(false)}
                aria-label="Đóng xem ảnh toàn màn hình"
                className="rounded bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700"
              >
                Đóng (Esc)
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-auto flex items-center justify-center p-6">
            {/* Dùng lại đúng object URL của khung nhỏ — mở toàn màn hình không tải lại ảnh. */}
            {imageSrc ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={imageSrc}
                alt={activeLabel}
                decoding="async"
                style={{ transform: `rotate(${rotation}deg)` }}
                className="max-h-full max-w-full object-contain transition-transform"
              />
            ) : (
              <p className="animate-pulse text-sm text-stone-300">
                {imageError ?? "Đang tải ảnh…"}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
