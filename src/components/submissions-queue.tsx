"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { assignedOfficerLabel } from "@/modules/submissions/assigned-officer";
import type { PublicStatus } from "@/modules/public-intake/repository";
import { mayClaim } from "@/modules/submissions/review";

type Summary = {
  submissionId: string;
  receiptCode: string;
  status: string;
  phone: string;
  issueNumber: string;
  ownerName: string;
  claimedBy: string | null;
  claimedByDisplayName?: string | null;
  updatedAt: string;
};

const labels: Record<string, string> = {
  DRAFT: "Nháp",
  SUBMITTED: "Chờ tiếp nhận",
  UNDER_REVIEW: "Đang xử lý",
  NEEDS_SUPPLEMENT: "Cần bổ sung",
  RESUBMITTED: "Đã gửi lại",
  ACCEPTING: "Đang tiếp nhận",
  ACCEPTED: "Đã tiếp nhận",
  REJECTED: "Từ chối",
  EXPIRED: "Hết hạn",
};

const statusStyles: Record<string, { label: string; bg: string }> = {
  SUBMITTED: { label: "Chờ tiếp nhận", bg: "bg-amber-50 text-amber-800 border-amber-200" },
  UNDER_REVIEW: { label: "Đang xử lý", bg: "bg-sky-50 text-sky-800 border-sky-200" },
  // "(hồ sơ cũ)": luồng yêu cầu bổ sung đã bỏ ở 2A-1 nên không hồ sơ mới nào vào trạng thái này;
  // từ 2A-3 các hồ sơ còn lại tiếp nhận được như bình thường nên được đếm vào "Chờ tiếp nhận".
  NEEDS_SUPPLEMENT: {
    label: "Cần bổ sung (hồ sơ cũ)",
    bg: "bg-orange-50 text-orange-800 border-orange-200",
  },
  RESUBMITTED: { label: "Đã gửi lại", bg: "bg-blue-50 text-blue-800 border-blue-200" },
  REJECTED: { label: "Từ chối", bg: "bg-rose-50 text-rose-800 border-rose-200" },
  ACCEPTING: {
    label: "Đang tiếp nhận",
    bg: "bg-emerald-50 text-emerald-800 border-emerald-200 animate-pulse",
  },
  ACCEPTED: { label: "Đã tiếp nhận", bg: "bg-emerald-50 text-emerald-800 border-emerald-200" },
  DRAFT: { label: "Nháp", bg: "bg-stone-50 text-stone-700 border-stone-200" },
  EXPIRED: { label: "Hết hạn", bg: "bg-stone-50 text-stone-600 border-stone-200" },
};

const SEARCH_DEBOUNCE_MS = 350;

