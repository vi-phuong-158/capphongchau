"use client";

import { useState } from "react";
import { DashboardSummaryOfficerMetrics } from "@/modules/public-intake/repository";

async function csrfToken(): Promise<string> {
  const response = await fetch("/api/security/csrf", { cache: "no-store" });
  if (!response.ok) throw new Error();
  return ((await response.json()) as { csrfToken: string }).csrfToken;
}

function fileNameFrom(header: string | null): string {
  const match = header ? /filename="([^"]+)"/.exec(header) : null;
  return match?.[1] ?? "PL3-PhongChau.xlsx";
}

export function DashboardExportModal({
  isOpen,
  onClose,
  officers,
  initialFromDate,
  initialToDate,
  initialOfficer,
  initialStatus,
}: {
  isOpen: boolean;
  onClose: () => void;
  officers: readonly DashboardSummaryOfficerMetrics[];
  initialFromDate: string;
  initialToDate: string;
  initialOfficer: string;
  initialStatus: string;
}) {
  const [busy, setBusy] = useState(false);
  const [scope, setScope] = useState<"all" | "official" | "backlog">("all");
  const [fromDate, setFromDate] = useState(initialFromDate);
  const [toDate, setToDate] = useState(initialToDate);
  const [officer, setOfficer] = useState(initialOfficer);
  const [message, setMessage] = useState<string | null>(null);
  const [truncatedWarning, setTruncatedWarning] = useState<string | null>(null);
  const [auditNotice, setAuditNotice] = useState<string | null>(null);

  if (!isOpen) return null;

  async function exportPl3() {
    setBusy(true);
    setMessage(null);
    setTruncatedWarning(null);
    setAuditNotice(null);

    try {
      const token = await csrfToken();
      const query = new URLSearchParams({ scope });
      if (fromDate) query.set("from", fromDate);
      if (toDate) query.set("to", toDate);
      if (officer) query.set("officer", officer);
      if (initialStatus) query.set("status", initialStatus);

      const response = await fetch(`/api/exports?${query.toString()}`, {
        method: "POST",
        headers: { "x-csrf-token": token, "idempotency-key": crypto.randomUUID() },
      });

      if (!response.ok) {
        setMessage(
          response.status === 403
            ? "Bạn không có quyền xuất dữ liệu."
            : "Không tạo được bản kết xuất PL3.",
        );
        return;
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileNameFrom(response.headers.get("content-disposition"));
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);

      const rows = response.headers.get("x-export-row-count") ?? "0";
      const warnings = response.headers.get("x-export-warning-count") ?? "0";
      const archived = response.headers.get("x-export-archived") === "1";
      const isTruncated = response.headers.get("x-export-truncated") === "1";
      const auditStatus = response.headers.get("x-export-audit");

      setMessage(
        `Đã xuất ${rows} dòng${Number(warnings) > 0 ? `, ${warnings} cảnh báo trong sheet "Canh bao"` : ""}. ` +
          (archived
            ? "Đã lưu bản sao vào 03_EXPORTS."
            : "Chưa lưu được bản sao lên Drive — file đã tải về máy."),
      );

      if (isTruncated) {
        setTruncatedWarning(
          "CẢNH BÁO: Số lượng vượt quá 20.000 bản kê khai. Dữ liệu đã bị cắt ngắn tự động.",
        );
      }

      if (auditStatus === "failed") {
        setAuditNotice(
          "Ghi chú: Việc ghi nhật ký hệ thống bị gián đoạn, nhưng file vẫn được tải về an toàn.",
        );
      }
    } catch {
      setMessage("Có lỗi mạng khi xuất dữ liệu.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-lg rounded-xl bg-white shadow-xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-lg font-bold text-cherry-900">Xuất báo cáo PL3</h2>
          <button
            onClick={onClose}
            className="text-stone-400 hover:text-stone-600 transition-colors"
            disabled={busy}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold mb-1 text-stone-700">
                Phạm vi xuất
              </label>
              <select
                value={scope}
                onChange={(e) => setScope(e.target.value as "all" | "official" | "backlog")}
                className="pc-select w-full"
                disabled={busy}
              >
                <option value="all">Tất cả (Chính thức + Tồn đọng)</option>
                <option value="official">Chỉ hồ sơ Đã tiếp nhận (PL3)</option>
                <option value="backlog">Chỉ hồ sơ Đang xử lý (Tồn đọng)</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold mb-1 text-stone-700">
                Lọc theo Cán bộ
              </label>
              <select
                value={officer}
                onChange={(e) => setOfficer(e.target.value)}
                className="pc-select w-full"
                disabled={busy}
              >
                <option value="">Tất cả cán bộ</option>
                {officers.map((o) => (
                  <option key={o.email} value={o.email}>
                    {o.displayName}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold mb-1 text-stone-700">
                  Từ ngày (cập nhật)
                </label>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="pc-input w-full"
                  disabled={busy}
                />
              </div>

              <div>
                <label className="block text-sm font-semibold mb-1 text-stone-700">
                  Đến ngày (cập nhật)
                </label>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="pc-input w-full"
                  disabled={busy}
                />
              </div>
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t border-stone-100">
            {message && (
              <div
                className={`p-3 rounded-md text-sm border ${
                  message.includes("lỗi") || message.includes("không có quyền")
                    ? "bg-rose-50 text-rose-800 border-rose-200"
                    : "bg-emerald-50 text-emerald-800 border-emerald-200"
                }`}
                role="alert"
              >
                {message}
              </div>
            )}

            {truncatedWarning && (
              <div
                className="p-3 rounded-md text-sm border bg-orange-50 text-orange-800 border-orange-200"
                role="alert"
              >
                {truncatedWarning}
              </div>
            )}

            {auditNotice && (
              <div
                className="p-3 rounded-md text-sm border bg-sky-50 text-sky-800 border-sky-200"
                role="alert"
              >
                {auditNotice}
              </div>
            )}
          </div>
        </div>

        <div className="border-t bg-stone-50 px-6 py-4 flex justify-end gap-3 rounded-b-xl">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="pc-button-quiet text-sm"
          >
            Đóng
          </button>
          <button
            type="button"
            onClick={exportPl3}
            disabled={busy}
            className="pc-button text-sm flex items-center"
          >
            {busy ? (
              <>
                <svg
                  className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                Đang xuất…
              </>
            ) : (
              "Xuất dữ liệu"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
