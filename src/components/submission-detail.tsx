"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Submission = {
  submissionId: string;
  receiptCode: string;
  status: string;
  phone: string;
  version: number;
  claimedBy: string | null;
  claimedAt: string | null;
  createdAt: string;
  updatedAt: string;
  draft: {
    certificate: { issueNumber: string; issueDate: string; registryNumber: string };
    owners: {
      fullName: string;
      identityNumber: string;
      ownerType: string;
      roleOnCertificate: string;
    }[];
    parcels: {
      parcelNumber: string;
      mapSheetNumber: string;
      addressOnCertificate: string;
      addressTwoLevel: string;
      area: string;
      landUses: {
        purposeCode: string;
        originCode: string;
        formCode: string;
        termCode: string;
        area: string;
      }[];
    }[];
    assets: { assetType: string; description: string }[];
  } | null;
};

const labels: Record<string, string> = {
  SUBMITTED: "Chờ tiếp nhận",
  UNDER_REVIEW: "Đang xử lý",
  NEEDS_SUPPLEMENT: "Cần bổ sung",
  RESUBMITTED: "Đã gửi lại",
  REJECTED: "Từ chối",
  ACCEPTING: "Đang tiếp nhận",
  ACCEPTED: "Đã tiếp nhận",
  DRAFT: "Nháp",
  EXPIRED: "Hết hạn",
};

async function csrfToken() {
  const response = await fetch("/api/security/csrf", { cache: "no-store" });
  if (!response.ok) throw new Error();
  return ((await response.json()) as { csrfToken: string }).csrfToken;
}