export function SubmissionsQueue() {
  const searchParams = useSearchParams();
  const initialOfficer = searchParams?.get("officer") ?? "";
  const initialStatus = searchParams?.get("status") ?? "";

  const [items, setItems] = useState<readonly Summary[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [status, setStatus] = useState(initialStatus);
  const [officer, setOfficer] = useState(initialOfficer);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    const normalizedQuery = query.trim();
    const nextQuery = normalizedQuery.length >= 2 ? normalizedQuery : "";
    if (nextQuery === debouncedQuery) return;

    const timeout = window.setTimeout(
      () => {
        setState("loading");
        setDebouncedQuery(nextQuery);
      },
      nextQuery ? SEARCH_DEBOUNCE_MS : 0,
    );
    return () => window.clearTimeout(timeout);
  }, [debouncedQuery, query]);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (officer) params.set("officer", officer);
    if (debouncedQuery) params.set("q", debouncedQuery);
    fetch(`/api/submissions?${params.toString()}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Không thể tải hàng chờ.");
        return (await response.json()) as { submissions: Summary[]; nextCursor: string | null };
      })
      .then((data) => {
        setItems(data.submissions);
        setNextCursor(data.nextCursor);
        setState("ready");
      })
      .catch((error: unknown) => {
        if ((error as { name?: string }).name !== "AbortError") setState("error");
      });
    return () => controller.abort();
  }, [status, officer, debouncedQuery]);

  const loadMore = (cursor: string) => {
    setLoadingMore(true);
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (officer) params.set("officer", officer);
    if (debouncedQuery) params.set("q", debouncedQuery);
    params.set("cursor", cursor);
    fetch(`/api/submissions?${params.toString()}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Không thể tải thêm hồ sơ.");
        return (await response.json()) as { submissions: Summary[]; nextCursor: string | null };
      })
      .then((data) => {
        setItems((prev) => [...prev, ...data.submissions]);
        setNextCursor(data.nextCursor);
      })
      .catch((error) => {
        console.error(error);
        alert("Có lỗi khi tải thêm hồ sơ.");
      })
      .finally(() => {
        setLoadingMore(false);
      });
  };

  // Đọc thẳng từ `mayClaim` thay vì liệt kê lại trạng thái: ô đếm này mang nhãn "Chờ tiếp nhận"
  // nên phải khớp đúng định nghĩa "tiếp nhận được" của máy chủ, không được lệch (2026-07-29).
  const countPending = items.filter((i) => mayClaim(i.status as PublicStatus)).length;
  const countReviewing = items.filter((i) => i.status === "UNDER_REVIEW").length;
  const countAccepted = items.filter((i) => i.status === "ACCEPTED").length;

  return (
    <div className="space-y-5">
      {/* Metric Cards Header */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-stone-200 bg-white p-3.5 shadow-sm">
          <span className="text-xs text-stone-500 font-medium block">Tổng hiển thị</span>
          <strong className="text-xl font-bold text-stone-900">{items.length}</strong>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3.5 shadow-sm">
          <span className="text-xs text-amber-800 font-medium block">Chờ tiếp nhận</span>
          <strong className="text-xl font-bold text-amber-900">{countPending}</strong>
        </div>
        <div className="rounded-xl border border-sky-200 bg-sky-50/50 p-3.5 shadow-sm">
          <span className="text-xs text-sky-800 font-medium block">Đang xử lý</span>
          <strong className="text-xl font-bold text-sky-900">{countReviewing}</strong>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3.5 shadow-sm">
          <span className="text-xs text-emerald-800 font-medium block">Đã tiếp nhận</span>
          <strong className="text-xl font-bold text-emerald-900">{countAccepted}</strong>
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="flex flex-col gap-3 rounded-xl border border-stone-200 bg-white p-3.5 shadow-sm sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <input
            type="text"
            placeholder="Tìm mã tiếp nhận, tên chủ hoặc số GCN…"
            className="pc-input w-full pl-9"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <svg
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <div className="flex items-center gap-3">
          <select
            className="pc-select w-full sm:w-48"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">Tất cả trạng thái</option>
            {Object.entries(labels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
          {officer && (
            <button
              onClick={() => setOfficer("")}
              className="text-xs text-stone-500 hover:text-stone-700 underline shrink-0"
            >
              Bỏ lọc cán bộ
            </button>
          )}
        </div>
        {query.trim().length === 1 ? (
          <p className="text-xs text-stone-500 md:col-span-2">Nhập ít nhất 2 ký tự để tìm kiếm.</p>
        ) : null}
      </div>

      {state === "loading" && items.length === 0 ? (
        <p className="rounded-xl bg-stone-100 p-5 text-stone-600">Đang tải hàng chờ…</p>
      ) : null}
      {state === "loading" && items.length > 0 ? (
        <p className="text-sm text-stone-500" role="status">
          Đang cập nhật danh sách…
        </p>
      ) : null}
      {state === "error" ? (
        <p className="rounded-xl border border-red-200 bg-red-50 p-5 text-red-800">
          Không thể tải hồ sơ. Hãy kiểm tra lại quyền đăng nhập và kết nối mạng.
        </p>
      ) : null}
      {state === "ready" && items.length === 0 ? (
        <p className="rounded-xl border border-stone-200 bg-white p-8 text-center text-stone-600">
          Chưa có hồ sơ phù hợp bộ lọc.
        </p>
      ) : null}
      {state !== "error" && items.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white shadow-sm">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-stone-50 text-stone-600 border-b border-stone-200 font-semibold text-xs uppercase tracking-wider">
              <tr>
                <th className="p-3.5">Mã tiếp nhận</th>
                <th className="p-3.5">Chủ sử dụng</th>
                <th className="p-3.5">GCN</th>
                <th className="p-3.5">Liên hệ</th>
                <th className="p-3.5">Trạng thái</th>
                <th className="p-3.5">Phụ trách</th>
                <th className="p-3.5 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200">
              {items.map((item) => {
                const st = statusStyles[item.status] || {
                  label: labels[item.status] ?? item.status,
                  bg: "bg-stone-50 text-stone-700 border-stone-200",
                };
                return (
                  <tr className="hover:bg-stone-50/80 transition" key={item.submissionId}>
                    <td className="p-3.5 font-bold text-emerald-900">{item.receiptCode}</td>
                    <td className="p-3.5 font-medium text-stone-900">
                      {item.ownerName || "Chưa khai"}
                    </td>
                    <td className="p-3.5 font-mono text-xs text-stone-700">
                      {item.issueNumber || "Chưa khai"}
                    </td>
                    <td className="p-3.5 font-mono text-xs text-stone-700">{item.phone}</td>
                    <td className="p-3.5">
                      <span
                        className={`inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-medium ${st.bg}`}
                      >
                        {st.label}
                      </span>
                    </td>
                    <td className="p-3.5 text-xs text-stone-600">
                      {assignedOfficerLabel({
                        claimedBy: item.claimedBy ?? "",
                        claimedByDisplayName: item.claimedByDisplayName ?? "",
                      })}
                    </td>
                    <td className="p-3.5 text-right">
                      <Link
                        className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 transition"
                        href={`/submissions/${item.submissionId}`}
                      >
                        Chi tiết →
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {nextCursor ? (
            <div className="border-t border-stone-200 p-3 text-center">
              <button
                type="button"
                className="pc-button-quiet text-sm"
                onClick={() => loadMore(nextCursor)}
                disabled={loadingMore}
              >
                {loadingMore ? "Đang tải…" : "Tải thêm hồ sơ"}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
