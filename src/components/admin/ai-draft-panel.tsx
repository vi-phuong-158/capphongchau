"use client";

import { useEffect, useState } from "react";

type Comparison = {
  fieldPath: string;
  currentValue: string;
  aiValue: string | null;
  sourceValue: string | null;
  fieldStatus: "CLEAR" | "CHECK" | "MANUAL_REQUIRED";
  evidence: { fileId?: string; pageLabel?: string; note?: string };
};

type AiDraft = {
  jobId: string;
  resultId: string;
  validationStatus: "PASSED" | "REVIEW_REQUIRED" | "BLOCKED";
  warningCount: number;
  modelName: string;
  stationAccessRisk: "ADMIN_BROAD_ACCESS";
  payload: { quality: { imageStatus: string; note: string } };
  comparisons: Comparison[];
};

async function csrfToken(): Promise<string> {
  const response = await fetch("/api/security/csrf", { cache: "no-store" });
  if (!response.ok) throw new Error("Không thể tạo mã bảo mật.");
  return ((await response.json()) as { csrfToken: string }).csrfToken;
}

function label(path: string): string {
  return (
    {
      "certificate.issueNumber": "Số phát hành",
      "certificate.issueDate": "Ngày cấp",
      "certificate.registryNumber": "Số vào sổ",
    }[path] ?? path
  );
}

export function AiDraftPanel({
  submissionId,
  version,
  mayApply,
  onApplied,
}: {
  readonly submissionId: string;
  readonly version: number;
  readonly mayApply: boolean;
  readonly onApplied: () => Promise<void>;
}) {
  const [aiDraft, setAiDraft] = useState<AiDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    let active = true;
    fetch(`/api/submissions/${submissionId}/ai-draft`, { cache: "no-store" })
      .then(async (response) => {
        const data = (await response.json()) as {
          aiDraft?: AiDraft | null;
          error?: { message?: string };
        };
        if (!response.ok) throw new Error(data.error?.message ?? "Không thể tải kết quả AI.");
        if (active) setAiDraft(data.aiDraft ?? null);
      })
      .catch((reason: unknown) => {
        if (active)
          setError(reason instanceof Error ? reason.message : "Không thể tải kết quả AI.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [submissionId, version]);

  async function apply() {
    if (!aiDraft) return;
    setApplying(true);
    setError(null);
    try {
      const token = await csrfToken();
      const response = await fetch(`/api/submissions/${submissionId}/ai-draft/apply`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": token,
          "idempotency-key": crypto.randomUUID(),
        },
        body: JSON.stringify({ expectedVersion: version, resultId: aiDraft.resultId }),
      });
      const data = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) throw new Error(data.error?.message ?? "Không thể nạp bản nháp AI.");
      await onApplied();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Không thể nạp bản nháp AI.");
    } finally {
      setApplying(false);
    }
  }

  if (loading) return null;
  if (error && !aiDraft) return <p className="mt-5 text-sm text-amber-800">{error}</p>;
  if (!aiDraft) return null;
  const hasClearBlank = aiDraft.comparisons.some(
    (comparison) =>
      comparison.fieldStatus === "CLEAR" && !comparison.currentValue.trim() && comparison.aiValue,
  );
  return (
    <section className="mt-5 rounded-xl border border-sky-200 bg-sky-50 p-5 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-sky-950">Đối chiếu AI — bản nháp</h2>
          <p className="mt-1 text-sm text-sky-950">
            {aiDraft.modelName} chỉ đọc GCN chữ đánh máy. Kết quả không phải xác nhận pháp lý.
          </p>
        </div>
        <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900">
          Quyền trạm: {aiDraft.stationAccessRisk}
        </span>
      </div>
      {aiDraft.payload.quality.imageStatus !== "CLEAR" ? (
        <p className="mt-3 rounded-lg bg-amber-100 p-3 text-sm text-amber-950">
          AI cảnh báo {aiDraft.payload.quality.imageStatus.toLowerCase()}:{" "}
          {aiDraft.payload.quality.note || "cần kiểm tra thủ công"}.
        </p>
      ) : null}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[680px] text-left text-sm">
          <thead className="border-b border-sky-200 text-sky-900">
            <tr>
              <th className="p-2">Trường</th>
              <th className="p-2">Hiện có</th>
              <th className="p-2">Gợi ý AI / bằng chứng</th>
              <th className="p-2">Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {aiDraft.comparisons.map((comparison) => (
              <tr className="border-b border-sky-100 align-top" key={comparison.fieldPath}>
                <td className="p-2 font-medium">{label(comparison.fieldPath)}</td>
                <td className="p-2">{comparison.currentValue || "—"}</td>
                <td className="p-2">
                  <div>{comparison.aiValue ?? "—"}</div>
                  <div className="mt-1 text-xs text-sky-800">
                    {comparison.evidence?.pageLabel || ""} {comparison.evidence?.note || ""}
                  </div>
                </td>
                <td className="p-2 font-semibold">{comparison.fieldStatus}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-sm text-sky-950">
        Nút nạp chỉ điền trường <strong>CLEAR</strong> đang trống. Giá trị khác biệt hoặc cần kiểm
        tra không bị ghi đè.
      </p>
      {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
      <button
        className="pc-button mt-4"
        disabled={!mayApply || applying || aiDraft.validationStatus === "BLOCKED" || !hasClearBlank}
        onClick={() => void apply()}
        type="button"
      >
        {applying ? "Đang nạp…" : "Nạp nháp AI"}
      </button>
    </section>
  );
}
