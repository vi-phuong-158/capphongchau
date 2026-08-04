"use client";

import { useEffect, useState } from "react";

import {
  allApplyableFieldPaths,
  comparisonEvidenceStatus,
  comparisonLabel,
  defaultSelectedFieldPaths,
  evidenceEntriesForDisplay,
  formatEvidenceConfidence,
  formatEvidenceSource,
  groupAiDraftComparisons,
  isComparisonApplyable,
  type AiDraftComparisonView,
} from "@/components/admin/ai-draft-view";
import type {
  GcnEvidenceStatus,
  GcnFieldProvenance,
} from "@/modules/ai-extraction/gcn-v2-contract";

type AiDraft = {
  jobId: string;
  resultId: string;
  validationStatus: "PASSED" | "REVIEW_REQUIRED" | "BLOCKED";
  warningCount: number;
  modelName: string;
  stationAccessRisk: "ADMIN_BROAD_ACCESS";
  payload: {
    quality?: { imageStatus?: string; note?: string };
    warnings?: string[];
  };
  comparisons: AiDraftComparisonView[];
};

async function csrfToken(): Promise<string> {
  const response = await fetch("/api/security/csrf", { cache: "no-store" });
  if (!response.ok) throw new Error("Không thể tạo mã bảo mật.");
  return ((await response.json()) as { csrfToken: string }).csrfToken;
}

const EVIDENCE_STATUS_LABEL: Readonly<Record<GcnEvidenceStatus, string>> = {
  EXTRACTED: "Đã đọc rõ",
  LOW_CONFIDENCE: "Độ tin cậy thấp",
  UNREADABLE: "Không đọc được",
  CONFLICT: "Có mâu thuẫn",
  NOT_FOUND: "Không tìm thấy",
};

/**
 * `OFFICER_EDITED` gộp hai tình huống: cán bộ thực sự sửa, và ô đã có dữ liệu mà backend không truy
 * được nguồn (đọc lại lần sau sinh stable key mới nên mất liên kết với giá trị AI đã nạp). Nhãn vì
 * vậy nói đúng hệ quả — không ghi đè — thay vì quy cho cán bộ một thao tác có thể họ không làm.
 */
const PROVENANCE_LABEL: Readonly<Record<GcnFieldProvenance, string>> = {
  EMPTY: "Đang trống",
  AI_PROPOSED: "AI đã đề xuất",
  CITIZEN_PROVIDED: "Người dân đã cung cấp",
  OFFICER_EDITED: "Đã có dữ liệu — không ghi đè",
  OFFICER_CONFIRMED: "Cán bộ đã xác nhận",
  CONFLICT: "Có mâu thuẫn",
  UNREADABLE: "Không đọc được",
};

