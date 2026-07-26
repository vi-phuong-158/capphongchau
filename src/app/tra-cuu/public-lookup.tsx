"use client";

import { useCallback, useState } from "react";

import { TurnstileWidget } from "@/components/turnstile-widget";
import { formatDateTime } from "@/modules/public-intake/vietnamese-date";

interface LookupData {
  receiptCode: string;
  status: string;
  statusLabel: string;
  updatedAt: string;
  officialCaseId: string | null;
  files: Array<{
    fileId: string;
    ownerId: string;
    ownerDisplayName: string;
    documentType: "CITIZEN_ID_FRONT" | "CITIZEN_ID_BACK" | "CERTIFICATE";
    status: string;
    uploadedAt: string;
  }>;
  checklist: Array<{ code: string; label: string; complete: boolean; missing: string }>;
  supplementRequest: null | {
    message: string;
    requestedByDisplayName: string;
    createdAt: string;
    items: Array<{ itemId: string; instruction: string }>;
  };
  timeline: Array<{
    eventId: string;
    label: string;
    actorDisplayName: string;
    message: string;
    occurredAt: string;
  }>;
}

const DOCUMENT_LABELS = {
  CITIZEN_ID_FRONT: "CCCD mặt trước",
  CITIZEN_ID_BACK: "CCCD mặt sau",
  CERTIFICATE: "Ảnh Giấy chứng nhận",
} as const;

export function PublicLookup() {
  const [receiptCode, setReceiptCode] = useState("");
  const [accessSecret, setAccessSecret] = useState("");
  const [csrfToken, setCsrfToken] = useState("");
  const [challenge, setChallenge] = useState("");
  const [challengeKey, setChallengeKey] = useState(0);
  const [data, setData] = useState<LookupData | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const onToken = useCallback((token: string) => setChallenge(token), []);

  async function recover() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/public/submissions/recover", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": crypto.randomUUID(),
          "x-turnstile-token": challenge,
        },
        body: JSON.stringify({ receiptCode, accessSecret }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        setError(body?.error?.message ?? "Không thể tra cứu hồ sơ.");
        setChallenge("");
        setChallengeKey((value) => value + 1);
        return;
      }
      const recovered = (await response.json()) as { csrfToken: string };
      setCsrfToken(recovered.csrfToken);
      const current = await fetch("/api/public/submissions/current", { cache: "no-store" });
      if (!current.ok) {
        setError("Đã xác thực nhưng chưa tải được thông tin hồ sơ. Vui lòng thử lại.");
        return;
      }
      setData((await current.json()) as LookupData);
    } finally {
      setBusy(false);
    }
  }

  function continueSubmission() {
    sessionStorage.setItem(
      "pc_kk_recovery",
      JSON.stringify({ receiptCode, accessSecret, csrfToken }),
    );
    window.location.assign("/ke-khai?continue=1");
  }

  if (!data) {
    return (
      <section className="pc-card space-y-4">
        <label className="block">
          <span className="pc-field-label">Mã tiếp nhận</span>
          <input
            className="pc-input font-mono uppercase"
            autoComplete="off"
            value={receiptCode}
            onChange={(event) => setReceiptCode(event.target.value.toUpperCase())}
            placeholder="PC-KK-2026-…"
          />
        </label>
        <label className="block">
          <span className="pc-field-label">Mã bí mật</span>
          <input
            className="pc-input font-mono uppercase"
            type="password"
            autoComplete="off"
            value={accessSecret}
            onChange={(event) => setAccessSecret(event.target.value.toUpperCase())}
          />
        </label>
        <TurnstileWidget key={challengeKey} action="recover" onToken={onToken} />
        {error ? <p className="pc-field-error">{error}</p> : null}
        <button
          type="button"
          className="pc-button"
          disabled={busy || !challenge || !receiptCode || !accessSecret}
          onClick={() => void recover()}
        >
          {busy ? "Đang tra cứu…" : "Tra cứu hồ sơ"}
        </button>
      </section>
    );
  }

  const editable = data.status === "DRAFT" || data.status === "NEEDS_SUPPLEMENT";
  return (
    <div className="space-y-5">
      <section className="pc-card">
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Mã tiếp nhận
        </p>
        <p className="font-mono text-lg font-bold">{data.receiptCode}</p>
        <p className="mt-4 text-xl font-bold">{data.statusLabel}</p>
        <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
          Cập nhật {formatDateTime(data.updatedAt)}
        </p>
        {data.officialCaseId ? (
          <p className="mt-3">
            Mã hồ sơ chính thức: <strong>{data.officialCaseId}</strong>
          </p>
        ) : null}
        {editable ? (
          <button className="pc-button mt-4" type="button" onClick={continueSubmission}>
            {data.status === "DRAFT" ? "Tiếp tục bản nháp" : "Bổ sung hồ sơ"}
          </button>
        ) : null}
      </section>

      <section className="pc-card">
        <h2 className="text-lg font-bold">Ảnh/tài liệu đã nộp</h2>
        {data.files.length ? (
          <ul className="mt-3 space-y-2">
            {data.files.map((file) => (
              <li key={file.fileId} className="flex items-center justify-between gap-3">
                <span>
                  {DOCUMENT_LABELS[file.documentType]}
                  {file.ownerDisplayName ? ` — ${file.ownerDisplayName}` : ""}
                  {file.status === "REPLACED"
                    ? " — Đã thay"
                    : file.status === "DELETED"
                      ? " — Không còn hiệu lực"
                      : " — Đã nhận"}
                </span>
                {file.status === "UPLOADED" ? (
                  <a
                    className="font-semibold underline"
                    href={`/api/public/submissions/current/files/${file.fileId}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Xem ảnh
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2">Chưa có ảnh nào được hệ thống xác nhận.</p>
        )}
      </section>

      <section className="pc-card">
        <h2 className="text-lg font-bold">Còn thiếu / cần bổ sung</h2>
        <ul className="mt-3 space-y-2">
          {data.checklist.map((item) => (
            <li key={item.code}>
              {item.complete ? "✓" : "•"} {item.label}
              {item.complete ? " — Đã đủ" : ` — ${item.missing}`}
            </li>
          ))}
        </ul>
        {data.supplementRequest ? (
          <div className="mt-4 rounded-lg bg-amber-50 p-3 text-amber-950">
            <p className="font-semibold">
              Yêu cầu của {data.supplementRequest.requestedByDisplayName}
            </p>
            <p>{data.supplementRequest.message}</p>
            <ul className="mt-2 list-disc pl-5">
              {data.supplementRequest.items.map((item) => (
                <li key={item.itemId}>{item.instruction}</li>
              ))}
            </ul>
          </div>
        ) : data.checklist.every((item) => item.complete) ? (
          <p className="mt-3 font-semibold text-emerald-800">
            Hồ sơ hiện không còn nội dung cần bổ sung.
          </p>
        ) : null}
      </section>

      <section className="pc-card">
        <h2 className="text-lg font-bold">Tiến trình xử lý</h2>
        <ol className="mt-3 space-y-3">
          {data.timeline.map((event) => (
            <li key={event.eventId} className="border-l-2 border-stone-300 pl-3">
              <p className="font-semibold">{event.label}</p>
              <p className="text-sm">
                {event.actorDisplayName} · {formatDateTime(event.occurredAt)}
              </p>
              {event.message ? <p className="text-sm">{event.message}</p> : null}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
