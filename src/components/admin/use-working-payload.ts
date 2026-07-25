"use client";

import { useEffect, useState } from "react";
import type { IntakeDraft } from "@/modules/public-intake/types";

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

  useEffect(() => {
    setDraft(initialDraft);
    setIsDirty(false);
  }, [initialDraft]);

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
      const res = await fetch(`/api/submissions/${submissionId}/working-payload`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "idempotency-key": crypto.randomUUID(),
          "x-csrf-token": "",
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
    } catch (err: any) {
      setSaveError(err.message);
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
