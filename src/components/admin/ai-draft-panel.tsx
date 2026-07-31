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
  const [applying, setApplying] = useState(false);
  const [open, setOpen] = useState(false);
  /** Phiên bản hồ sơ mà dữ liệu AI đang hiển thị ứng với. `null` = chưa tải lần nào. */
  const [loadedVersion, setLoadedVersion] = useState<number | null>(null);
  /** Suy ra, không lưu state: đang mở mà dữ liệu chưa khớp phiên bản hồ sơ tức là đang tải. */
  const loading = open && loadedVersion !== version;

  /**
   * Chỉ gọi API khi cán bộ mở panel.
   *
   * Trước đây panel fetch ngay khi trang render **và** fetch lại mỗi lần `version` đổi — tức mỗi
   * lần lưu bàn làm việc hay lưu ghi chú nội bộ cũng kéo theo một lần tải kết quả AI, dù phần lớn
   * hồ sơ không có kết quả AI nào và panel render ra rỗng (`return null`).
   *
   * Vẫn tải lại khi `version` đổi **nếu panel đang mở**: cột "Hiện có" so sánh với dữ liệu hồ sơ
   * hiện tại, để nguyên sau khi lưu thì cán bộ đọc phải số cũ.
   */
  useEffect(() => {
    if (!open || loadedVersion === version) return;
    let active = true;
    fetch(`/api/submissions/${submissionId}/ai-draft`, { cache: "no-store" })
      .then(async (response) => {
        const data = (await response.json()) as {
          aiDraft?: AiDraft | null;
          error?: { message?: string };
        };
        if (!response.ok) throw new Error(data.error?.message ?? "Không thể tải kết quả AI.");
        if (active) {
          setAiDraft(data.aiDraft ?? null);
          setError(null);
        }
      })
      .catch((reason: unknown) => {
        if (active)
          setError(reason instanceof Error ? reason.message : "Không thể tải kết quả AI.");
      })
      .finally(() => {
        if (active) setLoadedVersion(version);
      });
    return () => {
      active = false;
    };
  }, [open, submissionId, version, loadedVersion]);

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

  const loaded = loadedVersion !== null;
  const summary = !loaded
    ? "Bấm để tải kết quả đọc tự động Giấy chứng nhận."
    : loading
      ? "Đang tải…"
      : error
        ? error
        : aiDraft
          ? `${aiDraft.modelName} · ${aiDraft.comparisons.length} trường đối chiếu`
          : "Chưa có kết quả AI cho hồ sơ này.";

  return (
    <section className="mt-5 rounded-xl border border-sky-200 bg-sky-50">
      {/* Thu gọn mặc định: mở ra mới gọi API, phần lớn hồ sơ không có kết quả AI để xem. */}
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-3 p-5 text-left sm:p-7"
      >
        <span>
          <span className="block text-xl font-bold text-sky-950">Đối chiếu AI — bản nháp</span>
          <span className={`mt-1 block text-sm ${error ? "text-amber-800" : "text-sky-900"}`}>
            {summary}
          </span>
        </span>
        <span aria-hidden="true" className="text-sky-800">
          {open ? "▲" : "▼"}
        </span>
      </button>
      {open ? <div className="px-5 pb-5 sm:px-7 sm:pb-7">{renderBody()}</div> : null}
    </section>
  );

  function renderBody() {
    if (loading) return <p className="text-sm text-sky-900">Đang tải kết quả AI…</p>;
    if (error && !aiDraft) {
      return (
        <div>
          <p className="text-sm text-amber-800">{error}</p>
          <button
            className="pc-button-quiet mt-3 text-xs"
            type="button"
            onClick={() => setLoadedVersion(null)}
          >
            Thử lại
          </button>
        </div>
      );
    }
    if (!aiDraft) {
      return (
        <p className="text-sm text-sky-900">
          Hồ sơ này chưa có kết quả đọc tự động. Cán bộ nhập tay theo ảnh Giấy chứng nhận.
        </p>
      );
    }
    return renderDraft(aiDraft);
  }

  function renderDraft(aiDraft: AiDraft) {
    const hasClearBlank = aiDraft.comparisons.some(
      (comparison) =>
        comparison.fieldStatus === "CLEAR" && !comparison.currentValue.trim() && comparison.aiValue,
    );
    return (
      <>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <p className="text-sm text-sky-950">
            {aiDraft.modelName} chỉ đọc GCN chữ đánh máy. Kết quả không phải xác nhận pháp lý.
          </p>
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
          disabled={
            !mayApply || applying || aiDraft.validationStatus === "BLOCKED" || !hasClearBlank
          }
          onClick={() => void apply()}
          type="button"
        >
          {applying ? "Đang nạp…" : "Nạp nháp AI"}
        </button>
      </>
    );
  }
}
