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
  const [message, setMessage] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("VERIFIED");

  async function exportPl3() {
    setBusy(true);
    setMessage(null);
    try {
      const token = await csrfToken();
      const response = await fetch(`/api/exports?status=${statusFilter}`, {
        method: "POST",
        headers: { "x-csrf-token": token, "idempotency-key": crypto.randomUUID() },
      });
      if (!response.ok) {
        setMessage(
          response.status === 403
            ? "Bạn không có quyền xuất dữ liệu."
            : response.status === 400
              ? "Bộ lọc không hợp lệ hoặc dữ liệu quá lớn (tối đa 2000 dòng)."
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
      setMessage(
        `Đã tạo ${rows} dòng${Number(warnings) > 0 ? `, ${warnings} cảnh báo cần rà` : ""}. ` +
          (archived ? "Đã lưu vào 03_EXPORTS." : "Chưa lưu được lên Drive — hãy thử lại sau."),
      );
    } catch {
      setMessage("Có lỗi mạng khi xuất dữ liệu.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="pc-input max-w-[200px]"
        >
          <option value="VERIFIED">Đã xác nhận</option>
          <option value="PENDING_REVIEW">Chờ kiểm tra</option>
          <option value="UPLOADED">Đã tải lên đủ file</option>
        </select>
        <button
          type="button"
          onClick={exportPl3}
          disabled={busy || !statusFilter}
          className="inline-flex rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {busy ? "Đang xuất…" : "Xuất PL3 (XLSX)"}
        </button>
      </div>
      {message ? <p className="text-sm text-stone-600">{message}</p> : null}
    </div>
  );
}
