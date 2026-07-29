"use client";

import {
  LAND_ORIGIN_OPTIONS,
  LAND_PURPOSE_GHI_THEO_BIA,
  LAND_PURPOSE_SELECT_OPTIONS,
  LAND_USE_FORM_OPTIONS,
  LAND_USE_TERM_OPTIONS,
  OLD_WARD_OPTIONS,
} from "@/modules/public-intake/reference";
import { lookupNewMapSheet } from "@/modules/public-intake/map-sheet-reference";
import {
  emptyLandUse,
  emptyParcel,
  MAX_LAND_USES_PER_PARCEL,
  type LandUse,
  type Parcel,
} from "@/modules/public-intake/types";

interface EditableParcelTableProps {
  parcels: Parcel[];
  readOnly?: boolean;
  onChange: (parcels: Parcel[]) => void;
}

const inputClass =
  "mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100";

function newId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
      {label}
      {children}
      {hint ? <span className="mt-1 block font-normal text-gray-500">{hint}</span> : null}
    </label>
  );
}

function SelectField({
  value,
  options,
  disabled,
  onChange,
}: {
  value: string;
  options: readonly { code: string; label: string }[];
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <select
      disabled={disabled}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={inputClass}
    >
      <option value="">-- Chọn --</option>
      {options.map((option) => (
        <option key={option.code} value={option.code}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function automaticMapSheet(parcel: Parcel): string {
  if (!parcel.oldWard || !parcel.mapSheetNumber) return "";
  if (
    parcel.oldWard !== "PHU_HO" &&
    parcel.oldWard !== "HA_THACH" &&
    parcel.oldWard !== "PHONG_CHAU_CU"
  ) {
    return "";
  }
  const result = lookupNewMapSheet(parcel.oldWard, parcel.mapSheetNumber);
  return result.status === "RESOLVED" ? result.newSheet : "";
}

export function EditableParcelTable({
  parcels,
  readOnly = false,
  onChange,
}: EditableParcelTableProps) {
  const updateParcel = <TField extends keyof Parcel>(
    index: number,
    field: TField,
    value: Parcel[TField],
  ) => {
    const updated = [...parcels];
    updated[index] = { ...updated[index], [field]: value };
    onChange(updated);
  };

  const updateLandUse = <TField extends keyof LandUse>(
    parcelIndex: number,
    useIndex: number,
    field: TField,
    value: LandUse[TField],
  ) => {
    const updated = [...parcels];
    const landUses = [...updated[parcelIndex].landUses];
    landUses[useIndex] = { ...landUses[useIndex], [field]: value };
    updated[parcelIndex] = { ...updated[parcelIndex], landUses };
    onChange(updated);
  };

  const addParcel = () => {
    onChange([...parcels, emptyParcel(newId("parcel"), newId("landuse"))]);
  };

  const duplicateParcel = (index: number) => {
    const source = parcels[index];
    const duplicate: Parcel = {
      ...source,
      id: newId("parcel"),
      landUses: source.landUses.map((use) => ({ ...use, id: newId("landuse") })),
    };
    const updated = [...parcels];
    updated.splice(index + 1, 0, duplicate);
    onChange(updated);
  };

  const deleteParcel = (index: number) => {
    onChange(parcels.filter((_, current) => current !== index));
  };

  const addLandUse = (parcelIndex: number) => {
    const parcel = parcels[parcelIndex];
    if (parcel.landUses.length >= MAX_LAND_USES_PER_PARCEL) return;
    updateParcel(parcelIndex, "landUses", [...parcel.landUses, emptyLandUse(newId("landuse"))]);
  };

  const deleteLandUse = (parcelIndex: number, useIndex: number) => {
    const parcel = parcels[parcelIndex];
    updateParcel(
      parcelIndex,
      "landUses",
      parcel.landUses.filter((_, current) => current !== useIndex),
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Thông tin thửa đất — cột S–AN
          </h3>
          <p className="mt-1 text-xs text-gray-500">
            Mỗi thửa có tối đa 3 mục đích sử dụng, đúng ba nhóm cột Z–AD, AE–AI và AJ–AN của PL3.
          </p>
        </div>
        {!readOnly ? (
          <button
            type="button"
            onClick={addParcel}
            className="rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
          >
            + Thêm thửa đất
          </button>
        ) : null}
      </div>

      {parcels.length === 0 ? (
        <p className="rounded border border-dashed p-4 text-xs text-gray-500">
          Chưa có thửa đất. Hãy thêm ít nhất một thửa trước khi tiếp nhận chính thức.
        </p>
      ) : null}

      {parcels.map((parcel, parcelIndex) => {
        const automaticSheet = automaticMapSheet(parcel);
        return (
          <section
            key={parcel.id}
            className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900"
          >
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-semibold">Thửa đất {parcelIndex + 1}</h4>
              {!readOnly ? (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => duplicateParcel(parcelIndex)}
                    className="rounded border px-2 py-1 text-xs"
                  >
                    Nhân bản
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteParcel(parcelIndex)}
                    className="rounded border border-red-300 px-2 py-1 text-xs text-red-700"
                  >
                    Xóa thửa
                  </button>
                </div>
              ) : null}
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
              <Field label="S — Mã định danh thửa đất">
                <input
                  disabled={readOnly}
                  value={parcel.parcelIdCode}
                  onChange={(event) =>
                    updateParcel(parcelIndex, "parcelIdCode", event.target.value)
                  }
                  className={inputClass}
                />
              </Field>
              <Field label="T — Số tờ bản đồ ghi trên GCN">
                <input
                  disabled={readOnly}
                  value={parcel.mapSheetNumber}
                  onChange={(event) =>
                    updateParcel(parcelIndex, "mapSheetNumber", event.target.value)
                  }
                  className={inputClass}
                />
              </Field>
              <Field label="U — Số thứ tự thửa đất ghi trên GCN">
                <input
                  disabled={readOnly}
                  value={parcel.parcelNumber}
                  onChange={(event) =>
                    updateParcel(parcelIndex, "parcelNumber", event.target.value)
                  }
                  className={inputClass}
                />
              </Field>
              <Field label="Đơn vị hành chính cũ" hint="Nguồn dùng để tự động suy ra cột V.">
                <SelectField
                  disabled={readOnly}
                  value={parcel.oldWard}
                  options={OLD_WARD_OPTIONS}
                  onChange={(value) => updateParcel(parcelIndex, "oldWard", value)}
                />
              </Field>
              <Field
                label="V — Số hiệu tờ trên bản đồ địa chính"
                hint={`Nguồn tự động: ĐVHC cũ + cột T. Giá trị suy ra: ${automaticSheet || "chưa xác định"}. Để trống ô này để dùng tự động.`}
              >
                <input
                  disabled={readOnly}
                  value={parcel.cadastralMapSheetNumber ?? ""}
                  placeholder={automaticSheet || "Nhập giá trị ghi đè"}
                  onChange={(event) =>
                    updateParcel(parcelIndex, "cadastralMapSheetNumber", event.target.value)
                  }
                  className={inputClass}
                />
              </Field>
              <Field
                label="Lý do ghi đè cột V"
                hint="Tối thiểu 10 ký tự. Chỉ ghi lý do nghiệp vụ ngắn (ví dụ: Theo bản đồ địa chính đã đối chiếu). KHÔNG ghi CCCD hay thông tin định danh cá nhân — hệ thống sẽ từ chối lưu."
              >
                <input
                  disabled={readOnly || !(parcel.cadastralMapSheetNumber ?? "").trim()}
                  value={parcel.cadastralMapSheetOverrideReason ?? ""}
                  onChange={(event) =>
                    updateParcel(parcelIndex, "cadastralMapSheetOverrideReason", event.target.value)
                  }
                  className={inputClass}
                />
              </Field>
              <Field label="W — Số thứ tự thửa trên bản đồ địa chính">
                <input
                  disabled={readOnly}
                  value={parcel.cadastralParcelNumber ?? ""}
                  onChange={(event) =>
                    updateParcel(parcelIndex, "cadastralParcelNumber", event.target.value)
                  }
                  className={inputClass}
                />
              </Field>
              <Field label="Y — Diện tích thửa đất (m²)">
                <input
                  disabled={readOnly}
                  value={parcel.area}
                  onChange={(event) => updateParcel(parcelIndex, "area", event.target.value)}
                  className={inputClass}
                />
              </Field>
              <div className="md:col-span-2">
                <Field label="X — Địa chỉ thửa đất trên GCN">
                  <input
                    disabled={readOnly}
                    value={parcel.addressOnCertificate}
                    onChange={(event) =>
                      updateParcel(parcelIndex, "addressOnCertificate", event.target.value)
                    }
                    className={inputClass}
                  />
                </Field>
              </div>
              <div className="md:col-span-2">
                <Field label="Địa chỉ thửa đất 2 cấp (dữ liệu chuẩn hóa nội bộ)">
                  <input
                    disabled={readOnly}
                    value={parcel.addressTwoLevel}
                    onChange={(event) =>
                      updateParcel(parcelIndex, "addressTwoLevel", event.target.value)
                    }
                    className={inputClass}
                  />
                </Field>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              <div className="flex items-center justify-between">
                <h5 className="text-xs font-semibold uppercase tracking-wide text-gray-600">
                  Mục đích sử dụng ({parcel.landUses.length}/{MAX_LAND_USES_PER_PARCEL})
                </h5>
                {!readOnly && parcel.landUses.length < MAX_LAND_USES_PER_PARCEL ? (
                  <button
                    type="button"
                    onClick={() => addLandUse(parcelIndex)}
                    className="rounded border px-2 py-1 text-xs"
                  >
                    + Thêm mục đích
                  </button>
                ) : null}
              </div>
              {parcel.landUses.map((use, useIndex) => (
                <div
                  key={use.id}
                  className="rounded border border-gray-200 p-3 dark:border-gray-700"
                >
                  <div className="mb-2 flex items-center justify-between">
                    <strong className="text-xs">Loại đất {useIndex + 1}</strong>
                    {!readOnly ? (
                      <button
                        type="button"
                        onClick={() => deleteLandUse(parcelIndex, useIndex)}
                        className="text-xs text-red-700"
                      >
                        Xóa mục đích
                      </button>
                    ) : null}
                  </div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
                    <Field label="Loại đất">
                      <SelectField
                        disabled={readOnly}
                        value={use.purposeCode}
                        options={LAND_PURPOSE_SELECT_OPTIONS}
                        onChange={(value) =>
                          updateLandUse(parcelIndex, useIndex, "purposeCode", value)
                        }
                      />
                    </Field>
                    <Field label="Diện tích (m²)">
                      <input
                        disabled={readOnly}
                        value={use.area}
                        onChange={(event) =>
                          updateLandUse(parcelIndex, useIndex, "area", event.target.value)
                        }
                        className={inputClass}
                      />
                    </Field>
                    <Field label="Nguồn gốc sử dụng">
                      <SelectField
                        disabled={readOnly}
                        value={use.originCode}
                        options={LAND_ORIGIN_OPTIONS}
                        onChange={(value) =>
                          updateLandUse(parcelIndex, useIndex, "originCode", value)
                        }
                      />
                    </Field>
                    <Field label="Hình thức sử dụng">
                      <SelectField
                        disabled={readOnly}
                        value={use.formCode}
                        options={LAND_USE_FORM_OPTIONS}
                        onChange={(value) =>
                          updateLandUse(parcelIndex, useIndex, "formCode", value)
                        }
                      />
                    </Field>
                    <Field label="Thời hạn sử dụng">
                      <SelectField
                        disabled={readOnly}
                        value={use.termCode}
                        options={LAND_USE_TERM_OPTIONS}
                        onChange={(value) =>
                          updateLandUse(parcelIndex, useIndex, "termCode", value)
                        }
                      />
                    </Field>
                  </div>
                  {use.purposeCode === LAND_PURPOSE_GHI_THEO_BIA ? (
                    <div className="mt-3">
                      <Field label="Nội dung loại đất ghi nguyên văn theo bìa GCN">
                        <input
                          disabled={readOnly}
                          value={use.purposeFreeText}
                          onChange={(event) =>
                            updateLandUse(
                              parcelIndex,
                              useIndex,
                              "purposeFreeText",
                              event.target.value,
                            )
                          }
                          className={inputClass}
                        />
                      </Field>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