function displayValue(value: string | null | undefined): string {
  return value?.trim() || "—";
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
  const [selectedFieldPaths, setSelectedFieldPaths] = useState<Set<string>>(new Set());
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
          const nextDraft = data.aiDraft ?? null;
          setAiDraft(nextDraft);
          setSelectedFieldPaths(
            nextDraft ? defaultSelectedFieldPaths(nextDraft.comparisons) : new Set(),
          );
          setError(null);
        }
      })
      .catch((reason: unknown) => {
        if (active) {
          setAiDraft(null);
          setSelectedFieldPaths(new Set());
          setError(reason instanceof Error ? reason.message : "Không thể tải kết quả AI.");
        }
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
    // Gửi đúng tập server còn cho phép nạp: nút hiển thị `selectedCount` đã lọc theo applyable, gửi
    // cả path đã hết điều kiện chỉ khiến server từ chối trọn lô.
    const applyableFieldPaths = allApplyableFieldPaths(aiDraft.comparisons);
    const fieldPaths = [...selectedFieldPaths]
      .filter((path) => applyableFieldPaths.has(path))
      .sort();
    if (fieldPaths.length === 0) return;
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
        body: JSON.stringify({
          expectedVersion: version,
          resultId: aiDraft.resultId,
          selectedFieldPaths: fieldPaths,
        }),
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
        aria-controls="ai-draft-content"
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
      {open ? (
        <div id="ai-draft-content" className="px-5 pb-5 sm:px-7 sm:pb-7">
          {renderBody()}
        </div>
      ) : null}
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
    const groups = groupAiDraftComparisons(aiDraft.comparisons);
    const applyableFieldPaths = allApplyableFieldPaths(aiDraft.comparisons);
    const selectedCount = [...selectedFieldPaths].filter((path) =>
      applyableFieldPaths.has(path),
    ).length;
    const imageStatus = aiDraft.payload.quality?.imageStatus ?? "CLEAR";
    const imageNote = aiDraft.payload.quality?.note ?? "";
    return (
      <>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <p className="text-sm text-sky-950">
            AI chỉ đề xuất dữ liệu đọc từ GCN. Cán bộ phải đối chiếu ảnh gốc; kết quả không phải xác
            nhận pháp lý và không tự hoàn thành hồ sơ.
          </p>
          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900">
            Trạm cục bộ có quyền truy cập rộng
          </span>
        </div>
        {imageStatus !== "CLEAR" ? (
          <p className="mt-3 rounded-lg bg-amber-100 p-3 text-sm text-amber-950">
            Chất lượng ảnh: {imageStatus.toLowerCase()}. {imageNote || "Cần kiểm tra thủ công."}
          </p>
        ) : null}
        {aiDraft.warningCount > 0 ? (
          <p className="mt-3 text-sm font-medium text-amber-900">
            Có {aiDraft.warningCount} cảnh báo cần xem trước khi nạp.
          </p>
        ) : null}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            className="pc-button-quiet text-xs"
            disabled={
              !mayApply ||
              applying ||
              aiDraft.validationStatus === "BLOCKED" ||
              applyableFieldPaths.size === 0
            }
            onClick={() => setSelectedFieldPaths(new Set(applyableFieldPaths))}
            type="button"
          >
            Chọn tất cả trường có thể nạp
          </button>
          <button
            className="pc-button-quiet text-xs"
            disabled={applying || selectedCount === 0}
            onClick={() => setSelectedFieldPaths(new Set())}
            type="button"
          >
            Bỏ chọn
          </button>
          <span className="text-sm text-sky-950" aria-live="polite">
            Đã chọn {selectedCount}/{applyableFieldPaths.size} trường có thể nạp
          </span>
        </div>
        <div className="mt-4 space-y-4">
          {groups.map((group) => (
            <fieldset key={group.key} className="rounded-lg border border-sky-200 bg-white p-3">
              <legend className="px-2 text-base font-bold text-sky-950">{group.label}</legend>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-left text-sm">
                  <thead className="border-b border-sky-200 text-sky-900">
                    <tr>
                      <th className="w-12 p-2">
                        <span className="sr-only">Chọn nạp</span>
                      </th>
                      <th className="p-2">Trường</th>
                      <th className="p-2">Hiện có</th>
                      <th className="p-2">Gợi ý AI</th>
                      <th className="p-2">Bằng chứng gốc</th>
                      <th className="p-2">Trang / tin cậy</th>
                      <th className="p-2">Trạng thái / nguồn</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.comparisons.map((comparison, comparisonIndex) => {
                      const applyable = isComparisonApplyable(comparison);
                      const evidenceStatus = comparisonEvidenceStatus(comparison);
                      const evidenceEntries = evidenceEntriesForDisplay(comparison.evidence);
                      const checkboxId = `ai-field-${group.key}-${comparisonIndex}`;
                      return (
                        <tr
                          className="border-b border-sky-100 align-top last:border-0"
                          key={comparison.fieldPath}
                        >
                          <td className="p-2">
                            <input
                              id={checkboxId}
                              aria-label={`Chọn nạp ${comparisonLabel(comparison)}`}
                              checked={selectedFieldPaths.has(comparison.fieldPath)}
                              className="h-4 w-4 accent-sky-700"
                              disabled={
                                !mayApply ||
                                applying ||
                                aiDraft.validationStatus === "BLOCKED" ||
                                !applyable
                              }
                              onChange={(event) => {
                                const checked = event.currentTarget.checked;
                                setSelectedFieldPaths((current) => {
                                  const next = new Set(current);
                                  if (checked) next.add(comparison.fieldPath);
                                  else next.delete(comparison.fieldPath);
                                  return next;
                                });
                              }}
                              type="checkbox"
                            />
                          </td>
                          <td className="p-2 font-medium">
                            <label htmlFor={checkboxId}>{comparisonLabel(comparison)}</label>
                            {!applyable ? (
                              <span className="mt-1 block text-xs font-normal text-slate-600">
                                Chỉ đối chiếu
                              </span>
                            ) : null}
                          </td>
                          <td className="p-2">
                            <div>{displayValue(comparison.currentValue)}</div>
                            {comparison.sourceValue &&
                            comparison.sourceValue !== comparison.currentValue ? (
                              <div className="mt-1 text-xs text-slate-600">
                                Dữ liệu nguồn: {comparison.sourceValue}
                              </div>
                            ) : null}
                          </td>
                          <td className="p-2">{displayValue(comparison.aiValue)}</td>
                          <td className="max-w-72 whitespace-pre-wrap p-2">
                            {evidenceEntries.length ? (
                              <ul className="space-y-1">
                                {evidenceEntries.map((entry, evidenceIndex) => (
                                  <li key={`${entry.status ?? "unknown"}-${evidenceIndex}`}>
                                    {displayValue(entry.rawText ?? entry.note)}
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="p-2">
                            {evidenceEntries.length ? (
                              <ul className="space-y-1">
                                {evidenceEntries.map((entry, evidenceIndex) => (
                                  <li key={`${formatEvidenceSource(entry)}-${evidenceIndex}`}>
                                    <div>{formatEvidenceSource(entry)}</div>
                                    <div className="text-xs text-slate-600">
                                      Tin cậy: {formatEvidenceConfidence(entry.confidence)}
                                    </div>
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <div>Trang —</div>
                            )}
                          </td>
                          <td className="p-2">
                            <div className="font-semibold">
                              {EVIDENCE_STATUS_LABEL[evidenceStatus]}
                            </div>
                            <div className="mt-1 text-xs text-slate-600">
                              {comparison.provenance
                                ? PROVENANCE_LABEL[comparison.provenance]
                                : "Kết quả legacy"}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </fieldset>
          ))}
        </div>
        <p className="mt-3 text-sm text-sky-950">
          Chỉ trường được server cho phép và cán bộ tích chọn mới được nạp. Dữ liệu người dân/cán
          bộ, trường đã xác nhận, mâu thuẫn hoặc không đọc rõ không bị ghi đè.
        </p>
        {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
        <button
          className="pc-button mt-4"
          disabled={
            !mayApply || applying || aiDraft.validationStatus === "BLOCKED" || selectedCount === 0
          }
          onClick={() => void apply()}
          type="button"
        >
          {applying ? "Đang nạp…" : `Nạp ${selectedCount} trường đã chọn`}
        </button>
      </>
    );
  }
}
