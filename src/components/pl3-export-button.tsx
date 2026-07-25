"use client";

import { useState } from "react";

async function csrfToken(): Promise<string> {
  const response = await fetch("/api/security/csrf", { cache: "no-store" });
  if (!response.ok) throw new Error();
  return ((await response.json()) as { csrfToken: string }).csrfToken;
}

/** Đọc tên file trong `Content-Disposition`, mặc định nếu server không gửi. */
function fileNameFrom(header: string | null): string {
  const match = header ? /filename="([^"]+)"/.exec(header) : null;
  return match?.[1] ?? "PL3-PhongChau.xlsx";
}

export function Pl3ExportButton() {
  const [busy, setBusy] = useState(false);
  const [scope, setScope] = useState<"all" | "official" | "backlog">("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [truncatedWarning, setTruncatedWarning] = useState<string | null>(null);
  const [auditNotice, setAuditNotice] = useState<string | null>(null);

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
          (archived ? "Đã lưu bản sao vào 03_EXPORTS." : "Chưa lưu được bản sao lên Drive — file đã tải về máy."),
      );

      if (isTruncated) {
        setTruncatedWarning(
          "CẢNH BÁO: Số lượng vượt quá 20.000 bản kê khai. Dữ liệu đã bị cắt ngắn tự động.",
        );
      }

      if (auditStatus === "failed") {
        setAuditNotice("Ghi chú: Việc ghi nhật ký hệ thống bị gián đoạn, nhưng file vẫn được tải về an toàn.");
      }
    } catch {
      setMessage("Có lỗi mạng khi xuất dữ liệu.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 rounded-lg border border-stone-200 bg-stone-50 p-4">
      <div className="flex flex-wrap gap-4 text-xs text-stone-700">
        <div>
          <label className="block font-semibold mb-1 text-stone-700">Phạm vi xuất:</label>
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value as any)}
            className="rounded border border-stone-300 bg-white px-2 py-1 text-xs"
          >
            <option value="all">Tất cả (Chính thức + Tồn đọng)</option>
            <option value="official">Chỉ hồ sơ Đã tiếp nhận (PL3)</option>
            <option value="backlog">Chỉ hồ sơ Đang xử lý (Tồn đọng)</option>
          </select>
        </div>

        <div>
          <label className="block font-semibold mb-1 text-stone-700">Từ ngày (cập nhật):</label>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="rounded border border-stone-300 bg-white px-2 py-1 text-xs"
          />
        </div>

        <div>
          <label className="block font-semibold mb-1 text-stone-700">Đến ngày (cập nhật):</label>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="rounded border border-stone-300 bg-white px-2 py-1 text-xs"
          />
        </div>
      </div>

      <div className="space-y-2">
        <button
          type="button"
          onClick={exportPl3}
          disabled={busy}
          className="inline-flex rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-800 disabled:opacity-60"
        >
          {busy ? "Đang xuất…" : "Xuất PL3 (XLSX)"}
        </button>

        {message ? <p className="text-sm text-stone-700">{message}</p> : null}
        {truncatedWarning ? (
          <p className="text-sm font-bold text-red-600 bg-red-50 p-2 rounded border border-red-200">
            {truncatedWarning}
          </p>
        ) : null}
        {auditNotice ? <p className="text-xs text-stone-500 italic">{auditNotice}</p> : null}
      </div>
    </div>
  );
}
