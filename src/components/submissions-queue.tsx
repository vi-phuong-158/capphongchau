"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { assignedOfficerLabel } from "@/modules/submissions/assigned-officer";

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

export function SubmissionsQueue() {
  const [items, setItems] = useState<readonly Summary[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [query, setQuery] = useState("");
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (query.trim()) params.set("q", query.trim());
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
  }, [status, query]);

  const loadMore = (cursor: string) => {
    setLoadingMore(true);
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (query.trim()) params.set("q", query.trim());
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

  return (
    <div className="space-y-5">
      <div className="grid gap-3 rounded-xl border border-stone-200 bg-white p-4 md:grid-cols-[1fr_220px]">
        <input
          className="pc-input"
          value={query}
          onChange={(event) => {
            setState("loading");
            setQuery(event.target.value);
          }}
          placeholder="Tìm mã tiếp nhận, số GCN hoặc chủ sử dụng"
          aria-label="Tìm hồ sơ"
        />
        <select
          className="pc-input"
          value={status}
          onChange={(event) => {
            setState("loading");
            setStatus(event.target.value);
          }}
          aria-label="Lọc trạng thái"
        >
          <option value="">Tất cả trạng thái</option>
          {Object.entries(labels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      {state === "loading" ? (
        <p className="rounded-xl bg-stone-100 p-5 text-stone-600">Đang tải hàng chờ…</p>
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
      {state === "ready" && items.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-stone-100 text-stone-700">
              <tr>
                <th className="p-3">Mã tiếp nhận</th>
                <th className="p-3">Chủ sử dụng</th>
                <th className="p-3">GCN</th>
                <th className="p-3">Liên hệ</th>
                <th className="p-3">Trạng thái</th>
                <th className="p-3">Phụ trách</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr className="border-t border-stone-200" key={item.submissionId}>
                  <td className="p-3 font-medium text-stone-950">{item.receiptCode}</td>
                  <td className="p-3">{item.ownerName || "Chưa khai"}</td>
                  <td className="p-3">{item.issueNumber || "Chưa khai"}</td>
                  <td className="p-3">{item.phone}</td>
                  <td className="p-3">{labels[item.status] ?? item.status}</td>
                  <td className="p-3">
                    {assignedOfficerLabel({
                      claimedBy: item.claimedBy ?? "",
                      claimedByDisplayName: item.claimedByDisplayName ?? "",
                    })}
                  </td>
                  <td className="p-3">
                    <Link
                      className="font-semibold text-emerald-800 underline"
                      href={`/submissions/${item.submissionId}`}
                    >
                      Xem hồ sơ
                    </Link>
                  </td>
                </tr>
              ))}
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