export function SubmissionDetail({ submissionId }: { readonly submissionId: string }) {
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    fetch(`/api/submissions/${submissionId}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        return (await response.json()) as { submission: Submission };
      })
      .then((data) => setSubmission(data.submission))
      .catch(() => setMessage("Không thể tải hồ sơ."));
  }, [submissionId]);
  async function action(action: "CLAIM" | "REQUEST_SUPPLEMENT" | "REJECT") {
    if (!submission) return;
    setBusy(true);
    setMessage(null);
    try {
      const token = await csrfToken();
      const response = await fetch(`/api/submissions/${submission.submissionId}/action`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": token,
          "idempotency-key": crypto.randomUUID(),
        },
        body: JSON.stringify({ action, version: submission.version }),
      });
      const data = (await response.json()) as {
        submission?: { status: string; version: number; claimedBy?: string };
        error?: { message: string };
      };
      if (!response.ok || !data.submission)
        throw new Error(data.error?.message ?? "Không thể cập nhật.");
      const nextSubmission = data.submission;
      setSubmission((current) =>
        current
          ? {
              ...current,
              ...nextSubmission,
              claimedBy: nextSubmission.claimedBy ?? current.claimedBy,
            }
          : current,
      );
      setMessage(
        action === "CLAIM"
          ? "Đã nhận xử lý hồ sơ."
          : action === "REJECT"
            ? "Đã từ chối hồ sơ."
            : "Đã chuyển sang trạng thái cần bổ sung.",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể cập nhật hồ sơ.");
    } finally {
      setBusy(false);
    }
  }
  if (!submission)
    return (
      <main className="mx-auto max-w-5xl p-6">
        <p className="rounded-xl bg-stone-100 p-5 text-stone-600">{message ?? "Đang tải hồ sơ…"}</p>
      </main>
    );
  const draft = submission.draft;
  return (
    <main className="mx-auto min-h-screen max-w-5xl px-4 py-8 sm:px-6">
      <Link className="text-sm font-semibold text-emerald-800 underline" href="/submissions">
        ← Hàng chờ tiếp nhận
      </Link>
      <section className="mt-5 rounded-xl border border-stone-200 bg-white p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-emerald-800">{submission.receiptCode}</p>
            <h1 className="mt-1 text-3xl font-bold text-stone-950">Bản kê khai hồ sơ đất đai</h1>
            <p className="mt-2 text-stone-600">
              Trạng thái: {labels[submission.status] ?? submission.status}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="pc-button-quiet"
              disabled={busy}
              onClick={() => action("CLAIM")}
              type="button"
            >
              Nhận xử lý
            </button>
            <button
              className="rounded-lg border border-amber-700 px-4 py-2 font-semibold text-amber-800 disabled:opacity-50"
              disabled={busy || submission.status !== "UNDER_REVIEW"}
              onClick={() => action("REQUEST_SUPPLEMENT")}
              type="button"
            >
              Yêu cầu bổ sung
            </button>
            <button
              className="rounded-lg border border-red-700 px-4 py-2 font-semibold text-red-800 disabled:opacity-50"
              disabled={busy || submission.status !== "UNDER_REVIEW"}
              onClick={() => action("REJECT")}
              type="button"
            >
              Từ chối
            </button>
          </div>
        </div>
        {message ? (
          <p aria-live="polite" className="mt-4 rounded-lg bg-stone-100 p-3 text-sm text-stone-700">
            {message}
          </p>
        ) : null}
        <dl className="mt-6 grid gap-4 border-y border-stone-200 py-5 sm:grid-cols-3">
          <div>
            <dt className="text-sm text-stone-500">Điện thoại</dt>
            <dd className="font-semibold text-stone-900">{submission.phone}</dd>
          </div>
          <div>
            <dt className="text-sm text-stone-500">Cán bộ phụ trách</dt>
            <dd className="font-semibold text-stone-900">{submission.claimedBy ?? "Chưa nhận"}</dd>
          </div>
          <div>
            <dt className="text-sm text-stone-500">Cập nhật</dt>
            <dd className="font-semibold text-stone-900">
              {submission.updatedAt ? new Date(submission.updatedAt).toLocaleString("vi-VN") : "-"}
            </dd>
          </div>
        </dl>
      </section>
      {draft ? (
        <div className="mt-5 grid gap-5">
          <section className="rounded-xl border border-stone-200 bg-white p-5">
            <h2 className="text-xl font-bold">Giấy chứng nhận</h2>
            <dl className="mt-4 grid gap-3 sm:grid-cols-3">
              <div>
                <dt className="text-sm text-stone-500">Số phát hành</dt>
                <dd>{draft.certificate.issueNumber || "-"}</dd>
              </div>
              <div>
                <dt className="text-sm text-stone-500">Ngày cấp</dt>
                <dd>{draft.certificate.issueDate || "-"}</dd>
              </div>
              <div>
                <dt className="text-sm text-stone-500">Số vào sổ</dt>
                <dd>{draft.certificate.registryNumber || "-"}</dd>
              </div>
            </dl>
          </section>
          <section className="rounded-xl border border-stone-200 bg-white p-5">
            <h2 className="text-xl font-bold">Chủ sử dụng</h2>
            <div className="mt-4 space-y-3">
              {draft.owners.map((owner, index) => (
                <div className="rounded-lg bg-stone-50 p-4" key={index}>
                  <p className="font-semibold">{owner.fullName || "Chưa khai"}</p>
                  <p className="mt-1 text-sm text-stone-600">
                    {owner.ownerType} · CCCD/định danh:{" "}
                    {owner.identityNumber ? "••••••••" + owner.identityNumber.slice(-4) : "-"}
                  </p>
                  <p className="mt-1 text-sm text-stone-600">
                    Vai trò: {owner.roleOnCertificate || "-"}
                  </p>
                </div>
              ))}
            </div>
          </section>
          <section className="rounded-xl border border-stone-200 bg-white p-5">
            <h2 className="text-xl font-bold">Thửa đất</h2>
            <div className="mt-4 space-y-4">
              {draft.parcels.map((parcel, index) => (
                <div className="rounded-lg bg-stone-50 p-4" key={index}>
                  <p className="font-semibold">
                    Thửa {parcel.parcelNumber || "chưa khai"} · Tờ bản đồ{" "}
                    {parcel.mapSheetNumber || "-"}
                  </p>
                  <p className="mt-1 text-sm text-stone-600">
                    {parcel.addressTwoLevel || parcel.addressOnCertificate || "Chưa khai địa chỉ"} ·{" "}
                    {parcel.area || "-"} m²
                  </p>
                </div>
              ))}
            </div>
          </section>
        </div>
      ) : null}
      <p className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        Xem ảnh preview và tiếp nhận chính thức sẽ được mở sau khi migration preview và bảng mã
        trường 12 hoàn tất.
      </p>
    </main>
  );
}
