"use client";

import { useState } from "react";
import type { IntakeDraft, Owner, Parcel } from "@/modules/public-intake/types";
import { EditableParcelTable } from "./editable-parcel-table";

interface WorkingPayloadEditorProps {
  submissionId: string;
  version: number;
  draft: IntakeDraft;
  readOnly?: boolean;
  onSave: (changeNote?: string) => Promise<boolean>;
  onChange: (updated: IntakeDraft) => void;
  isDirty: boolean;
  saving: boolean;
  saveError: string | null;
  saveSuccess: boolean;
}

export function WorkingPayloadEditor({
  draft,
  readOnly = false,
  onSave,
  onChange,
  isDirty,
  saving,
  saveError,
  saveSuccess,
}: WorkingPayloadEditorProps) {
  const [changeNote, setChangeNote] = useState("");

  const handleCertificateChange = (field: string, value: string) => {
    onChange({
      ...draft,
      certificate: { ...draft.certificate, [field]: value },
    });
  };

  const handleParcelsChange = (parcels: Parcel[]) => {
    onChange({ ...draft, parcels });
  };

  const handleOwnersChange = (owners: Owner[]) => {
    onChange({ ...draft, owners });
  };

  return (
    <div className="space-y-6">
      {/* 1. Giấy chứng nhận */}
      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-100">
          Thông tin Giấy chứng nhận (GCN)
        </h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
              Số phát hành GCN
            </label>
            <input
              type="text"
              disabled={readOnly}
              value={draft.certificate.issueNumber}
              onChange={(e) => handleCertificateChange("issueNumber", e.target.value)}
              className="mt-1 w-full rounded border p-1.5 text-xs text-gray-900 dark:bg-gray-800 dark:text-gray-100"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
              Ngày cấp
            </label>
            <input
              type="text"
              placeholder="YYYY-MM-DD"
              disabled={readOnly}
              value={draft.certificate.issueDate}
              onChange={(e) => handleCertificateChange("issueDate", e.target.value)}
              className="mt-1 w-full rounded border p-1.5 text-xs text-gray-900 dark:bg-gray-800 dark:text-gray-100"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
              Số vào sổ cấp GCN
            </label>
            <input
              type="text"
              disabled={readOnly}
              value={draft.certificate.registryNumber}
              onChange={(e) => handleCertificateChange("registryNumber", e.target.value)}
              className="mt-1 w-full rounded border p-1.5 text-xs text-gray-900 dark:bg-gray-800 dark:text-gray-100"
            />
          </div>
        </div>
      </div>

      {/* 2. Chủ sử dụng */}
      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-100">
          Chủ sử dụng ({draft.owners.length} người)
        </h3>
        <div className="space-y-3">
          {draft.owners.map((owner, idx) => (
            <div key={owner.id || idx} className="rounded border p-3 dark:border-gray-800">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                    Họ và tên
                  </label>
                  <input
                    type="text"
                    disabled={readOnly}
                    value={owner.fullName}
                    onChange={(e) => {
                      const updated = [...draft.owners];
                      updated[idx] = { ...updated[idx], fullName: e.target.value };
                      handleOwnersChange(updated);
                    }}
                    className="mt-1 w-full rounded border p-1.5 text-xs text-gray-900 dark:bg-gray-800 dark:text-gray-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                    Số CCCD / Mã số thuế
                  </label>
                  <input
                    type="text"
                    disabled={readOnly}
                    value={owner.identityNumber}
                    onChange={(e) => {
                      const updated = [...draft.owners];
                      updated[idx] = { ...updated[idx], identityNumber: e.target.value };
                      handleOwnersChange(updated);
                    }}
                    className="mt-1 w-full rounded border p-1.5 text-xs text-gray-900 dark:bg-gray-800 dark:text-gray-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                    Địa chỉ thường trú
                  </label>
                  <input
                    type="text"
                    disabled={readOnly}
                    value={owner.residenceAddress}
                    onChange={(e) => {
                      const updated = [...draft.owners];
                      updated[idx] = { ...updated[idx], residenceAddress: e.target.value };
                      handleOwnersChange(updated);
                    }}
                    className="mt-1 w-full rounded border p-1.5 text-xs text-gray-900 dark:bg-gray-800 dark:text-gray-100"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 3. Thửa đất */}
      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <EditableParcelTable
          parcels={draft.parcels}
          readOnly={readOnly}
          onChange={handleParcelsChange}
        />
      </div>

      {/* Nút lưu bản làm việc */}
      {!readOnly && (
        <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
          {saveError && <div className="mb-2 text-xs font-medium text-red-600">{saveError}</div>}
          {saveSuccess && (
            <div className="mb-2 text-xs font-medium text-green-600">
              Đã lưu bản làm việc thành công!
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-4">
            <input
              type="text"
              placeholder="Ghi chú thay đổi (tùy chọn)..."
              value={changeNote}
              onChange={(e) => setChangeNote(e.target.value)}
              className="max-w-md w-full rounded border p-1.5 text-xs text-gray-900 dark:bg-gray-800 dark:text-gray-100"
            />
            <button
              type="button"
              disabled={saving || !isDirty}
              onClick={() => onSave(changeNote)}
              className="rounded bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "Đang lưu..." : isDirty ? "Lưu bản làm việc" : "Đã lưu (Không có thay đổi)"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
