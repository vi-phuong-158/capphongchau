"use client";

import { useState } from "react";

async function csrfToken(): Promise<string> {
  const response = await fetch("/api/security/csrf", { cache: "no-store" });
  if (!response.ok) throw new Error();
  return ((await response.json()) as { csrfToken: string }).csrfToken;
}

interface SubmissionClaimBannerProps {
  submissionId: string;
  version: number;
  status: string;
  claimedBy: string;
  claimedAt?: string;
  currentUserEmail: string;
  isAdministrator: boolean;
  onRefresh: () => void;
}

export function SubmissionClaimBanner({
  submissionId,
  version,
  status,
  claimedBy,
  claimedAt,
  currentUserEmail,
  isAdministrator,
  onRefresh,
}: SubmissionClaimBannerProps) {
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState<"RELEASE" | "TRANSFER" | "FORCE_CLAIM" | null>(null);
  const [reason, setReason] = useState("");
  const [toEmail, setToEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  const isClaimedByMe = claimedBy.trim().toLowerCase() === currentUserEmail.trim().toLowerCase();
  const isAvailableForClaim = status === "SUBMITTED" || status === "RESUBMITTED";

  const handleAction = async (action: string, payload: Record<string, string | boolean> = {}) => {
    setLoading(true);
    setError(null);
    try {
      const token = await csrfToken();
      const res = await fetch(`/api/submissions/${submissionId}/action`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "idempotency-key": crypto.randomUUID(),
          "x-csrf-token": token,
        },
        body: JSON.stringify({
          action,
          version,
          ...payload,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || "Thao tác thất bại.");
      }
      setShowModal(null);
      setReason("");
      setToEmail("");
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Thao tác thất bại.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950/40">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-sm font-semibold text-blue-900 dark:text-blue-100">
            {claimedBy ? (
              <>
                Hồ sơ đang được xử lý bởi <span className="font-bold">{claimedBy}</span>
                {claimedAt ? ` từ ${new Date(claimedAt).toLocaleString("vi-VN")}` : ""}
              </>
            ) : (
              "Hồ sơ chưa có cán bộ tiếp nhận xử lý."
            )}
          </div>
          {error && <div className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</div>}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isAvailableForClaim && !claimedBy && (
            <button
              disabled={loading}
              onClick={() => handleAction("CLAIM")}
              className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Nhận xử lý
            </button>
          )}

          {(isClaimedByMe || isAdministrator) && claimedBy && (
            <button
              disabled={loading}
              onClick={() => setShowModal("RELEASE")}
              className="rounded bg-gray-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-700 disabled:opacity-50"
            >
              Trả lại hàng chờ
            </button>
          )}

          {(isClaimedByMe || isAdministrator) && claimedBy && (
            <button
              disabled={loading}
              onClick={() => setShowModal("TRANSFER")}
              className="rounded bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"
            >
              Chuyển giao
            </button>
          )}

          {isAdministrator && claimedBy && !isClaimedByMe && (
            <button
              disabled={loading}
              onClick={() => setShowModal("FORCE_CLAIM")}
              className="rounded bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              Mở khóa cưỡng chế
            </button>
          )}
        </div>
      </div>

      {showModal && (
        <div className="mt-4 border-t border-blue-200 pt-3 dark:border-blue-900">
          <div className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">
            {showModal === "RELEASE" && "Lý do trả lại hàng chờ (bắt buộc, ≥ 5 ký tự):"}
            {showModal === "TRANSFER" && "Chuyển giao cho cán bộ khác:"}
            {showModal === "FORCE_CLAIM" && "Lý do mở khóa cưỡng chế (bắt buộc, ≥ 5 ký tự):"}
          </div>

          {showModal === "TRANSFER" && (
            <input
              type="email"
              placeholder="Email cán bộ nhận..."
              value={toEmail}
              onChange={(e) => setToEmail(e.target.value)}
              className="mb-2 w-full rounded border p-1.5 text-xs text-gray-900 dark:bg-gray-800 dark:text-gray-100"
            />
          )}

          <textarea
            rows={2}
            placeholder="Nhập lý do..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full rounded border p-1.5 text-xs text-gray-900 dark:bg-gray-800 dark:text-gray-100"
          />

          <div className="mt-2 flex justify-end gap-2">
            <button
              onClick={() => setShowModal(null)}
              className="rounded bg-gray-200 px-3 py-1 text-xs font-medium text-gray-700 dark:bg-gray-700 dark:text-gray-200"
            >
              Hủy
            </button>
            <button
              disabled={
                loading || reason.trim().length < 5 || (showModal === "TRANSFER" && !toEmail)
              }
              onClick={() => {
                if (showModal === "RELEASE") handleAction("RELEASE", { reason });
                if (showModal === "TRANSFER") handleAction("TRANSFER", { toEmail, reason });
                if (showModal === "FORCE_CLAIM") handleAction("FORCE_CLAIM", { reason });
              }}
              className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Xác nhận
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
