"use client";

import { useState, type ReactNode } from "react";

import {
  ASSET_TYPE_OPTIONS,
  CERTIFICATE_ROLE_OPTIONS,
  CHANGE_REASON_OPTIONS,
  WARD_ADMIN_CODE,
} from "@/modules/public-intake/reference";
import {
  detachAssetsFromMissingParcels,
  emptyAsset,
  emptyOwner,
  isOrganisationOwner,
  migrateLegacyOrganisationOwner,
  OWNER_TYPE_LABELS,
  OWNER_TYPES,
  type Asset,
  type IntakeDraft,
  type Owner,
  type Parcel,
} from "@/modules/public-intake/types";

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

const inputClass =
  "mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100";

function newId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
      {label}
      {children}
      {hint ? <span className="mt-1 block font-normal text-gray-500">{hint}</span> : null}
    </label>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
      {description ? <p className="mt-1 text-xs text-gray-500">{description}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Options({
  value,
  disabled,
  options,
  onChange,
}: {
  value: string;
  disabled: boolean;
  options: readonly { code: string; label: string }[];
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

  /**
   * Mọi thao tác sửa trên một dòng tổ chức cũ phải di trú F/G trước — xem
   * `migrateLegacyOrganisationOwner`.
   */
  const updateOwner = <TField extends keyof Owner>(
    index: number,
    field: TField,
    value: Owner[TField],
  ) => {
    const owners = [...draft.owners];
    owners[index] = { ...migrateLegacyOrganisationOwner(owners[index]), [field]: value };
    onChange({ ...draft, owners });
  };

  /**
   * Đổi pháp nhân KHÔNG di trú: chuyển một dòng tổ chức cũ về cá nhân nghĩa là cán bộ khẳng định
   * `fullName` vốn là tên người, nên phải giữ nguyên tại chỗ thay vì đẩy sang ô tên tổ chức.
   */
  const updateOwnerType = (index: number, ownerType: Owner["ownerType"]) => {
    const owners = [...draft.owners];
    owners[index] = { ...owners[index], ownerType };
    onChange({ ...draft, owners });
  };

  /** Xóa thửa phải gỡ tham chiếu tài sản — xem `detachAssetsFromMissingParcels`. */
  const updateParcels = (parcels: Parcel[]) => {
    onChange({ ...draft, parcels, assets: detachAssetsFromMissingParcels(draft.assets, parcels) });
  };

  const updateAsset = <TField extends keyof Asset>(
    index: number,
    field: TField,
    value: Asset[TField],
  ) => {
    const assets = [...draft.assets];
    assets[index] = { ...assets[index], [field]: value };
    onChange({ ...draft, assets });
  };

  const handleSave = async () => {
    const saved = await onSave(changeNote);
    if (saved) setChangeNote("");
  };

  return (
    <div className="space-y-6">
      <Section
        title="Đối chiếu PL3 và các trường tự động"
        description="Bàn làm việc bao phủ đúng 49 cột dữ liệu B–AX. Trường tự động luôn hiển thị nguồn; nếu ghi đè phải nhập lý do."
      >
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded border border-blue-200 bg-blue-50 p-3 dark:border-blue-900 dark:bg-blue-950/30">
            <Field
              label={`B — Mã ĐVHC cấp xã (tự động: ${WARD_ADMIN_CODE})`}
              hint="Nguồn: mã hành chính cố định của Phường Phong Châu. Để trống để dùng giá trị tự động."
            >
              <input
                disabled={readOnly}
                value={draft.wardAdministrativeCodeOverride ?? ""}
                placeholder={WARD_ADMIN_CODE}
                onChange={(event) =>
                  onChange({ ...draft, wardAdministrativeCodeOverride: event.target.value })
                }
                className={inputClass}
              />
            </Field>
            <div className="mt-3">
              <Field
                label="Lý do ghi đè cột B"
                hint="Bắt buộc tối thiểu 10 ký tự khi nhập giá trị ghi đè."
              >
                <input
                  disabled={readOnly || !(draft.wardAdministrativeCodeOverride ?? "").trim()}
                  value={draft.wardAdministrativeCodeOverrideReason ?? ""}
                  onChange={(event) =>
                    onChange({
                      ...draft,
                      wardAdministrativeCodeOverrideReason: event.target.value,
                    })
                  }
                  className={inputClass}
                />
              </Field>
            </div>
          </div>
          <div className="rounded border border-blue-200 bg-blue-50 p-3 dark:border-blue-900 dark:bg-blue-950/30">
            <Field
              label="AX — Tên file quét GCN/CCCD"
              hint="Nguồn tự động: tên tệp thực tế sau khi tiếp nhận và đổi tên trên Drive. Để trống để dùng danh sách tự động."
            >
              <input
                disabled={readOnly}
                value={draft.scannedFileNamesOverride ?? ""}
                placeholder="Tự động từ tệp đã xác minh"
                onChange={(event) =>
                  onChange({ ...draft, scannedFileNamesOverride: event.target.value })
                }
                className={inputClass}
              />
            </Field>
            <div className="mt-3">
              <Field
                label="Lý do ghi đè cột AX"
                hint="Bắt buộc tối thiểu 10 ký tự khi nhập giá trị ghi đè."
              >
                <input
                  disabled={readOnly || !(draft.scannedFileNamesOverride ?? "").trim()}
                  value={draft.scannedFileNamesOverrideReason ?? ""}
                  onChange={(event) =>
                    onChange({
                      ...draft,
                      scannedFileNamesOverrideReason: event.target.value,
                    })
                  }
                  className={inputClass}
                />
              </Field>
            </div>
          </div>
        </div>
      </Section>

      <Section title="Giấy chứng nhận — cột C–E">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="C — Số phát hành GCN">
            <input
              disabled={readOnly}
              value={draft.certificate.issueNumber}
              onChange={(event) =>
                onChange({
                  ...draft,
                  certificate: { ...draft.certificate, issueNumber: event.target.value },
                })
              }
              className={inputClass}
            />
          </Field>
          <Field label="D — Ngày cấp GCN" hint="Định dạng lưu: YYYY-MM-DD.">
            <input
              disabled={readOnly}
              value={draft.certificate.issueDate}
              onChange={(event) =>
                onChange({
                  ...draft,
                  certificate: { ...draft.certificate, issueDate: event.target.value },
                })
              }
              className={inputClass}
            />
          </Field>
          <Field label="E — Số vào sổ GCN">
            <input
              disabled={readOnly}
              value={draft.certificate.registryNumber}
              onChange={(event) =>
                onChange({
                  ...draft,
                  certificate: { ...draft.certificate, registryNumber: event.target.value },
                })
              }
              className={inputClass}
            />
          </Field>
        </div>
      </Section>

      <Section
        title={`Chủ sử dụng, tổ chức và người đại diện — cột F–N (${draft.owners.length})`}
        description="Tổ chức (F/G) và người đại diện (H–L) là hai nhóm riêng, không còn dùng chung một ô dữ liệu."
      >
        {!readOnly ? (
          <button
            type="button"
            onClick={() =>
              onChange({ ...draft, owners: [...draft.owners, emptyOwner(newId("owner"))] })
            }
            className="mb-4 rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white"
          >
            + Thêm chủ/người đại diện
          </button>
        ) : null}
        <div className="space-y-4">
          {draft.owners.map((owner, index) => {
            const organisation = isOrganisationOwner(owner.ownerType);
            const legacyOrganisation =
              organisation &&
              !owner.organisationName?.trim() &&
              !owner.organisationIdentityNumber?.trim();
            return (
              <article
                key={owner.id}
                className="rounded border border-gray-200 p-4 dark:border-gray-700"
              >
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <strong className="text-xs">Dòng chủ/người {index + 1}</strong>
                  {!readOnly ? (
                    <button
                      type="button"
                      onClick={() =>
                        onChange({
                          ...draft,
                          owners: draft.owners.filter((_, current) => current !== index),
                        })
                      }
                      className="text-xs text-red-700"
                    >
                      Xóa
                    </button>
                  ) : null}
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <Field label="M — Pháp nhân trên GCN">
                    <select
                      disabled={readOnly}
                      value={owner.ownerType}
                      onChange={(event) =>
                        updateOwnerType(index, event.target.value as Owner["ownerType"])
                      }
                      className={inputClass}
                    >
                      {OWNER_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {OWNER_TYPE_LABELS[type]}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="N — Vai trò pháp nhân trên GCN">
                    <Options
                      disabled={readOnly}
                      value={owner.roleOnCertificate}
                      options={CERTIFICATE_ROLE_OPTIONS}
                      onChange={(value) => updateOwner(index, "roleOnCertificate", value)}
                    />
                  </Field>
                  {organisation ? (
                    <>
                      <Field label="F — Tên tổ chức">
                        <input
                          disabled={readOnly}
                          value={
                            owner.organisationName || (legacyOrganisation ? owner.fullName : "")
                          }
                          onChange={(event) =>
                            updateOwner(index, "organisationName", event.target.value)
                          }
                          className={inputClass}
                        />
                      </Field>
                      <Field label="G — Số định danh tổ chức">
                        <input
                          disabled={readOnly}
                          value={
                            owner.organisationIdentityNumber ||
                            (legacyOrganisation ? owner.identityNumber : "")
                          }
                          onChange={(event) =>
                            updateOwner(index, "organisationIdentityNumber", event.target.value)
                          }
                          className={inputClass}
                        />
                      </Field>
                    </>
                  ) : null}
                  <Field
                    label={
                      organisation
                        ? "H — Họ tên người đại diện tổ chức"
                        : "H — Họ và tên chủ sử dụng"
                    }
                  >
                    <input
                      disabled={readOnly}
                      value={legacyOrganisation ? "" : owner.fullName}
                      onChange={(event) => updateOwner(index, "fullName", event.target.value)}
                      className={inputClass}
                    />
                  </Field>
                  <Field label="I — Ngày, tháng, năm sinh">
                    <input
                      disabled={readOnly}
                      value={owner.dateOfBirth}
                      onChange={(event) => updateOwner(index, "dateOfBirth", event.target.value)}
                      className={inputClass}
                    />
                  </Field>
                  <Field label="J — Giới tính">
                    <select
                      disabled={readOnly}
                      value={owner.gender}
                      onChange={(event) =>
                        updateOwner(index, "gender", event.target.value as Owner["gender"])
                      }
                      className={inputClass}
                    >
                      <option value="">-- Chọn --</option>
                      <option value="NAM">Nam</option>
                      <option value="NU">Nữ</option>
                    </select>
                  </Field>
                  <Field label="K — Số định danh cá nhân/CCCD">
                    <input
                      disabled={readOnly}
                      value={legacyOrganisation ? "" : owner.identityNumber}
                      onChange={(event) => updateOwner(index, "identityNumber", event.target.value)}
                      className={inputClass}
                    />
                  </Field>
                  <div className="md:col-span-2 xl:col-span-4">
                    <Field label="L — Địa chỉ thường trú">
                      <input
                        disabled={readOnly}
                        value={owner.residenceAddress}
                        onChange={(event) =>
                          updateOwner(index, "residenceAddress", event.target.value)
                        }
                        className={inputClass}
                      />
                    </Field>
                  </div>
                </div>

                <div className="mt-4 rounded bg-gray-50 p-3 dark:bg-gray-800/60">
                  <label className="flex items-center gap-2 text-xs font-semibold">
                    <input
                      type="checkbox"
                      disabled={readOnly}
                      checked={owner.hasDistinctCurrentUser}
                      onChange={(event) =>
                        updateOwner(index, "hasDistinctCurrentUser", event.target.checked)
                      }
                    />
                    Có người sử dụng đất hiện tại khác chủ sử dụng pháp lý
                  </label>
                  {owner.hasDistinctCurrentUser ? (
                    <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                      <Field label="O — Tên người sử dụng hiện tại">
                        <input
                          disabled={readOnly}
                          value={owner.currentUserName}
                          onChange={(event) =>
                            updateOwner(index, "currentUserName", event.target.value)
                          }
                          className={inputClass}
                        />
                      </Field>
                      <Field label="P — Số định danh cá nhân (CCCD)">
                        <input
                          disabled={readOnly}
                          value={owner.currentUserCitizenId}
                          onChange={(event) =>
                            updateOwner(index, "currentUserCitizenId", event.target.value)
                          }
                          className={inputClass}
                        />
                      </Field>
                      <Field label="Q — Địa chỉ thường trú (2 cấp)">
                        <input
                          disabled={readOnly}
                          value={owner.currentUserAddress}
                          onChange={(event) =>
                            updateOwner(index, "currentUserAddress", event.target.value)
                          }
                          className={inputClass}
                        />
                      </Field>
                      <Field label="R — Lý do thay đổi">
                        <Options
                          disabled={readOnly}
                          value={owner.changeReason}
                          options={CHANGE_REASON_OPTIONS}
                          onChange={(value) => updateOwner(index, "changeReason", value)}
                        />
                      </Field>
                    </div>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      </Section>

      <EditableParcelTable
        parcels={draft.parcels}
        readOnly={readOnly}
        onChange={updateParcels}
      />

      <Section
        title={`Tài sản gắn liền với đất — cột AO–AW (${draft.assets.length})`}
        description="Mỗi tài sản được gắn với một thửa; nếu có nhiều tài sản cùng thửa, PL3 giữ tất cả giá trị bằng dấu chấm phẩy theo từng cột."
      >
        {!readOnly ? (
          <button
            type="button"
            onClick={() =>
              onChange({
                ...draft,
                assets: [...draft.assets, emptyAsset(newId("asset"), draft.parcels[0]?.id ?? "")],
              })
            }
            className="mb-4 rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white"
          >
            + Thêm tài sản
          </button>
        ) : null}
        <div className="space-y-4">
          {draft.assets.map((asset, index) => (
            <article
              key={asset.id}
              className="rounded border border-gray-200 p-4 dark:border-gray-700"
            >
              <div className="mb-3 flex items-center justify-between">
                <strong className="text-xs">Tài sản {index + 1}</strong>
                {!readOnly ? (
                  <button
                    type="button"
                    onClick={() =>
                      onChange({
                        ...draft,
                        assets: draft.assets.filter((_, current) => current !== index),
                      })
                    }
                    className="text-xs text-red-700"
                  >
                    Xóa
                  </button>
                ) : null}
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                <Field label="Thửa đất liên quan">
                  <select
                    disabled={readOnly}
                    value={asset.parcelId ?? ""}
                    onChange={(event) => updateAsset(index, "parcelId", event.target.value)}
                    className={inputClass}
                  >
                    <option value="">-- Chọn thửa --</option>
                    {draft.parcels.map((parcel, parcelIndex) => (
                      <option key={parcel.id} value={parcel.id}>
                        Thửa {parcelIndex + 1} — {parcel.parcelNumber || "chưa có số"}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="AO — Loại tài sản gắn liền với đất">
                  <Options
                    disabled={readOnly}
                    value={asset.assetType}
                    options={ASSET_TYPE_OPTIONS}
                    onChange={(value) => updateAsset(index, "assetType", value)}
                  />
                </Field>
                <Field label="AP — Khu nhà chung cư, nhà hỗn hợp">
                  <input
                    disabled={readOnly}
                    value={asset.mixedUseBuildingName ?? ""}
                    onChange={(event) =>
                      updateAsset(index, "mixedUseBuildingName", event.target.value)
                    }
                    className={inputClass}
                  />
                </Field>
                <Field label="AQ — Nhà chung cư">
                  <input
                    disabled={readOnly}
                    value={asset.apartmentBuildingName ?? ""}
                    onChange={(event) =>
                      updateAsset(index, "apartmentBuildingName", event.target.value)
                    }
                    className={inputClass}
                  />
                </Field>
                <Field label="AR — Số căn hộ">
                  <input
                    disabled={readOnly}
                    value={asset.apartmentNumber ?? ""}
                    onChange={(event) => updateAsset(index, "apartmentNumber", event.target.value)}
                    className={inputClass}
                  />
                </Field>
                <Field label="AS — Diện tích xây dựng">
                  <input
                    disabled={readOnly}
                    value={asset.constructionArea ?? ""}
                    onChange={(event) => updateAsset(index, "constructionArea", event.target.value)}
                    className={inputClass}
                  />
                </Field>
                <Field label="AT — Diện tích sàn">
                  <input
                    disabled={readOnly}
                    value={asset.floorArea ?? ""}
                    onChange={(event) => updateAsset(index, "floorArea", event.target.value)}
                    className={inputClass}
                  />
                </Field>
                <Field label="AU — Hình thức sở hữu">
                  <input
                    disabled={readOnly}
                    value={asset.ownershipForm ?? ""}
                    onChange={(event) => updateAsset(index, "ownershipForm", event.target.value)}
                    className={inputClass}
                  />
                </Field>
                <Field label="AV — Thời hạn sở hữu">
                  <input
                    disabled={readOnly}
                    value={asset.ownershipTerm ?? ""}
                    onChange={(event) => updateAsset(index, "ownershipTerm", event.target.value)}
                    className={inputClass}
                  />
                </Field>
                <Field label="AW — Cấp hạng">
                  <input
                    disabled={readOnly}
                    value={asset.grade ?? ""}
                    onChange={(event) => updateAsset(index, "grade", event.target.value)}
                    className={inputClass}
                  />
                </Field>
                <div className="md:col-span-2 xl:col-span-3">
                  <Field label="Mô tả/ghi chú tài sản (nội bộ)">
                    <textarea
                      disabled={readOnly}
                      value={asset.description}
                      onChange={(event) => updateAsset(index, "description", event.target.value)}
                      className={inputClass}
                      rows={2}
                    />
                  </Field>
                </div>
              </div>
            </article>
          ))}
        </div>
      </Section>

      {!readOnly ? (
        <section className="sticky bottom-3 rounded-lg border border-blue-200 bg-white p-4 shadow-lg dark:border-blue-900 dark:bg-gray-900">
          {saveError ? (
            <div className="mb-2 text-xs font-medium text-red-600">{saveError}</div>
          ) : null}
          {saveSuccess ? (
            <div className="mb-2 text-xs font-medium text-green-600">
              Đã lưu bản làm việc. Tải lại hồ sơ sẽ dùng đúng dữ liệu vừa lưu.
            </div>
          ) : null}
          <div className="flex flex-wrap items-end justify-between gap-4">
            <Field label="Ghi chú thay đổi">
              <input
                value={changeNote}
                onChange={(event) => setChangeNote(event.target.value)}
                placeholder="Mô tả ngắn nội dung biên tập"
                className={`${inputClass} min-w-72`}
              />
            </Field>
            <button
              type="button"
              disabled={saving || !isDirty}
              onClick={handleSave}
              className="rounded bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving
                ? "Đang lưu..."
                : isDirty
                  ? "Lưu toàn bộ bản làm việc"
                  : "Đã lưu — không có thay đổi"}
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
