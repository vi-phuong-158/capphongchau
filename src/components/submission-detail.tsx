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
  officialCaseId: string | null;
  acceptStep: string | null;
  canResetAccessSecret: boolean;
  draft: {
    certificate: { issueNumber: string; issueDate: string; registryNumber: string };
    owners: {
      fullName: string;
      identityNumber: string;
      dateOfBirth: string;
      gender: string;
      residenceAddress: string;
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
  files: {
    fileId: string;
    documentType: "CITIZEN_ID_FRONT" | "CITIZEN_ID_BACK" | "CERTIFICATE";
  }[];
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
  const [supplementReason, setSupplementReason] = useState("MISSING_INFORMATION");
  const [supplementMessage, setSupplementMessage] = useState("");
  const [supplementKind, setSupplementKind] = useState<"FIELD" | "FILE">("FIELD");
  const [supplementTarget, setSupplementTarget] = useState("");
  const [supplementDocument, setSupplementDocument] = useState<
    "" | "CITIZEN_ID_FRONT" | "CITIZEN_ID_BACK" | "CERTIFICATE"
  >("");
  const [supplementInstruction, setSupplementInstruction] = useState("");
  const [resetConfirmation, setResetConfirmation] = useState("");
  const [newAccessSecret, setNewAccessSecret] = useState("");
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
        body: JSON.stringify({
          action,
          version: submission.version,
          ...(action === "REQUEST_SUPPLEMENT"
            ? {
                reasonCode: supplementReason,
                message: supplementMessage,
                items: [
                  {
                    itemType: supplementKind,
                    targetEntityType: "SUBMISSION",
                    targetEntityId: "",
                    fieldPath: supplementKind === "FIELD" ? supplementTarget : "",
                    documentType: supplementKind === "FILE" ? supplementDocument : "",
                    instruction: supplementInstruction,
                  },
                ],
              }
            : {}),
        }),
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
  async function resetAccessSecret() {
    if (!submission || resetConfirmation !== "ĐÃ XÁC MINH") return;
    setBusy(true);
    setMessage(null);
    try {
      const token = await csrfToken();
      const response = await fetch(
        `/api/submissions/${submission.submissionId}/reset-access-secret`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-csrf-token": token,
            "idempotency-key": crypto.randomUUID(),
          },
          body: JSON.stringify({ identityVerified: true }),
        },
      );
      const data = (await response.json()) as {
        accessSecret?: string;
        error?: { message?: string };
      };
      if (!response.ok || !data.accessSecret)
        throw new Error(data.error?.message ?? "Không thể đặt lại mã.");
      setNewAccessSecret(data.accessSecret);
      setResetConfirmation("");
      setMessage("Đã đặt lại mã bí mật. Mọi phiên truy cập cũ đã bị vô hiệu.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể đặt lại mã bí mật.");
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
              className="rounded-lg border border-emerald-800 px-4 py-2 font-semibold text-emerald-900 disabled:opacity-50"
              disabled
              title="Đang hoàn thiện migration hồ sơ chính thức"
              type="button"
            >
              Tiếp nhận chính thức
            </button>
            <button
              className="rounded-lg border border-amber-700 px-4 py-2 font-semibold text-amber-800 disabled:opacity-50"
              disabled={
                busy ||
                submission.status !== "UNDER_REVIEW" ||
                !supplementMessage.trim() ||
                !supplementInstruction.trim() ||
                (supplementKind === "FIELD" ? !supplementTarget.trim() : !supplementDocument)
              }
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
      {submission.status === "UNDER_REVIEW" ? (
        <section className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-5">
          <h2 className="text-lg font-bold text-amber-950">Soạn yêu cầu bổ sung có cấu trúc</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label>
              <span className="pc-field-label">Lý do</span>
              <select
                className="pc-select"
                value={supplementReason}
                onChange={(event) => setSupplementReason(event.target.value)}
              >
                <option value="MISSING_INFORMATION">Thiếu thông tin</option>
                <option value="UNREADABLE_IMAGE">Ảnh không đọc được</option>
                <option value="INCONSISTENT_INFORMATION">Thông tin chưa thống nhất</option>
                <option value="WRONG_DOCUMENT">Sai loại tài liệu</option>
                <option value="OTHER">Lý do khác</option>
              </select>
            </label>
            <label>
              <span className="pc-field-label">Loại nội dung</span>
              <select
                className="pc-select"
                value={supplementKind}
                onChange={(event) => setSupplementKind(event.target.value as "FIELD" | "FILE")}
              >
                <option value="FIELD">Sửa trường thông tin</option>
                <option value="FILE">Thay/bổ sung ảnh</option>
              </select>
            </label>
          </div>
          <label className="mt-3 block">
            <span className="pc-field-label">Thông báo chung cho người nộp</span>
            <textarea
              className="pc-textarea"
              value={supplementMessage}
              onChange={(event) => setSupplementMessage(event.target.value)}
            />
          </label>
          {supplementKind === "FIELD" ? (
            <label className="mt-3 block">
              <span className="pc-field-label">Đường dẫn trường được phép sửa</span>
              <input
                className="pc-input"
                value={supplementTarget}
                onChange={(event) => setSupplementTarget(event.target.value)}
                placeholder="Ví dụ: certificate.issueNumber"
              />
            </label>
          ) : (
            <label className="mt-3 block">
              <span className="pc-field-label">Ảnh cần bổ sung/thay</span>
              <select
                className="pc-select"
                value={supplementDocument}
                onChange={(event) =>
                  setSupplementDocument(event.target.value as typeof supplementDocument)
                }
              >
                <option value="">— Chọn —</option>
                <option value="CITIZEN_ID_FRONT">CCCD mặt trước</option>
                <option value="CITIZEN_ID_BACK">CCCD mặt sau</option>
                <option value="CERTIFICATE">Ảnh Giấy chứng nhận</option>
              </select>
            </label>
          )}
          <label className="mt-3 block">
            <span className="pc-field-label">Hướng dẫn cụ thể</span>
            <textarea
              className="pc-textarea"
              value={supplementInstruction}
              onChange={(event) => setSupplementInstruction(event.target.value)}
            />
          </label>
          <p className="mt-2 text-sm text-amber-900">
            Sau khi gửi, người nộp chỉ sửa được đúng trường hoặc loại ảnh đã chọn; các nội dung khác
            bị khóa.
          </p>
        </section>
      ) : null}
      {submission.canResetAccessSecret ? (
        <section className="mt-5 rounded-xl border border-stone-200 bg-white p-5">
          <h2 className="text-lg font-bold">Cấp lại mã bí mật</h2>
          <p className="mt-1 text-sm text-stone-600">
            Chỉ thực hiện sau khi người dân đến trực tiếp và cán bộ đã đối chiếu giấy tờ. Nhập “ĐÃ
            XÁC MINH” để xác nhận.
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            <input
              className="pc-input max-w-xs"
              value={resetConfirmation}
              onChange={(event) => setResetConfirmation(event.target.value.toUpperCase())}
            />
            <button
              className="pc-button-quiet"
              type="button"
              disabled={busy || resetConfirmation !== "ĐÃ XÁC MINH"}
              onClick={() => void resetAccessSecret()}
            >
              Tạo mã bí mật mới
            </button>
          </div>
          {newAccessSecret ? (
            <div className="mt-4 rounded-lg bg-amber-50 p-3">
              <p className="font-semibold">Mã mới — chỉ hiển thị lần này</p>
              <p className="mt-1 select-all font-mono text-lg font-bold">{newAccessSecret}</p>
            </div>
          ) : null}
        </section>
      ) : null}
      {draft ? (
        <div className="mt-5 grid gap-5">
          <section className="rounded-xl border border-stone-200 bg-white p-5">
            <h2 className="text-xl font-bold">Ảnh giấy tờ</h2>
            <p className="mt-1 text-sm text-stone-600">
              Ảnh xem trước được lấy qua ứng dụng, không dùng link Google Drive công khai.
            </p>
            {submission.files.length === 0 ? (
              <p className="mt-4 rounded-lg bg-stone-50 p-4 text-sm text-stone-600">
                Người dân chưa tải ảnh giấy tờ.
              </p>
            ) : (
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {submission.files.map((file) => (
                  <figure
                    className="overflow-hidden rounded-lg border border-stone-200"
                    key={file.fileId}
                  >
                    {/* Preview is an authenticated no-store route, so next/image cannot optimize it safely. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      alt={
                        file.documentType === "CITIZEN_ID_FRONT"
                          ? "CCCD mặt trước"
                          : file.documentType === "CITIZEN_ID_BACK"
                            ? "CCCD mặt sau"
                            : "Giấy chứng nhận"
                      }
                      className="aspect-[4/3] w-full bg-stone-100 object-contain"
                      src={`/api/submissions/${submission.submissionId}/files/${file.fileId}`}
                    />
                    <figcaption className="border-t border-stone-200 px-3 py-2 text-sm font-semibold text-stone-700">
                      {file.documentType === "CITIZEN_ID_FRONT"
                        ? "CCCD mặt trước"
                        : file.documentType === "CITIZEN_ID_BACK"
                          ? "CCCD mặt sau"
                          : "Giấy chứng nhận"}
                    </figcaption>
                  </figure>
                ))}
              </div>
            )}
          </section>
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
                    {owner.ownerType} · CCCD/định danh: {owner.identityNumber || "-"}
                  </p>
                  <p className="mt-1 text-sm text-stone-600">
                    Sinh: {owner.dateOfBirth || "-"} · Giới tính: {owner.gender || "-"}
                  </p>
                  <p className="mt-1 text-sm text-stone-600">
                    Thường trú: {owner.residenceAddress || "-"}
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
        Ảnh xem trước đã sẵn sàng để đối chiếu. Danh mục loại đất demo dùng mã từ Thông tư
        08/2024/TT-BTNMT; tiếp nhận chính thức sẽ được mở cùng migration hồ sơ chuẩn hóa. phê duyệt.
      </p>
    </main>
  );
}
