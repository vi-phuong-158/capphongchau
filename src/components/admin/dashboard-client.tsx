"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { DashboardSummary } from "@/modules/public-intake/repository";
import { formatUserRoles } from "@/modules/common/domain";
import { DashboardExportModal } from "./dashboard-export-modal";

function formatDateVn(isoDate: string | null): string {
  if (!isoDate) return "-";
  try {
    const d = new Date(isoDate);
    if (isNaN(d.getTime())) return "-";
    return d.toLocaleString("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "-";
  }
}

export function DashboardClient({
  initialSummary,
  canExport = false,
}: {
  initialSummary: DashboardSummary;
  canExport?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [summary, setSummary] = useState<DashboardSummary>(initialSummary);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fromDate = searchParams.get("from") ?? "";
  const toDate = searchParams.get("to") ?? "";
  const officer = searchParams.get("officer") ?? "";
  const status = searchParams.get("status") ?? "";

  const updateFilters = (newFilters: {
    from?: string;
    to?: string;
    officer?: string;
    status?: string;
  }) => {
    const params = new URLSearchParams(searchParams.toString());

    if (newFilters.from !== undefined) {
      if (newFilters.from) params.set("from", newFilters.from);
      else params.delete("from");
    }

    if (newFilters.to !== undefined) {
      if (newFilters.to) params.set("to", newFilters.to);
      else params.delete("to");
    }

    if (newFilters.officer !== undefined) {
      if (newFilters.officer) params.set("officer", newFilters.officer);
      else params.delete("officer");
    }

    if (newFilters.status !== undefined) {
      if (newFilters.status) params.set("status", newFilters.status);
      else params.delete("status");
    }

    router.push(`/admin/dashboard?${params.toString()}`);
  };

  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    let active = true;

    async function refresh() {
      setIsRefreshing(true);
      try {
        const params = new URLSearchParams(searchParams.toString());
        const res = await fetch(`/api/dashboard/summary?${params.toString()}`, {
          cache: "no-store",
        });
        if (res.ok && active) {
          const data = await res.json();
          setSummary(data.summary);
        }
      } finally {
        if (active) setIsRefreshing(false);
      }
    }

    refresh();

    return () => {
      active = false;
    };
  }, [searchParams]);

  const buildQueueUrl = (updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === "") {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    }
    return `/submissions?${params.toString()}`;
  };

  const cards = [
    {
      label: "Tổng cộng",
      value: summary.totals.total,
      color: "text-stone-700",
      bg: "bg-white border border-stone-200",
      href: buildQueueUrl({ bucket: null, unassigned: null, actionType: null }),
    },
    {
      label: "Chờ tiếp nhận",
      value: summary.totals.pending,
      color: "text-amber-700",
      bg: "bg-amber-50",
      href: buildQueueUrl({ bucket: "pending", unassigned: null, actionType: null }),
    },
    {
      label: "Đang xử lý",
      value: summary.totals.inProgress,
      color: "text-sky-700",
      bg: "bg-sky-50",
      href: buildQueueUrl({ bucket: "in-progress", unassigned: null, actionType: null }),
    },
    {
      label: "Đã hoàn thành xử lý",
      value: summary.totals.accepted,
      color: "text-emerald-700",
      bg: "bg-emerald-50",
      href: buildQueueUrl({ bucket: "accepted", unassigned: null, actionType: null }),
    },
    {
      label: "Chưa phân công",
      value: summary.totals.unassigned,
      color: "text-rose-700",
      bg: "bg-rose-50",
      href: buildQueueUrl({ unassigned: "1", bucket: null, actionType: null }),
    },
  ];

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-8 bg-[#f7f5f3]">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-cherry-900">Tổng quan điều hành</h1>
          <p className="text-stone-500 mt-1">Giám sát tiến độ xử lý hồ sơ của toàn bộ cán bộ và hệ thống.</p>
        </div>
        <div className="flex gap-3">
          {canExport && (
            <button onClick={() => setIsExportOpen(true)} className="pc-button-quiet text-sm">
              Xuất PL3
            </button>
          )}
          <Link
            href={`/submissions?${new URLSearchParams(searchParams.toString()).toString()}`}
            className="pc-button text-sm"
          >
            Vào hàng chờ
          </Link>
        </div>
      </div>

      <div className="pc-card p-4 bg-white flex flex-wrap gap-4 items-end shadow-sm">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-semibold mb-1 text-stone-700">Lọc theo cán bộ</label>
          <select
            className="pc-select w-full"
            value={officer}
            onChange={(e) => updateFilters({ officer: e.target.value })}
            disabled={isRefreshing}
          >
            <option value="">Tất cả tài khoản</option>
            {summary.officers.map((o) => (
              <option key={o.email} value={o.email}>
                {o.displayName} ({o.email})
              </option>
            ))}
          </select>
        </div>
        <div className="w-40">
          <label className="block text-xs font-semibold mb-1 text-stone-700">
            Từ ngày (hành động)
          </label>
          <input
            type="date"
            className="pc-input w-full"
            value={fromDate}
            onChange={(e) => updateFilters({ from: e.target.value })}
            disabled={isRefreshing}
          />
        </div>
        <div className="flex-1 min-w-[160px]">
          <label className="block text-xs font-semibold mb-1 text-stone-700">Trạng thái</label>
          <select
            className="pc-select w-full"
            value={status}
            onChange={(e) => updateFilters({ status: e.target.value })}
            disabled={isRefreshing}
          >
            <option value="">Tất cả</option>
            <option value="SUBMITTED">Chờ tiếp nhận</option>
            <option value="UNDER_REVIEW">Đang xử lý</option>
            <option value="NEEDS_SUPPLEMENT">Cần bổ sung</option>
            <option value="RESUBMITTED">Đã gửi lại</option>
            <option value="ACCEPTED">Đã hoàn thành xử lý</option>
            <option value="REJECTED">Từ chối</option>
          </select>
        </div>
        <div className="w-40">
          <label className="block text-xs font-semibold mb-1 text-stone-700">Đến ngày</label>
          <input
            type="date"
            className="pc-input w-full"
            value={toDate}
            onChange={(e) => updateFilters({ to: e.target.value })}
            disabled={isRefreshing}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {cards.map((card, i) => (
          <Link
            href={card.href}
            key={i}
            className={`rounded-xl p-4 shadow-sm border border-stone-200 ${card.bg} block hover:opacity-80 transition`}
          >
            <p className="text-sm font-medium text-stone-600 mb-1">{card.label}</p>
            <p className={`text-3xl font-bold ${card.color}`}>{card.value.toLocaleString()}</p>
          </Link>
        ))}
      </div>

      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-bold text-stone-800">Kết quả xử lý theo tài khoản</h2>
          <p className="text-sm text-stone-500 mt-1">
            Khoảng ngày áp dụng cho Đã tiếp nhận, Đã hoàn thành và Hoạt động cuối. Đang xử lý là số hồ sơ hiện tại.
          </p>
        </div>
        <div className="pc-card bg-white overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-stone-50 text-stone-500 border-b border-stone-200">
                <tr>
                  <th className="px-4 py-3 font-semibold">Họ tên</th>
                  <th className="px-4 py-3 font-semibold">Tài khoản</th>
                  <th className="px-4 py-3 font-semibold">Vai trò</th>
                  <th className="px-4 py-3 font-semibold">Trạng thái</th>
                  <th className="px-4 py-3 font-semibold text-right text-indigo-700">
                    Đã tiếp nhận
                  </th>
                  <th className="px-4 py-3 font-semibold text-right text-sky-700">Đang xử lý</th>
                  <th className="px-4 py-3 font-semibold text-right text-emerald-700">
                    Đã hoàn thành xử lý
                  </th>
                  <th className="px-4 py-3 font-semibold text-stone-500">Hoạt động cuối trong kỳ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {summary.officers.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-stone-500">
                      Không có dữ liệu
                    </td>
                  </tr>
                ) : (
                  summary.officers.map((o) => (
                    <tr key={o.email} className="hover:bg-stone-50/50">
                      <td className="px-4 py-3 font-medium text-stone-900">{o.displayName}</td>
                      <td className="px-4 py-3 text-xs text-stone-500">{o.email}</td>
                      <td className="px-4 py-3 text-xs text-stone-700 font-medium">
                        {formatUserRoles(o.roles)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${
                            o.active
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : "bg-stone-100 text-stone-600 border-stone-300"
                          }`}
                        >
                          {o.active ? "Hoạt động" : "Đã khóa"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-indigo-700">
                        {o.claimedCount > 0 ? (
                          <Link
                            href={buildQueueUrl({
                              officer: o.email,
                              actionType: "claimed",
                              bucket: null,
                              unassigned: null,
                              status: null,
                            })}
                            className="hover:underline font-bold"
                          >
                            {o.claimedCount}
                          </Link>
                        ) : (
                          "0"
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-sky-700">
                        {o.inProgressCount > 0 ? (
                          <Link
                            href={buildQueueUrl({
                              officer: o.email,
                              bucket: "in-progress",
                              actionType: null,
                              unassigned: null,
                              status: null,
                              from: null,
                              to: null,
                            })}
                            className="hover:underline font-bold"
                          >
                            {o.inProgressCount}
                          </Link>
                        ) : (
                          "0"
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-emerald-700">
                        {o.completedCount > 0 ? (
                          <Link
                            href={buildQueueUrl({
                              officer: o.email,
                              actionType: "completed",
                              bucket: null,
                              unassigned: null,
                              status: null,
                            })}
                            className="hover:underline font-bold"
                          >
                            {o.completedCount}
                          </Link>
                        ) : (
                          "0"
                        )}
                      </td>

                      <td className="px-4 py-3 text-xs text-stone-500">
                        {formatDateVn(o.lastActivity)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <DashboardExportModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        officers={summary.officers}
        initialFromDate={fromDate}
        initialToDate={toDate}
        initialOfficer={officer}
        initialStatus={status}
      />
    </div>
  );
}
