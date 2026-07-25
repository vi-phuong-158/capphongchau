"use client";

import { useState } from "react";
import type { IntakeDraft } from "@/modules/public-intake/types";

async function csrfToken(): Promise<string> {
  const response = await fetch("/api/security/csrf", { cache: "no-store" });
  if (!response.ok) throw new Error();
  return ((await response.json()) as { csrfToken: string }).csrfToken;
}

export function useWorkingPayload(
  submissionId: string,
  initialDraft: IntakeDraft | null,
  version: number,
  isClaimedByMe: boolean,
) {
  const [draft, setDraft] = useState<IntakeDraft | null>(initialDraft);
  const [isDirty, setIsDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Đồng bộ khi `initialDraft` đổi tham chiếu (ví dụ sau khi tải lại hồ sơ) — cập nhật ngay trong
  // lúc render thay vì trong effect để tránh một lượt render thừa.
  const [syncedDraft, setSyncedDraft] = useState(initialDraft);
  if (initialDraft !== syncedDraft) {
    setSyncedDraft(initialDraft);
    setDraft(initialDraft);
    setIsDirty(false);
  }

  const updateDraft = (newDraft: IntakeDraft) => {
    setDraft(newDraft);
    setIsDirty(true);
    setSaveSuccess(false);
  };

  const saveWorkingPayload = async (changeNote?: string): Promise<boolean> => {
    if (!draft || !isClaimedByMe) return false;
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      const token = await csrfToken();
      const res = await fetch(`/api/submissions/${submissionId}/working-payload`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "idempotency-key": crypto.randomUUID(),
          "x-csrf-token": token,
        },
        body: JSON.stringify({
          expectedVersion: version,
          payload: draft,
          changeNote,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || "Không thể lưu bản làm việc.");
      }

      setIsDirty(false);
      setSaveSuccess(true);
      return true;
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Không thể lưu bản làm việc.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  return {
    draft,
    isDirty,
    saving,
    saveError,
    saveSuccess,
    updateDraft,
    saveWorkingPayload,
  };
}
