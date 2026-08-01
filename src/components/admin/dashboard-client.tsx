"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { DashboardSummary } from "@/modules/public-intake/repository";
import { DashboardExportModal } from "./dashboard-export-modal";

export function DashboardClient({ initialSummary }: { initialSummary: DashboardSummary }) {
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

  useEffect(() => {
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

  const cards = [
    {
      label: "Tổng hiển thị",
      value: summary.totals.total,
      color: "text-stone-900",
      bg: "bg-white",
      href: "/submissions",
    },
    {
      label: "Chờ tiếp nhận",
      value: summary.totals.pending,
      color: "text-amber-700",
      bg: "bg-amber-50",
      href: "/submissions?status=SUBMITTED",
    },
    {
      label: "Đang xử lý",
      value: summary.totals.inProgress,
      color: "text-sky-700",
      bg: "bg-sky-50",
      href: "/submissions?status=UNDER_REVIEW",
    },
    {
      label: "Đã tiếp nhận",
      value: summary.totals.accepted,
      color: "text-emerald-700",
      bg: "bg-emerald-50",
      href: "/submissions?status=ACCEPTED",
    },
    {
      label: "Chưa phân công",
      value: summary.totals.unassigned,
      color: "text-rose-700",
      bg: "bg-rose-50",
      href: "/submissions?unassigned=1",
    },
  ];

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-8 bg-[#f7f5f3]">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-cherry-900">Tổng quan điều hành</h1>
          <p className="text-stone-500 mt-1">Giám sát tiến độ xử lý hồ sơ của toàn bộ cán bộ.</p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => setIsExportOpen(true)} className="pc-button-quiet text-sm">
            Xuất PL3
          </button>
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
            <option value="">Tất cả cán bộ</option>
            {summary.officers.map((o) => (
              <option key={o.email} value={o.email}>
                {o.displayName}
              </option>
            ))}
          </select>
        </div>
        <div className="w-40">
          <label className="block text-xs font-semibold mb-1 text-stone-700">
            Từ ngày (cập nhật)
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
            <option value="ACCEPTED">Đã tiếp nhận</option>
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-4">
          <h2 className="text-lg font-bold text-stone-800">Khối lượng công việc cán bộ</h2>
          <div className="pc-card bg-white overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-stone-50 text-stone-500 border-b border-stone-200">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Cán bộ</th>
                    <th className="px-4 py-3 font-semibold text-right">Tổng</th>
                    <th className="px-4 py-3 font-semibold text-right text-sky-700">Đang xử lý</th>
                    <th className="px-4 py-3 font-semibold text-right text-emerald-700">
                      Đã hoàn thành
                    </th>
                    <th className="px-4 py-3 font-semibold">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {summary.officers.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-stone-500">
                        Không có dữ liệu
                      </td>
                    </tr>
                  ) : (
                    summary.officers.map((o) => (
                      <tr key={o.email} className="hover:bg-stone-50/50">
                        <td className="px-4 py-3">
                          <div className="font-medium text-stone-900">{o.displayName}</div>
                          <div className="text-xs text-stone-500">{o.email}</div>
                        </td>
                        <td className="px-4 py-3 text-right font-medium">{o.total}</td>
                        <td className="px-4 py-3 text-right font-medium text-sky-700">
                          {o.inProgress}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-emerald-700">
                          {o.accepted}
                        </td>
                        <td className="px-4 py-3">
                          <Link
                            href={`/submissions?officer=${encodeURIComponent(o.email)}`}
                            className="text-cherry-600 hover:text-cherry-800 font-medium"
                          >
                            Xem hồ sơ →
                          </Link>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <h2 className="text-lg font-bold text-stone-800">Hồ sơ chưa phân công</h2>
          <div className="pc-card bg-white p-6 shadow-sm flex flex-col items-center justify-center text-center space-y-4 border-t-4 border-rose-500">
            <div className="w-16 h-16 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <div>
              <p className="text-4xl font-bold text-rose-600">{summary.totals.unassigned}</p>
              <p className="text-sm font-medium text-stone-600 mt-1">Hồ sơ cần xử lý</p>
            </div>
            <p className="text-xs text-stone-500 max-w-[200px]">
              Bao gồm các hồ sơ mới gửi hoặc cần bổ sung chưa có người phụ trách.
            </p>
            <Link href="/submissions?unassigned=1" className="pc-button-quiet w-full text-sm mt-2">
              Xem hàng chờ
            </Link>
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
