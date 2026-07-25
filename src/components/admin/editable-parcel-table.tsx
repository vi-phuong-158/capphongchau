"use client";

import { useState } from "react";
import { emptyLandUse, emptyParcel, type Parcel } from "@/modules/public-intake/types";
import { OLD_WARD_OPTIONS } from "@/modules/public-intake/reference";

interface EditableParcelTableProps {
  parcels: Parcel[];
  readOnly?: boolean;
  onChange: (parcels: Parcel[]) => void;
}

export function EditableParcelTable({ parcels, readOnly = false, onChange }: EditableParcelTableProps) {
  const [selectedParcelId, setSelectedParcelId] = useState<string | null>(parcels[0]?.id || null);

  const handleUpdateParcel = (index: number, field: keyof Parcel, value: any) => {
    const updated = [...parcels];
    updated[index] = { ...updated[index], [field]: value };
    onChange(updated);
  };

  const handleAddParcel = () => {
    const newId = `p_${Date.now()}`;
    const newLuId = `lu_${Date.now()}`;
    const newP = emptyParcel(newId, newLuId);
    onChange([...parcels, newP]);
    setSelectedParcelId(newId);
  };

  const handleDuplicateParcel = (index: number) => {
    const source = parcels[index];
    const newId = `p_${Date.now()}`;
    const duplicated: Parcel = {
      ...source,
      id: newId,
      parcelNumber: `${source.parcelNumber}-copy`,
      landUses: source.landUses.map((lu, idx) => ({ ...lu, id: `lu_${Date.now()}_${idx}` })),
    };
    const updated = [...parcels];
    updated.splice(index + 1, 0, duplicated);
    onChange(updated);
    setSelectedParcelId(newId);
  };

  const handleDeleteParcel = (index: number) => {
    if (parcels.length <= 1) return;
    const updated = parcels.filter((_, i) => i !== index);
    onChange(updated);
    if (selectedParcelId === parcels[index].id) {
      setSelectedParcelId(updated[0]?.id || null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          Danh sách thửa đất ({parcels.length} thửa)
        </h4>
        {!readOnly && (
          <button
            type="button"
            onClick={handleAddParcel}
            className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700"
          >
            + Thêm thửa đất
          </button>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800">
        <table className="w-full text-left text-xs text-gray-700 dark:text-gray-300">
          <thead className="bg-gray-50 text-gray-700 dark:bg-gray-800 dark:text-gray-300">
            <tr>
              <th className="p-2 border-b w-10 text-center">STT</th>
              <th className="p-2 border-b">Số tờ</th>
              <th className="p-2 border-b">Số thửa</th>
              <th className="p-2 border-b">Diện tích (m²)</th>
              <th className="p-2 border-b">ĐVHC Cũ</th>
              <th className="p-2 border-b">Mục đích SD</th>
              {!readOnly && <th className="p-2 border-b w-24 text-center">Thao tác</th>}
            </tr>
          </thead>
          <tbody>
            {parcels.map((parcel, idx) => {
              const isSelected = parcel.id === selectedParcelId;
              return (
                <tr
                  key={parcel.id || idx}
                  onClick={() => setSelectedParcelId(parcel.id)}
                  className={`border-b cursor-pointer transition-colors ${
                    isSelected ? "bg-blue-50 dark:bg-blue-950/50" : "hover:bg-gray-50 dark:hover:bg-gray-900"
                  }`}
                >
                  <td className="p-2 text-center font-medium">{idx + 1}</td>
                  <td className="p-2">
                    {readOnly ? (
                      parcel.mapSheetNumber
                    ) : (
                      <input
                        type="text"
                        value={parcel.mapSheetNumber}
                        onChange={(e) => handleUpdateParcel(idx, "mapSheetNumber", e.target.value)}
                        className="w-full rounded border px-1.5 py-0.5 text-xs text-gray-900 dark:bg-gray-800 dark:text-gray-100"
                      />
                    )}
                  </td>
                  <td className="p-2">
                    {readOnly ? (
                      parcel.parcelNumber
                    ) : (
                      <input
                        type="text"
                        value={parcel.parcelNumber}
                        onChange={(e) => handleUpdateParcel(idx, "parcelNumber", e.target.value)}
                        className="w-full rounded border px-1.5 py-0.5 text-xs text-gray-900 dark:bg-gray-800 dark:text-gray-100"
                      />
                    )}
                  </td>
                  <td className="p-2">
                    {readOnly ? (
                      parcel.area
                    ) : (
                      <input
                        type="text"
                        value={parcel.area}
                        onChange={(e) => handleUpdateParcel(idx, "area", e.target.value)}
                        className="w-full rounded border px-1.5 py-0.5 text-xs text-gray-900 dark:bg-gray-800 dark:text-gray-100"
                      />
                    )}
                  </td>
                  <td className="p-2">
                    {readOnly ? (
                      OLD_WARD_OPTIONS.find((w) => w.code === parcel.oldWard)?.label || parcel.oldWard
                    ) : (
                      <select
                        value={parcel.oldWard}
                        onChange={(e) => handleUpdateParcel(idx, "oldWard", e.target.value)}
                        className="w-full rounded border px-1.5 py-0.5 text-xs text-gray-900 dark:bg-gray-800 dark:text-gray-100"
                      >
                        <option value="">-- Chọn ĐVHC cũ --</option>
                        {OLD_WARD_OPTIONS.map((w) => (
                          <option key={w.code} value={w.code}>
                            {w.label}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td className="p-2">
                    <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                      {parcel.landUses.length} mục đích
                    </span>
                  </td>
                  {!readOnly && (
                    <td className="p-2 text-center space-x-1">
                      <button
                        type="button"
                        title="Nhân bản thửa"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDuplicateParcel(idx);
                        }}
                        className="rounded bg-gray-100 p-1 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300"
                      >
                        📋
                      </button>
                      <button
                        type="button"
                        title="Xóa thửa"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteParcel(idx);
                        }}
                        className="rounded bg-red-100 p-1 text-red-600 hover:bg-red-200 dark:bg-red-950 dark:text-red-300"
                      >
                        🗑️
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
