"use client";

import { useState } from "react";

export type DocumentFile = {
  fileId: string;
  documentType: "CITIZEN_ID_FRONT" | "CITIZEN_ID_BACK" | "CERTIFICATE";
};

interface DocumentViewerProps {
  submissionId: string;
  files: DocumentFile[];
}

const DOCUMENT_TYPE_LABELS: Record<DocumentFile["documentType"], string> = {
  CITIZEN_ID_FRONT: "CCCD Mặt trước",
  CITIZEN_ID_BACK: "CCCD Mặt sau",
  CERTIFICATE: "Giấy chứng nhận",
};

export function DocumentViewer({ submissionId, files }: DocumentViewerProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);

  if (files.length === 0) {
    return (
      <div className="flex h-64 flex-col items-center justify-center rounded-xl border border-dashed border-stone-300 bg-stone-50 p-6 text-center text-stone-500">
        <svg className="h-10 w-10 text-stone-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <p className="mt-2 text-sm font-medium">Chưa có ảnh giấy tờ được tải lên</p>
      </div>
    );
  }

  const activeFile = files[selectedIndex] || files[0];
  const activeLabel =
    activeFile.documentType === "CERTIFICATE"
      ? `GCN (Trang ${files.filter((f, i) => f.documentType === "CERTIFICATE" && i <= selectedIndex).length})`
      : DOCUMENT_TYPE_LABELS[activeFile.documentType];

  const handleZoomIn = () => setZoom((z) => Math.min(z + 0.5, 3));
  const handleZoomOut = () => setZoom((z) => Math.max(z - 0.5, 1));
  const handleRotate = () => setRotation((r) => (r + 90) % 360);
  const handleReset = () => {
    setZoom(1);
    setRotation(0);
  };

  const imageSrc = `/api/submissions/${submissionId}/files/${activeFile.fileId}`;

  return (
    <div className="flex flex-col rounded-xl border border-stone-200 bg-white shadow-sm overflow-hidden sticky top-4">
      {/* Header Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200 bg-stone-50 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800 border border-emerald-200">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
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
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
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
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
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
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-2V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
            </svg>
          </button>
        </div>
      </div>

      {/* Image Thumbnail Selector Tabs */}
      <div className="flex gap-1.5 overflow-x-auto border-b border-stone-200 bg-stone-100 p-2">
        {files.map((file, idx) => {
          const label =
            file.documentType === "CITIZEN_ID_FRONT"
              ? "CCCD Trước"
              : file.documentType === "CITIZEN_ID_BACK"
                ? "CCCD Sau"
                : `GCN #${idx + 1}`;
          const isSelected = idx === selectedIndex;
          return (
            <button
              key={file.fileId}
              type="button"
              onClick={() => {
                setSelectedIndex(idx);
                setZoom(1);
                setRotation(0);
              }}
              className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                isSelected
                  ? "bg-white text-emerald-900 shadow-sm ring-1 ring-emerald-600/30 font-semibold"
                  : "text-stone-600 hover:bg-stone-200/70"
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${isSelected ? "bg-emerald-600" : "bg-stone-400"}`} />
              {label}
            </button>
          );
        })}
      </div>

      {/* Main Display Box */}
      <div className="relative h-[480px] w-full flex-1 overflow-auto bg-stone-900/95 p-4 flex items-center justify-center">
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
            className="max-h-[440px] w-auto max-w-full rounded object-contain shadow-2xl transition-all"
          />
        </div>
      </div>

      {/* Fullscreen Lightbox Modal */}
      {fullscreen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/95 p-4">
          <div className="flex items-center justify-between border-b border-stone-800 pb-3 text-white">
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold">{activeLabel}</span>
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
                className="rounded bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700"
              >
                Đóng (Esc)
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-auto flex items-center justify-center p-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageSrc}
              alt={activeLabel}
              style={{ transform: `rotate(${rotation}deg)` }}
              className="max-h-full max-w-full object-contain transition-transform"
            />
          </div>
        </div>
      )}
    </div>
  );
}
