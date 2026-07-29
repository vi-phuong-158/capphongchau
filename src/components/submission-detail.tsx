"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { CERTIFICATE_ROLE_OPTIONS } from "@/modules/public-intake/reference";
import type { IntakeDraft } from "@/modules/public-intake/types";
import { formatDateTime } from "@/modules/public-intake/vietnamese-date";
import { isOwnerIdentityQrConfirmed } from "@/modules/submissions/review";
import { SubmissionClaimBanner } from "@/components/admin/submission-claim-banner";
import { AiDraftPanel } from "@/components/admin/ai-draft-panel";
import { WorkingPayloadEditor } from "@/components/admin/working-payload-editor";
import { useWorkingPayload } from "@/components/admin/use-working-payload";
import { DocumentViewer } from "@/components/admin/document-viewer";
import {
  assignedOfficerAccount,
  assignedOfficerLabel,
} from "@/modules/submissions/assigned-officer";

type Submission = {
  submissionId: string;
  receiptCode: string;
  status: string;
  phone: string;
  version: number;
  claimedBy: string | null;
  claimedByDisplayName?: string | null;
  intakeChannel?: string | null;
  assistedByDisplayName?: string | null;
  claimedAt: string | null;
  createdAt: string;
  updatedAt: string;
  officialCaseId: string | null;
  acceptStep: string | null;
  canResetAccessSecret: boolean;
  draft: IntakeDraft | null;
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

async function loadSubmission(id: string): Promise<Submission> {
  const response = await fetch(`/api/submissions/${id}`, { cache: "no-store" });
  if (!response.ok) throw new Error();
  return ((await response.json()) as { submission: Submission }).submission;
}

type EditableOwner = {
  id: string;
  ownerType: string;
  hasDistinctCurrentUser: boolean;
  fullName: string;
  identityNumber: string;
  dateOfBirth: string;
  gender: string;
  residenceAddress: string;
  roleOnCertificate: string;
  identityStatus: string;
  identityOverrideReason: string;
};

type AcceptanceBlockingIssue = {
  code: string;
  label: string;
  message: string;
};

function acceptanceBlockingIssues(details: unknown): AcceptanceBlockingIssue[] {
  if (!details || typeof details !== "object" || !("issues" in details)) return [];
  const issues = (details as { issues?: unknown }).issues;
  if (!Array.isArray(issues)) return [];
  return issues.flatMap((issue) => {
    if (
      !issue ||
      typeof issue !== "object" ||
      typeof (issue as { code?: unknown }).code !== "string" ||
      typeof (issue as { label?: unknown }).label !== "string" ||
      typeof (issue as { message?: unknown }).message !== "string"
    ) {
      return [];
    }
    return [issue as AcceptanceBlockingIssue];
  });
}

const EDITABLE_OWNER_FIELDS = [
  "fullName",
  "identityNumber",
  "dateOfBirth",
  "gender",
  "residenceAddress",
  "roleOnCertificate",
  "identityOverrideReason",
] as const;

export function SubmissionDetail({
  submissionId,
  currentUserEmail,
  isAdministrator,
}: {
  readonly submissionId: string;
  readonly currentUserEmail: string;
  readonly isAdministrator: boolean;
}) {
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [acceptanceIssues, setAcceptanceIssues] = useState<AcceptanceBlockingIssue[]>([]);
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
  const [editOpen, setEditOpen] = useState(false);
  /** Bật khi mở chế độ điều chỉnh hồ sơ ĐÃ tiếp nhận chính thức — buộc nhập lý do trước khi lưu. */
  const [amendMode, setAmendMode] = useState(false);
  const [amendmentReason, setAmendmentReason] = useState("");
  const [editCertificate, setEditCertificate] = useState({
    issueNumber: "",
    issueDate: "",
    registryNumber: "",
  });
  const [editOwners, setEditOwners] = useState<EditableOwner[]>([]);
  const [manualIdentityConfirmationOwnerIds, setManualIdentityConfirmationOwnerIds] = useState<
    string[]
  >([]);
  /** Giữ nguyên qua các lần bấm lại để saga tiếp tục từ checkpoint, không tạo hồ sơ chính thức mới. */
  const acceptKeyRef = useRef("");
  const isClaimedByMe =
    (submission?.claimedBy || "").trim().toLowerCase() === currentUserEmail.trim().toLowerCase();
  const workingPayload = useWorkingPayload(
    submissionId,
    submission?.draft ?? null,
    submission?.version ?? 0,
    isClaimedByMe,
  );
  useEffect(() => {
    loadSubmission(submissionId)
      .then(setSubmission)
      .catch(() => setMessage("Không thể tải hồ sơ."));
  }, [submissionId]);
  function openEdit(mode: "EDIT" | "AMEND" = "EDIT") {
    if (!submission?.draft) return;
    setAmendMode(mode === "AMEND");
    setAmendmentReason("");
    setManualIdentityConfirmationOwnerIds([]);
    setEditCertificate({ ...submission.draft.certificate });
    setEditOwners(
      submission.draft.owners.map((owner) => ({
        id: owner.id,
        ownerType: owner.ownerType,
        hasDistinctCurrentUser: owner.hasDistinctCurrentUser,
        fullName: owner.fullName,
        identityNumber: owner.identityNumber,
        dateOfBirth: owner.dateOfBirth,
        gender: owner.gender,
        residenceAddress: owner.residenceAddress,
        roleOnCertificate: owner.roleOnCertificate,
        identityStatus: owner.identityStatus,
        identityOverrideReason: owner.identityOverrideReason ?? "",
      })),
    );
    setEditOpen(true);
  }
  async function saveEdit() {
    if (!submission?.draft) return;
    const originalDraft = submission.draft;
    const certificatePatch: Record<string, string> = {};
    (["issueNumber", "issueDate", "registryNumber"] as const).forEach((field) => {
      if (editCertificate[field] !== originalDraft.certificate[field]) {
        certificatePatch[field] = editCertificate[field];
      }
    });
    const ownersPatch = editOwners
      .map((owner) => {
        const original = originalDraft.owners.find((candidate) => candidate.id === owner.id);
        if (!original) return null;
        const patch: Record<string, string> = { id: owner.id };
        let changed = false;
        for (const field of EDITABLE_OWNER_FIELDS) {
          if (owner[field] !== original[field]) {
            patch[field] = owner[field];
            changed = true;
          }
        }
        return changed ? patch : null;
      })
      .filter((patch): patch is Record<string, string> => patch !== null);
    if (Object.keys(certificatePatch).length === 0 && ownersPatch.length === 0) {
      setMessage("Không có thay đổi nào để lưu.");
      return;
    }
    if (amendMode && amendmentReason.trim().length < 10) {
      setMessage("Điều chỉnh hồ sơ đã tiếp nhận phải có lý do ít nhất 10 ký tự.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const token = await csrfToken();
      const response = await fetch(`/api/submissions/${submission.submissionId}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": token,
          "idempotency-key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          version: submission.version,
          ...(Object.keys(certificatePatch).length ? { certificate: certificatePatch } : {}),
          ...(ownersPatch.length ? { owners: ownersPatch } : {}),
          ...(amendMode ? { amendmentReason: amendmentReason.trim() } : {}),
        }),
      });
      const data = (await response.json()) as {
        submission?: { version: number };
        error?: { message: string };
      };
      if (!response.ok || !data.submission)
        throw new Error(data.error?.message ?? "Không thể lưu thay đổi.");
      const refreshed = await loadSubmission(submission.submissionId);
      setSubmission(refreshed);
      setEditOpen(false);
      setMessage(
        amendMode
          ? "Đã điều chỉnh hồ sơ chính thức. Dữ liệu chính thức đã được ghi lại theo bản mới."
          : "Đã lưu thông tin chỉnh sửa.",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể lưu thay đổi.");
    } finally {
      setBusy(false);
    }
  }
  async function confirmManualIdentity() {
    if (!submission || manualIdentityConfirmationOwnerIds.length === 0) return;
    setBusy(true);
    setMessage(null);
    try {
      const token = await csrfToken();
      const response = await fetch(`/api/submissions/${submission.submissionId}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": token,
          "idempotency-key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          version: submission.version,
          manualIdentityConfirmation: { ownerIds: manualIdentityConfirmationOwnerIds },
        }),
      });
      const data = (await response.json()) as {
        submission?: { version: number };
        error?: { message: string };
      };
      if (!response.ok || !data.submission) {
        throw new Error(data.error?.message ?? "Không thể xác nhận định danh.");
      }
      setSubmission(await loadSubmission(submission.submissionId));
      setEditOpen(false);
      setMessage("Đã ghi nhận cán bộ đối chiếu và xác nhận định danh thủ công.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể xác nhận định danh.");
    } finally {
      setBusy(false);
    }
  }
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
                reasonCode: supplementReason || "MISSING_INFORMATION",
                message: supplementMessage.trim() || "Yêu cầu bổ sung thông tin hồ sơ",
                items: [
                  {
                    itemType: supplementKind || "FIELD",
                    targetEntityType: "SUBMISSION",
                    targetEntityId: "",
                    fieldPath: supplementKind === "FIELD" ? (supplementTarget.trim() || "certificate") : "",
                    documentType: supplementKind === "FILE" ? (supplementDocument || "CERTIFICATE") : "",
                    instruction: supplementInstruction.trim() || supplementMessage.trim() || "Vui lòng kiểm tra và bổ sung hồ sơ theo hướng dẫn.",
                  },
                ],
              }
            : {}),
        }),
      });
      const data = (await response.json()) as {
        submission?: {
          status: string;
          version: number;
          claimedBy?: string;
          claimedByDisplayName?: string;
        };
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
              claimedByDisplayName:
                nextSubmission.claimedByDisplayName ?? current.claimedByDisplayName,
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
  /**
   * Tiếp nhận chính thức: sinh mã hồ sơ, chuyển file sang `02_CASES`, ghi CASES/OWNERS/
   * CERTIFICATES/PARCELS/ASSETS/FILES. Saga có checkpoint nên bấm lại sau khi lỗi mạng là an toàn —
   * nhưng phải **giữ nguyên `idempotency-key`** thì mới đi tiếp từ checkpoint thay vì tạo hồ sơ mới,
   * nên key được giữ trong ref suốt vòng đời một lần tiếp nhận, không sinh lại mỗi lần bấm.
   */
  async function acceptOfficially() {
    if (!submission) return;
    if (
      !window.confirm(
        `Tiếp nhận chính thức hồ sơ ${submission.receiptCode}?\n\n` +
          "Thao tác này sinh mã hồ sơ chính thức, chuyển ảnh sang thư mục hồ sơ và ghi dữ liệu " +
          "chính thức. Không có nút hoàn tác — sai sót phải xử lý bằng quy trình điều chỉnh.",
      )
    )
      return;
    if (!acceptKeyRef.current) acceptKeyRef.current = crypto.randomUUID();
    setBusy(true);
    setMessage(null);
    setAcceptanceIssues([]);
    try {
      const token = await csrfToken();
      const response = await fetch(`/api/submissions/${submission.submissionId}/accept`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": token,
          "idempotency-key": acceptKeyRef.current,
        },
        body: JSON.stringify({ version: submission.version }),
      });
      const data = (await response.json()) as {
        submission?: { officialCaseId: string; status: string; version: number };
        error?: { message?: string; details?: unknown };
      };
      if (!response.ok || !data.submission) {
        const issues = acceptanceBlockingIssues(data.error?.details);
        setAcceptanceIssues(issues);
        if (issues.length > 0) {
          setMessage(data.error?.message ?? "Hồ sơ chưa đủ điều kiện tiếp nhận chính thức.");
          return;
        }
        throw new Error(data.error?.message ?? "Không thể tiếp nhận chính thức.");
      }
      const accepted = data.submission;
      setSubmission((current) => (current ? { ...current, ...accepted } : current));
      acceptKeyRef.current = "";
      setMessage(`Đã tiếp nhận chính thức. Mã hồ sơ: ${accepted.officialCaseId}`);
    } catch (error) {
      // Giữ nguyên idempotency-key để lần bấm lại tiếp tục đúng saga đang dở.
      setMessage(
        error instanceof Error
          ? `${error.message} Nếu do mạng, bấm lại nút này — hệ thống sẽ tiếp tục từ bước dở dang.`
          : "Không thể tiếp nhận chính thức.",
      );
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
  const statusLabels: Record<string, { label: string; color: string }> = {
    SUBMITTED: { label: "Chờ tiếp nhận", color: "bg-amber-100 text-amber-900 border-amber-300" },
    UNDER_REVIEW: { label: "Đang xử lý", color: "bg-sky-100 text-sky-900 border-sky-300" },
    NEEDS_SUPPLEMENT: { label: "Cần bổ sung", color: "bg-orange-100 text-orange-900 border-orange-300" },
    RESUBMITTED: { label: "Đã gửi lại", color: "bg-blue-100 text-blue-900 border-blue-300" },
    REJECTED: { label: "Từ chối", color: "bg-rose-100 text-rose-900 border-rose-300" },
    ACCEPTING: { label: "Đang tiếp nhận", color: "bg-emerald-100 text-emerald-900 border-emerald-300 animate-pulse" },
    ACCEPTED: { label: "Đã tiếp nhận", color: "bg-emerald-100 text-emerald-900 border-emerald-300" },
    DRAFT: { label: "Nháp", color: "bg-stone-100 text-stone-700 border-stone-300" },
    EXPIRED: { label: "Hết hạn", color: "bg-stone-100 text-stone-600 border-stone-300" },
  };
  const statusBadge = statusLabels[submission.status] || {
    label: labels[submission.status] ?? submission.status,
    color: "bg-stone-100 text-stone-700 border-stone-300",
  };

  return (
    <main className="mx-auto min-h-screen max-w-[1600px] px-4 py-6 sm:px-6">
      <div className="flex items-center justify-between">
        <Link className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-800 hover:underline" href="/submissions">
          ← Hàng chờ tiếp nhận
        </Link>
        <span className="text-xs text-stone-500">Mã tiếp nhận: <strong className="text-stone-900">{submission.receiptCode}</strong></span>
      </div>

      <div className="mt-3">
        <SubmissionClaimBanner
          submissionId={submission.submissionId}
          version={submission.version}
          status={submission.status}
          claimedBy={submission.claimedBy || ""}
          claimedAt={submission.claimedAt || undefined}
          currentUserEmail={currentUserEmail}
          isAdministrator={isAdministrator}
          onRefresh={() => loadSubmission(submission.submissionId).then(setSubmission)}
        />
      </div>

      {/* Main Sticky Header & Action Bar */}
      <section className="mt-3 rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-stone-950">Bản kê khai hồ sơ đất đai</h1>
              <span className={`inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-semibold ${statusBadge.color}`}>
                {statusBadge.label}
              </span>
            </div>
            <p className="mt-1 text-xs text-stone-500">
              Liên hệ: <span className="font-semibold text-stone-800">{submission.phone}</span> · Phụ trách:{" "}
              <span className="font-semibold text-stone-800">
                {assignedOfficerLabel({
                  claimedBy: submission.claimedBy ?? "",
                  claimedByDisplayName: submission.claimedByDisplayName ?? "",
                })}
              </span>
              {submission.officialCaseId && (
                <> · Mã chính thức: <strong className="text-emerald-800">{submission.officialCaseId}</strong></>
              )}
            </p>
          </div>

          {/* Action Toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Primary Workflow Action: Official Acceptance */}
            <button
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-emerald-800 disabled:opacity-50 transition"
              disabled={
                busy ||
                !submission.draft ||
                Boolean(submission.officialCaseId) ||
                (submission.status !== "UNDER_REVIEW" && submission.status !== "ACCEPTING")
              }
              onClick={acceptOfficially}
              title={
                submission.officialCaseId
                  ? `Đã có mã hồ sơ chính thức ${submission.officialCaseId}`
                  : submission.status === "ACCEPTING"
                    ? "Lần tiếp nhận trước đang dở — bấm để chạy tiếp từ bước dở dang"
                    : "Sinh mã hồ sơ, chuyển ảnh sang 02_CASES và ghi dữ liệu chính thức"
              }
              type="button"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              {submission.status === "ACCEPTING" ? "Tiếp tục tiếp nhận" : "Tiếp nhận chính thức"}
            </button>

            {/* Secondary Actions */}
            {submission.status !== "UNDER_REVIEW" && (
              <button
                className="rounded-lg border border-stone-300 bg-stone-50 px-3.5 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-100 disabled:opacity-50"
                disabled={busy}
                onClick={() => action("CLAIM")}
                type="button"
              >
                Nhận xử lý
              </button>
            )}
            <button
              className="rounded-lg border border-sky-700 bg-sky-50 px-3.5 py-2 text-xs font-semibold text-sky-800 hover:bg-sky-100 disabled:opacity-50"
              disabled={busy || submission.status !== "UNDER_REVIEW" || !submission.draft}
              onClick={() => openEdit("EDIT")}
              type="button"
            >
              Chỉnh sửa thông tin
            </button>
            {submission.status === "ACCEPTED" && (
              <button
                className="rounded-lg border border-orange-700 bg-orange-50 px-3.5 py-2 text-xs font-semibold text-orange-800 hover:bg-orange-100 disabled:opacity-50"
                disabled={busy || !submission.draft}
                onClick={() => openEdit("AMEND")}
                title="Sửa hồ sơ đã tiếp nhận chính thức — cần lý do, và dữ liệu chính thức sẽ được ghi lại"
                type="button"
              >
                Điều chỉnh chính thức
              </button>
            )}

            {/* Exceptions */}
            <button
              className="rounded-lg border border-amber-700 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50"
              disabled={busy || submission.status !== "UNDER_REVIEW"}
              onClick={() => {
                setSupplementMessage("");
                setSupplementInstruction("");
                const promptMsg = window.prompt("Nhập nội dung thông báo yêu cầu bổ sung gửi người dân:");
                if (promptMsg && promptMsg.trim()) {
                  setSupplementMessage(promptMsg.trim());
                  setSupplementInstruction(promptMsg.trim());
                  void action("REQUEST_SUPPLEMENT");
                }
              }}
              type="button"
            >
              Yêu cầu bổ sung
            </button>
            <button
              className="rounded-lg border border-rose-700 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800 hover:bg-rose-100 disabled:opacity-50"
              disabled={busy || submission.status !== "UNDER_REVIEW"}
              onClick={() => {
                if (window.confirm("Xác nhận TỪ CHỐI hồ sơ này? Thao tác này không thể hoàn tác.")) {
                  void action("REJECT");
                }
              }}
              type="button"
            >
              Từ chối
            </button>
          </div>
        </div>

        {message && (
          <p aria-live="polite" className="mt-3 rounded-lg bg-stone-100 p-3 text-sm text-stone-700 border border-stone-200">
            {message}
          </p>
        )}
        {acceptanceIssues.length > 0 && (
          <section
            aria-live="polite"
            className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950"
          >
            <p className="font-semibold">Các mục cần hoàn thiện trước khi tiếp nhận:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {acceptanceIssues.map((issue) => (
                <li key={issue.code}>
                  <span className="font-medium">{issue.label}:</span> {issue.message}
                </li>
              ))}
            </ul>
          </section>
        )}
      </section>

      {/* Main Split-Screen Section */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Column: Interactive Document Viewer (5 Cols on large screen) */}
        <div className="lg:col-span-5">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-bold text-stone-800 uppercase tracking-wider">
              1. Ảnh giấy tờ đối chiếu
            </h2>
            <span className="text-xs text-stone-500">{submission.files.length} ảnh</span>
          </div>
          <DocumentViewer submissionId={submission.submissionId} files={submission.files} />
        </div>

        {/* Right Column: Information & Working Payload Editor (7 Cols on large screen) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Metadata Summary Info */}
          <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm text-xs grid gap-3 sm:grid-cols-3">
            <div>
              <span className="text-stone-500 block">Kênh tiếp nhận</span>
              <strong className="text-stone-900">
                {submission.intakeChannel === "OFFICER_ASSISTED"
                  ? `Cán bộ nhập hộ${submission.assistedByDisplayName ? ` (${submission.assistedByDisplayName})` : ""}`
                  : "Hộ dân tự kê khai"}
              </strong>
            </div>
            <div>
              <span className="text-stone-500 block">Cập nhật lần cuối</span>
              <strong className="text-stone-900">
                {submission.updatedAt ? formatDateTime(submission.updatedAt) : "-"}
              </strong>
            </div>
            <div>
              <span className="text-stone-500 block">Mã chính thức</span>
              <strong className="text-emerald-800">
                {submission.officialCaseId || "Chưa cấp (bản nháp)"}
              </strong>
            </div>
          </div>

          {/* Working Payload Editor (Full 49 PL3 columns tabbed) */}
          {submission.status === "UNDER_REVIEW" && workingPayload.draft ? (
            <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
              <div className="mb-3">
                <h2 className="text-base font-bold text-stone-900">2. Bàn làm việc biên tập 49 cột PL3</h2>
                <p className="text-xs text-stone-500">
                  {isClaimedByMe
                    ? "Sửa thông tin GCN, Chủ sử dụng, Thửa đất và Tài sản. Dữ liệu sẽ lưu vào Bản làm việc."
                    : "Bạn đang xem ở chế độ chỉ đọc (Chỉ cán bộ nhận xử lý mới sửa được)."}
                </p>
              </div>
              <WorkingPayloadEditor
                submissionId={submission.submissionId}
                version={submission.version}
                draft={workingPayload.draft}
                readOnly={!isClaimedByMe}
                onChange={workingPayload.updateDraft}
                onSave={async (changeNote) => {
                  const ok = await workingPayload.saveWorkingPayload(changeNote);
                  if (ok) {
                    const refreshed = await loadSubmission(submission.submissionId);
                    setSubmission(refreshed);
                  }
                  return ok;
                }}
                isDirty={workingPayload.isDirty}
                saving={workingPayload.saving}
                saveError={workingPayload.saveError}
                saveSuccess={workingPayload.saveSuccess}
              />
            </section>
          ) : draft ? (
            /* Fallback Read-Only Draft View if not in UNDER_REVIEW */
            <div className="space-y-4">
              <section className="rounded-xl border border-stone-200 bg-white p-4">
                <h2 className="text-sm font-bold text-stone-900 mb-2">Giấy chứng nhận</h2>
                <dl className="grid gap-2 text-xs sm:grid-cols-3">
                  <div>
                    <dt className="text-stone-500">Số phát hành</dt>
                    <dd className="font-semibold">{draft.certificate.issueNumber || "-"}</dd>
                  </div>
                  <div>
                    <dt className="text-stone-500">Ngày cấp</dt>
                    <dd className="font-semibold">{draft.certificate.issueDate || "-"}</dd>
                  </div>
                  <div>
                    <dt className="text-stone-500">Số vào sổ</dt>
                    <dd className="font-semibold">{draft.certificate.registryNumber || "-"}</dd>
                  </div>
                </dl>
              </section>
              <section className="rounded-xl border border-stone-200 bg-white p-4">
                <h2 className="text-sm font-bold text-stone-900 mb-2">Chủ sử dụng ({draft.owners.length})</h2>
                <div className="space-y-2 text-xs">
                  {draft.owners.map((owner, idx) => (
                    <div key={idx} className="rounded bg-stone-50 p-2.5 border border-stone-200">
                      <p className="font-semibold">{owner.fullName || "Chưa khai"}</p>
                      <p className="text-stone-600">CCCD: {owner.identityNumber || "-"} · Sinh: {owner.dateOfBirth || "-"} · Giới tính: {owner.gender || "-"}</p>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          ) : null}

          {/* AI Extraction Panel */}
          <AiDraftPanel
            submissionId={submission.submissionId}
            version={submission.version}
            mayApply={submission.status === "UNDER_REVIEW" && isClaimedByMe}
            onApplied={async () => {
              const refreshed = await loadSubmission(submission.submissionId);
              setSubmission(refreshed);
            }}
          />

          {/* Reset Access Secret Section */}
          {submission.canResetAccessSecret && (
            <section className="rounded-xl border border-stone-200 bg-white p-4 text-xs">
              <h2 className="font-bold text-stone-900">Cấp lại mã bí mật cho người dân</h2>
              <p className="mt-1 text-stone-600">
                Chỉ thực hiện khi người dân đến trực tiếp và cán bộ đã đối chiếu giấy tờ. Nhập “ĐÃ XÁC MINH”.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <input
                  className="pc-input max-w-xs text-xs"
                  value={resetConfirmation}
                  onChange={(event) => setResetConfirmation(event.target.value.toUpperCase())}
                />
                <button
                  className="pc-button-quiet text-xs"
                  type="button"
                  disabled={busy || resetConfirmation !== "ĐÃ XÁC MINH"}
                  onClick={() => void resetAccessSecret()}
                >
                  Tạo mã bí mật mới
                </button>
              </div>
              {newAccessSecret && (
                <div className="mt-3 rounded bg-amber-50 p-2.5 border border-amber-200">
                  <p className="font-semibold text-amber-900">Mã mới — chỉ hiển thị lần này</p>
                  <p className="mt-1 select-all font-mono text-base font-bold text-amber-950">{newAccessSecret}</p>
                </div>
              )}
            </section>
          )}
        </div>
      </div>
      <p className="mt-5 rounded-xl border border-stone-200 bg-stone-50 p-4 text-xs text-stone-600">
        Ảnh xem trước đã sẵn sàng để đối chiếu. Danh mục loại đất theo Thông tư 08/2024/TT-BTNMT.
      </p>
      {editOpen && submission.draft ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 py-10">
          <div className="w-full max-w-2xl rounded-xl bg-white p-5 sm:p-7">
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-xl font-bold">
                {amendMode ? "Điều chỉnh hồ sơ chính thức" : "Chỉnh sửa thông tin hồ sơ"}
              </h2>
              <button
                className="text-sm font-semibold text-stone-500"
                onClick={() => setEditOpen(false)}
                type="button"
              >
                Đóng
              </button>
            </div>
            {amendMode ? (
              <div className="mt-3 space-y-3 rounded-lg border border-orange-300 bg-orange-50 p-4">
                <p className="text-sm text-orange-900">
                  Hồ sơ đã tiếp nhận chính thức
                  {submission.officialCaseId ? ` (${submission.officialCaseId})` : ""}. Lưu thay đổi
                  sẽ <strong>ghi lại luôn dữ liệu chính thức</strong> — giấy chứng nhận, chủ sử
                  dụng, thửa đất và tài sản của hồ sơ này. Mã hồ sơ chính thức và ảnh trên Drive giữ
                  nguyên.
                </p>
                <label className="block">
                  <span className="pc-field-label">
                    Lý do điều chỉnh (bắt buộc, tối thiểu 10 ký tự)
                  </span>
                  <textarea
                    className="pc-input"
                    onChange={(event) => setAmendmentReason(event.target.value)}
                    placeholder="Ví dụ: Đối chiếu lại bìa gốc, số vào sổ ghi nhầm CS00123 thành CS00132."
                    rows={3}
                    value={amendmentReason}
                  />
                </label>
                <p className="text-xs text-orange-800">
                  Lý do được ghi vào nhật ký kiểm toán cùng danh sách trường đã đổi. Đây là dấu vết
                  duy nhất giải thích vì sao dữ liệu chính thức khác lúc tiếp nhận.
                </p>
              </div>
            ) : (
              <p className="mt-2 text-sm text-stone-600">
                Chỉ sửa lỗi gõ nhỏ giúp người dân. Nếu cần người dân nộp lại giấy tờ, dùng nút “Yêu
                cầu bổ sung”.
              </p>
            )}
            <section className="mt-5">
              <h3 className="font-semibold">Giấy chứng nhận</h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <label>
                  <span className="pc-field-label">Số phát hành</span>
                  <input
                    className="pc-input"
                    onChange={(event) =>
                      setEditCertificate((current) => ({
                        ...current,
                        issueNumber: event.target.value,
                      }))
                    }
                    value={editCertificate.issueNumber}
                  />
                </label>
                <label>
                  <span className="pc-field-label">Ngày cấp (YYYY-MM-DD)</span>
                  <input
                    className="pc-input"
                    onChange={(event) =>
                      setEditCertificate((current) => ({
                        ...current,
                        issueDate: event.target.value,
                      }))
                    }
                    value={editCertificate.issueDate}
                  />
                </label>
                <label>
                  <span className="pc-field-label">Số vào sổ</span>
                  <input
                    className="pc-input"
                    onChange={(event) =>
                      setEditCertificate((current) => ({
                        ...current,
                        registryNumber: event.target.value,
                      }))
                    }
                    value={editCertificate.registryNumber}
                  />
                </label>
              </div>
            </section>
            <section className="mt-5 space-y-4">
              <h3 className="font-semibold">Chủ sử dụng</h3>
              {editOwners.map((owner, index) => {
                const qrConfirmed = isOwnerIdentityQrConfirmed(owner.identityStatus);
                const manuallyConfirmed = owner.identityStatus === "MANUAL_COMPLETE";
                const canConfirmManually =
                  !amendMode &&
                  !qrConfirmed &&
                  !manuallyConfirmed &&
                  !owner.hasDistinctCurrentUser &&
                  owner.ownerType !== "TO_CHUC" &&
                  owner.ownerType !== "CONG_DONG_DAN_CU";
                const selectedForManualConfirmation = manualIdentityConfirmationOwnerIds.includes(
                  owner.id,
                );
                function updateOwner(patch: Partial<EditableOwner>) {
                  setEditOwners((current) =>
                    current.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, ...patch } : item,
                    ),
                  );
                }
                return (
                  <div className="rounded-lg border border-stone-200 p-4" key={owner.id}>
                    {qrConfirmed ? (
                      <p className="mb-2 rounded bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800">
                        Đọc từ chip CCCD qua QR. Sửa được, nhưng mỗi lần ghi đè đều được ghi nhận
                        riêng trong nhật ký — chỉ sửa khi đối chiếu bìa/thẻ thấy sai thật.
                      </p>
                    ) : null}
                    {canConfirmManually ? (
                      <label className="mb-3 flex cursor-pointer items-start gap-2 rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950">
                        <input
                          checked={selectedForManualConfirmation}
                          className="mt-1"
                          onChange={(event) => {
                            setManualIdentityConfirmationOwnerIds((current) =>
                              event.target.checked
                                ? [...current, owner.id]
                                : current.filter((ownerId) => ownerId !== owner.id),
                            );
                          }}
                          type="checkbox"
                        />
                        <span>
                          Tôi đã đối chiếu CCCD/bản giấy tờ gốc và xác nhận thông tin định danh
                          của chủ sử dụng này.
                        </span>
                      </label>
                    ) : manuallyConfirmed ? (
                      <p className="mb-3 rounded bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800">
                        Thông tin định danh đã được xác nhận thủ công.
                      </p>
                    ) : null}
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label>
                        <span className="pc-field-label">Họ tên</span>
                        <input
                          className="pc-input"
                          onChange={(event) => updateOwner({ fullName: event.target.value })}
                          value={owner.fullName}
                        />
                      </label>
                      <label>
                        <span className="pc-field-label">CCCD/định danh</span>
                        <input
                          className="pc-input"
                          onChange={(event) => updateOwner({ identityNumber: event.target.value })}
                          value={owner.identityNumber}
                        />
                      </label>
                      <label>
                        <span className="pc-field-label">Ngày sinh (YYYY-MM-DD)</span>
                        <input
                          className="pc-input"
                          onChange={(event) => updateOwner({ dateOfBirth: event.target.value })}
                          value={owner.dateOfBirth}
                        />
                      </label>
                      <label>
                        <span className="pc-field-label">Giới tính</span>
                        <select
                          className="pc-select"
                          onChange={(event) => updateOwner({ gender: event.target.value })}
                          value={owner.gender}
                        >
                          <option value="">— Chọn —</option>
                          <option value="NAM">Nam</option>
                          <option value="NU">Nữ</option>
                        </select>
                      </label>
                      <label className="sm:col-span-2">
                        <span className="pc-field-label">Thường trú</span>
                        <input
                          className="pc-input"
                          onChange={(event) =>
                            updateOwner({ residenceAddress: event.target.value })
                          }
                          value={owner.residenceAddress}
                        />
                      </label>
                      <label className="sm:col-span-2">
                        <span className="pc-field-label">Vai trò trên Giấy chứng nhận</span>
                        <select
                          className="pc-select"
                          onChange={(event) =>
                            updateOwner({ roleOnCertificate: event.target.value })
                          }
                          value={owner.roleOnCertificate}
                        >
                          <option value="">— Chọn —</option>
                          {CERTIFICATE_ROLE_OPTIONS.map((option) => (
                            <option key={option.code} value={option.code}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    {qrConfirmed ? (
                      <label className="mt-3 block">
                        <span className="pc-field-label">
                          Lý do nếu sửa họ tên, CCCD, ngày sinh hoặc giới tính
                        </span>
                        <textarea
                          className="pc-textarea"
                          onChange={(event) =>
                            updateOwner({ identityOverrideReason: event.target.value })
                          }
                          value={owner.identityOverrideReason}
                        />
                      </label>
                    ) : null}
                  </div>
                );
              })}
            </section>
            <div className="mt-5 flex justify-end gap-3">
              <button
                className="pc-button-quiet"
                disabled={busy}
                onClick={() => setEditOpen(false)}
                type="button"
              >
                Hủy
              </button>
              {!amendMode && manualIdentityConfirmationOwnerIds.length > 0 ? (
                <button
                  className="rounded-lg bg-emerald-800 px-4 py-2 font-semibold text-white disabled:opacity-50"
                  disabled={busy}
                  onClick={() => void confirmManualIdentity()}
                  type="button"
                >
                  Xác nhận đã đối chiếu CCCD
                </button>
              ) : null}
              <button
                className={
                  amendMode
                    ? "rounded-lg bg-orange-700 px-4 py-2 font-semibold text-white disabled:opacity-50"
                    : "rounded-lg bg-emerald-800 px-4 py-2 font-semibold text-white disabled:opacity-50"
                }
                disabled={
                  busy ||
                  manualIdentityConfirmationOwnerIds.length > 0 ||
                  (amendMode && amendmentReason.trim().length < 10)
                }
                onClick={() => void saveEdit()}
                type="button"
              >
                {amendMode ? "Lưu điều chỉnh chính thức" : "Lưu thay đổi"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
