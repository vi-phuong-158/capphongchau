"use client";

import { useCallback, useMemo, useRef, useState } from "react";

import {
  ASSET_TYPE_OPTIONS,
  CERTIFICATE_ROLE_OPTIONS,
  LAND_ORIGIN_OPTIONS,
  LAND_PURPOSE_OPTIONS,
  LAND_USE_FORM_OPTIONS,
  LAND_USE_TERM_OPTIONS,
  NEIGHBORHOOD_HINTS,
  type ReferenceOption,
} from "@/modules/public-intake/reference";
import { lastSecretGroup } from "@/modules/public-intake/receipt-code";
import { uploadWithResume, UploadCancelledError } from "@/modules/public-intake/resumable-upload";
import {
  OWNER_TYPES,
  OWNER_TYPE_LABELS,
  emptyAsset,
  emptyDraft,
  emptyLandUse,
  emptyOwner,
  emptyParcel,
  requiresCitizenId,
  type IntakeDraft,
  type OwnerType,
} from "@/modules/public-intake/types";

const STEPS = [
  "Thông báo và liên hệ",
  "Thông tin GCN",
  "Chủ sử dụng",
  "Thửa đất",
  "Loại đất",
  "Tài sản",
  "Tải giấy tờ",
  "Kiểm tra và gửi",
] as const;

const MAX_CERTIFICATE_PHOTOS = 10;
const CREATE_IDEMPOTENCY_STORAGE_KEY = "pc_kk_create_idempotency";

type Errors = Record<string, string>;

type SaveStatus = "IDLE" | "SAVING" | "SAVED" | "FAILED" | "OFFLINE";

const SAVE_STATUS_LABELS: Record<SaveStatus, string> = {
  IDLE: "",
  SAVING: "Đang lưu…",
  SAVED: "Đã lưu",
  FAILED: "Chưa thể lưu",
  OFFLINE: "Mất kết nối",
};

function newId(): string {
  return crypto.randomUUID();
}

interface ApiErrorBody {
  error?: { message?: string };
}

async function readErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as ApiErrorBody;
    return body.error?.message ?? fallback;
  } catch {
    return fallback;
  }
}

/** Mọi lệnh gọi API đều có timeout: mạng yếu không được phép làm giao diện đứng im vô hạn. */
const API_TIMEOUT_MS = 20_000;
const CREATE_API_TIMEOUT_MS = 35_000;

async function fetchApi(
  url: string,
  init: RequestInit,
  timeoutMs = API_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function Field({
  label,
  hint,
  error,
  required,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="pc-field-label">
        {label}
        {required ? <span style={{ color: "var(--danger)" }}> *</span> : null}
      </label>
      {children}
      {hint ? <p className="pc-field-hint">{hint}</p> : null}
      {error ? <p className="pc-field-error">{error}</p> : null}
    </div>
  );
}

function Select({
  value,
  onChange,
  options,
  placeholder,
  invalid,
}: {
  value: string;
  onChange: (value: string) => void;
  options: readonly ReferenceOption[];
  placeholder: string;
  invalid?: boolean;
}) {
  return (
    <select
      className="pc-select"
      value={value}
      aria-invalid={invalid ? "true" : undefined}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">{placeholder}</option>
      {options.map((option) => (
        <option key={option.code} value={option.code}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function RepeatableHeading({
  title,
  onRemove,
  removeLabel,
}: {
  title: string;
  onRemove?: () => void;
  removeLabel: string;
}) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h3 className="text-base font-semibold">{title}</h3>
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          className="text-sm font-semibold underline"
          style={{ color: "var(--danger)" }}
        >
          {removeLabel}
        </button>
      ) : null}
    </div>
  );
}

export function IntakeWizard() {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<IntakeDraft>(() => emptyDraft(newId(), newId(), newId()));
  const [errors, setErrors] = useState<Errors>({});

  const [certificateCount, setCertificateCount] = useState("");
  const [hasCertificate, setHasCertificate] = useState("");

  const [receipt, setReceipt] = useState<{ code: string; secret: string } | null>(null);
  const [secretEcho, setSecretEcho] = useState("");
  const [secretConfirmed, setSecretConfirmed] = useState(false);

  const [citizenIdPhoto, setCitizenIdPhoto] = useState<File | null>(null);
  const [certificatePhotos, setCertificatePhotos] = useState<File[]>([]);
  const [submitted, setSubmitted] = useState(false);

  const [csrfToken, setCsrfToken] = useState("");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("IDLE");
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState("");
  const [uploadNote, setUploadNote] = useState("");
  const [uploadPercent, setUploadPercent] = useState(0);
  const uploadAbort = useRef<AbortController | null>(null);
  const createIdempotencyKey = useRef<string | null>(null);

  const outOfScope = hasCertificate === "KHONG" || certificateCount === "NHIEU";

  const update = useCallback((mutate: (next: IntakeDraft) => void) => {
    setDraft((current) => {
      const next = structuredClone(current);
      mutate(next);
      return next;
    });
  }, []);

  const validate = useCallback((): Errors => {
    const found: Errors = {};

    if (step === 0) {
      if (!hasCertificate) found.hasCertificate = "Chọn một phương án.";
      if (!certificateCount) found.certificateCount = "Chọn một phương án.";
      if (!/^0\d{9}$/.test(draft.phone)) found.phone = "Nhập số điện thoại 10 số, bắt đầu bằng 0.";
      if (!draft.consentAccepted) found.consent = "Cần đồng ý để tiếp tục.";
    }

    if (step === 1) {
      if (!draft.certificate.issueNumber.trim()) found.issueNumber = "Bắt buộc theo Phụ lục 8.";
      if (!draft.certificate.issueDate) found.issueDate = "Bắt buộc theo Phụ lục 8.";
      if (!draft.certificate.registryNumber.trim())
        found.registryNumber = "Bắt buộc theo Phụ lục 8.";
    }

    if (step === 2) {
      draft.owners.forEach((owner, index) => {
        if (!owner.fullName.trim()) found[`owner-${index}-name`] = "Bắt buộc theo Phụ lục 8.";
        if (!owner.roleOnCertificate) found[`owner-${index}-role`] = "Bắt buộc theo Phụ lục 8.";
        if (requiresCitizenId(owner.ownerType) && !/^\d{12}$/.test(owner.identityNumber)) {
          found[`owner-${index}-id`] = "CCCD gồm đúng 12 chữ số.";
        }
      });
    }

    if (step === 3) {
      draft.parcels.forEach((parcel, index) => {
        if (!parcel.addressOnCertificate.trim())
          found[`parcel-${index}-address`] = "Bắt buộc theo Phụ lục 8.";
        if (!parcel.area.trim() || Number(parcel.area) <= 0)
          found[`parcel-${index}-area`] = "Nhập diện tích lớn hơn 0.";
      });
    }

    if (step === 4) {
      draft.parcels.forEach((parcel, parcelIndex) => {
        parcel.landUses.forEach((landUse, useIndex) => {
          const key = `use-${parcelIndex}-${useIndex}`;
          if (!landUse.purposeCode) found[`${key}-purpose`] = "Bắt buộc theo Phụ lục 8.";
          if (!landUse.originCode) found[`${key}-origin`] = "Bắt buộc theo Phụ lục 8.";
          if (!landUse.formCode) found[`${key}-form`] = "Bắt buộc theo Phụ lục 8.";
          if (!landUse.termCode) found[`${key}-term`] = "Bắt buộc theo Phụ lục 8.";
        });

        const declared = parcel.landUses
          .map((landUse) => Number(landUse.area))
          .filter((value) => Number.isFinite(value) && value > 0);
        const parcelArea = Number(parcel.area);
        if (declared.length > 0 && Number.isFinite(parcelArea) && parcelArea > 0) {
          const total = declared.reduce((sum, value) => sum + value, 0);
          if (total > parcelArea) {
            found[`parcel-${parcelIndex}-usearea`] =
              `Tổng diện tích theo mục đích (${total} m²) vượt diện tích thửa (${parcelArea} m²).`;
          }
        }
      });
    }

    if (step === 6) {
      if (!secretConfirmed) found.secretEcho = "Cần xác nhận đã lưu mã bí mật trước khi tải ảnh.";
      if (!citizenIdPhoto) found.citizenIdPhoto = "Cần đúng một ảnh CCCD mặt trước.";
      if (certificatePhotos.length < 1) found.certificatePhotos = "Cần ít nhất một ảnh GCN.";
    }

    return found;
  }, [
    step,
    draft,
    hasCertificate,
    certificateCount,
    secretConfirmed,
    citizenIdPhoto,
    certificatePhotos,
  ]);

  /** Lưu nháp lên server. Chỉ gọi khi chuyển bước để giữ số lần ghi Sheets ở mức thấp. */
  const saveDraft = useCallback(async (): Promise<boolean> => {
    if (!csrfToken) {
      return true;
    }

    setSaveStatus("SAVING");
    try {
      const response = await fetchApi("/api/public/submissions/current", {
        method: "PATCH",
        headers: { "content-type": "application/json", "x-public-csrf-token": csrfToken },
        body: JSON.stringify({ draft }),
      });

      if (!response.ok) {
        setSaveStatus("FAILED");
        setServerError(await readErrorMessage(response, "Chưa lưu được. Thử lại sau ít phút."));
        return false;
      }

      setSaveStatus("SAVED");
      setServerError("");
      return true;
    } catch {
      setSaveStatus("OFFLINE");
      setServerError("Mất kết nối. Dữ liệu bạn nhập vẫn còn trên màn hình, đừng đóng trang.");
      return false;
    }
  }, [csrfToken, draft]);

  const goNext = useCallback(async () => {
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) {
      return;
    }

    setBusy(true);
    setServerError("");
    try {
      // Bước 0 tạo bản kê khai thật: sinh mã, tạo thư mục Drive, ghi dòng PUBLIC_SUBMISSIONS.
      if (step === 0 && !receipt) {
        if (!createIdempotencyKey.current) {
          try {
            createIdempotencyKey.current = sessionStorage.getItem(CREATE_IDEMPOTENCY_STORAGE_KEY);
          } catch {
            // Trình duyệt có thể chặn sessionStorage; ref trong bộ nhớ vẫn đủ cho retry cùng trang.
          }
        }
        if (!createIdempotencyKey.current) {
          createIdempotencyKey.current = crypto.randomUUID();
          try {
            sessionStorage.setItem(CREATE_IDEMPOTENCY_STORAGE_KEY, createIdempotencyKey.current);
          } catch {
            // Không làm hỏng kê khai chỉ vì storage riêng tư bị chặn.
          }
        }

        let response: Response | null = null;
        for (let attempt = 0; attempt < 2; attempt += 1) {
          try {
            response = await fetchApi(
              "/api/public/submissions",
              {
                method: "POST",
                headers: {
                  "content-type": "application/json",
                  "idempotency-key": createIdempotencyKey.current,
                },
                body: JSON.stringify({ phone: draft.phone }),
              },
              CREATE_API_TIMEOUT_MS,
            );
          } catch {
            if (attempt === 0) continue;
            throw new Error("CREATE_NETWORK_FAILED");
          }

          // 5xx có thể là proxy mất response sau khi backend đã ghi. Retry cùng key sẽ lấy lại
          // đúng kết quả cũ, không tạo thêm dòng Sheets/thư mục Drive.
          if (response.ok || response.status < 500 || attempt === 1) break;
        }

        if (!response) {
          throw new Error("CREATE_NETWORK_FAILED");
        }

        if (!response.ok) {
          if (response.status === 409) {
            createIdempotencyKey.current = null;
            try {
              sessionStorage.removeItem(CREATE_IDEMPOTENCY_STORAGE_KEY);
            } catch {
              // Không có gì cần làm nếu storage bị chặn.
            }
          }
          setServerError(await readErrorMessage(response, "Chưa tạo được bản kê khai."));
          return;
        }

        const created = (await response.json()) as {
          receiptCode: string;
          accessSecret: string;
          csrfToken: string;
        };
        setReceipt({ code: created.receiptCode, secret: created.accessSecret });
        setCsrfToken(created.csrfToken);
        createIdempotencyKey.current = null;
        try {
          sessionStorage.removeItem(CREATE_IDEMPOTENCY_STORAGE_KEY);
        } catch {
          // Không có gì cần làm nếu storage bị chặn.
        }
      } else if (!(await saveDraft())) {
        return;
      }

      setStep((current) => Math.min(current + 1, STEPS.length - 1));
    } catch {
      setServerError(
        "Kết nối bị gián đoạn khi tạo bản kê khai. Dữ liệu đã nhập vẫn còn; bấm Tiếp tục để khôi phục và thử lại.",
      );
    } finally {
      setBusy(false);
    }
  }, [validate, step, receipt, draft.phone, saveDraft]);

  /** Trình duyệt tải thẳng lên Drive qua phiên resumable; ảnh không đi qua server của app. */
  const uploadFile = useCallback(
    async (file: File, documentType: "CITIZEN_ID_FRONT" | "CERTIFICATE"): Promise<boolean> => {
      const initiate = await fetchApi("/api/public/submissions/current/uploads/initiate", {
        method: "POST",
        headers: { "content-type": "application/json", "x-public-csrf-token": csrfToken },
        body: JSON.stringify({
          documentType,
          fileName: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
        }),
      });

      if (!initiate.ok) {
        setServerError(await readErrorMessage(initiate, "Không tạo được phiên tải lên."));
        return false;
      }

      const { uploadUrl } = (await initiate.json()) as { uploadUrl: string };

      let id: string;
      try {
        id = await uploadWithResume({
          uploadUrl,
          file,
          contentType: file.type,
          signal: uploadAbort.current?.signal,
          onProgress: (sent, total) => {
            setUploadPercent(total > 0 ? Math.round((sent / total) * 100) : 0);
          },
        });
      } catch (error) {
        if (error instanceof UploadCancelledError) {
          setServerError("Đã hủy tải ảnh. Bạn có thể chọn lại tệp để thử lần nữa.");
        } else {
          setServerError(
            error instanceof Error
              ? `${error.message} Kiểm tra mạng rồi chọn lại tệp để thử lại.`
              : "Tải ảnh lên thất bại.",
          );
        }
        return false;
      }

      const complete = await fetchApi("/api/public/submissions/current/uploads/complete", {
        method: "POST",
        headers: { "content-type": "application/json", "x-public-csrf-token": csrfToken },
        body: JSON.stringify({ driveFileId: id, documentType }),
      });

      if (!complete.ok) {
        setServerError(await readErrorMessage(complete, "Ảnh tải lên không hợp lệ."));
        return false;
      }

      return true;
    },
    [csrfToken],
  );

  /** Người dân luôn thoát được khỏi trạng thái đang tải, kể cả khi mạng không phản hồi. */
  const cancelUpload = useCallback(() => {
    uploadAbort.current?.abort();
  }, []);

  const handleCitizenIdUpload = useCallback(
    async (file: File | null) => {
      if (!file) return;
      uploadAbort.current = new AbortController();
      setBusy(true);
      setServerError("");
      setUploadPercent(0);
      setUploadNote("Đang tải ảnh CCCD…");
      try {
        if (await uploadFile(file, "CITIZEN_ID_FRONT")) {
          setCitizenIdPhoto(file);
          setUploadNote("Đã tải ảnh CCCD lên hệ thống.");
        } else {
          setUploadNote("");
        }
      } finally {
        setBusy(false);
        setUploadPercent(0);
        uploadAbort.current = null;
      }
    },
    [uploadFile],
  );

  const handleCertificateUpload = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      uploadAbort.current = new AbortController();
      setBusy(true);
      setServerError("");
      const accepted: File[] = [];
      try {
        for (const [index, file] of files.entries()) {
          setUploadPercent(0);
          setUploadNote(`Đang tải ảnh GCN ${index + 1}/${files.length}…`);
          if (!(await uploadFile(file, "CERTIFICATE"))) {
            break;
          }
          accepted.push(file);
        }
        setCertificatePhotos((current) => [...current, ...accepted]);
        setUploadNote(accepted.length > 0 ? `Đã tải ${accepted.length} ảnh GCN.` : "");
      } finally {
        setBusy(false);
        setUploadPercent(0);
        uploadAbort.current = null;
      }
    },
    [uploadFile],
  );

  const handleSubmit = useCallback(async () => {
    setBusy(true);
    setServerError("");
    try {
      const response = await fetchApi("/api/public/submissions/current/submit", {
        method: "POST",
        headers: { "content-type": "application/json", "x-public-csrf-token": csrfToken },
        body: JSON.stringify({ draft }),
      });

      if (!response.ok) {
        setServerError(await readErrorMessage(response, "Chưa gửi được bản kê khai."));
        return;
      }

      setSubmitted(true);
    } finally {
      setBusy(false);
    }
  }, [csrfToken, draft]);

  const goBack = useCallback(() => {
    setErrors({});
    setStep((current) => Math.max(current - 1, 0));
  }, []);

  const confirmSecret = useCallback(() => {
    if (!receipt) return;
    const expected = lastSecretGroup(receipt.secret);
    if (secretEcho.trim().toUpperCase() === expected) {
      setSecretConfirmed(true);
      setErrors((current) => ({ ...current, secretEcho: "" }));
    } else {
      setErrors((current) => ({ ...current, secretEcho: "Nhóm ký tự chưa khớp. Kiểm tra lại." }));
    }
  }, [receipt, secretEcho]);

  const totalLandUses = useMemo(
    () => draft.parcels.reduce((sum, parcel) => sum + parcel.landUses.length, 0),
    [draft.parcels],
  );

  if (submitted && receipt) {
    return (
      <div className="pc-card pc-step-panel space-y-4">
        <h2 className="text-2xl font-bold">Đã gửi bản kê khai (demo)</h2>
        <p>
          Mã tiếp nhận của bạn là <strong>{receipt.code}</strong>. Cán bộ sẽ gọi điện tới số{" "}
          <strong>{draft.phone}</strong> nếu hồ sơ cần bổ sung.
        </p>
        <p style={{ color: "var(--muted)" }}>
          Dữ liệu và ảnh giấy tờ đã được lưu vào kho của UBND phường. Giữ mã tiếp nhận và mã bí mật
          để tra cứu trạng thái.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <nav aria-label="Tiến độ" className="pc-card">
        <p className="text-sm font-semibold" style={{ color: "var(--muted)" }}>
          Bước {step + 1}/{STEPS.length}
        </p>
        <p className="mt-1 text-lg font-bold">{STEPS[step]}</p>
        <ol
          className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm"
          style={{ color: "var(--muted)" }}
        >
          {STEPS.map((title, index) => (
            <li
              key={title}
              style={{
                fontWeight: index === step ? 700 : 400,
                color: index === step ? "var(--accent)" : undefined,
              }}
            >
              {index + 1}. {title}
            </li>
          ))}
        </ol>
      </nav>

      {receipt ? (
        <div className="pc-card" style={{ borderColor: "var(--accent)" }}>
          <p className="text-sm font-semibold" style={{ color: "var(--muted)" }}>
            Mã tiếp nhận
          </p>
          <p className="text-xl font-bold tracking-wider">{receipt.code}</p>
          <p className="mt-3 text-sm font-semibold" style={{ color: "var(--muted)" }}>
            Mã bí mật — chỉ hiển thị một lần
          </p>
          <p className="text-xl font-bold tracking-wider">{receipt.secret}</p>
          <p className="pc-field-hint">
            Chụp màn hình hoặc ghi lại ngay. Mất mã thì phải mang giấy tờ đến UBND phường, không có
            cách khôi phục trực tuyến.
          </p>
        </div>
      ) : null}

      <section className="pc-card pc-step-panel space-y-5">
        {step === 0 ? (
          <>
            <Field
              label="Thửa đất của bạn đã có Giấy chứng nhận (sổ đỏ/sổ hồng) chưa?"
              required
              error={errors.hasCertificate}
            >
              <Select
                value={hasCertificate}
                onChange={setHasCertificate}
                invalid={Boolean(errors.hasCertificate)}
                placeholder="— Chọn —"
                options={[
                  { code: "CO", label: "Đã có Giấy chứng nhận" },
                  { code: "KHONG", label: "Chưa có Giấy chứng nhận" },
                ]}
              />
            </Field>

            <Field
              label="Lần kê khai này gồm mấy Giấy chứng nhận?"
              required
              error={errors.certificateCount}
              hint="Mỗi lần kê khai chỉ dùng cho một Giấy chứng nhận."
            >
              <Select
                value={certificateCount}
                onChange={setCertificateCount}
                invalid={Boolean(errors.certificateCount)}
                placeholder="— Chọn —"
                options={[
                  { code: "MOT", label: "Một Giấy chứng nhận" },
                  { code: "NHIEU", label: "Từ hai Giấy chứng nhận trở lên" },
                ]}
              />
            </Field>

            {outOfScope ? (
              <div
                className="pc-card"
                style={{
                  background: "var(--warning-surface)",
                  borderColor: "var(--warning-border)",
                }}
              >
                <p className="font-semibold">Trường hợp của bạn cần làm trực tiếp</p>
                <p className="mt-2">
                  Cổng kê khai trực tuyến hiện chỉ phục vụ trường hợp đã có một Giấy chứng nhận. Đề
                  nghị mang giấy tờ đến Bộ phận một cửa UBND phường Phong Châu để được hướng dẫn.
                </p>
              </div>
            ) : null}

            <Field
              label="Số điện thoại liên hệ"
              required
              error={errors.phone}
              hint="Cán bộ sẽ gọi vào số này nếu hồ sơ cần bổ sung. Hệ thống không gửi tin nhắn tự động."
            >
              <input
                className="pc-input"
                inputMode="numeric"
                value={draft.phone}
                aria-invalid={errors.phone ? "true" : undefined}
                onChange={(event) =>
                  update((next) => {
                    next.phone = event.target.value.replace(/\D/g, "").slice(0, 10);
                  })
                }
              />
            </Field>

            <div>
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1.5 h-5 w-5"
                  checked={draft.consentAccepted}
                  onChange={(event) =>
                    update((next) => {
                      next.consentAccepted = event.target.checked;
                    })
                  }
                />
                <span>
                  Tôi đồng ý cung cấp thông tin và ảnh giấy tờ để phục vụ kê khai, đăng ký đất đai
                  trong đợt cao điểm 180 ngày.
                </span>
              </label>
              {errors.consent ? <p className="pc-field-error">{errors.consent}</p> : null}
              <p className="pc-field-hint">
                Nội dung thông báo bảo vệ dữ liệu cá nhân và thời hạn lưu trữ sẽ được bổ sung nguyên
                văn trước khi vận hành thật.
              </p>
            </div>
          </>
        ) : null}

        {step === 1 ? (
          <>
            <Field label="Số phát hành GCN" required error={errors.issueNumber}>
              <input
                className="pc-input"
                value={draft.certificate.issueNumber}
                aria-invalid={errors.issueNumber ? "true" : undefined}
                onChange={(event) =>
                  update((next) => {
                    next.certificate.issueNumber = event.target.value;
                  })
                }
              />
            </Field>
            <Field label="Ngày cấp GCN" required error={errors.issueDate}>
              <input
                className="pc-input"
                type="date"
                value={draft.certificate.issueDate}
                aria-invalid={errors.issueDate ? "true" : undefined}
                onChange={(event) =>
                  update((next) => {
                    next.certificate.issueDate = event.target.value;
                  })
                }
              />
            </Field>
            <Field label="Số vào sổ GCN" required error={errors.registryNumber}>
              <input
                className="pc-input"
                value={draft.certificate.registryNumber}
                aria-invalid={errors.registryNumber ? "true" : undefined}
                onChange={(event) =>
                  update((next) => {
                    next.certificate.registryNumber = event.target.value;
                  })
                }
              />
            </Field>
          </>
        ) : null}

        {step === 2 ? (
          <>
            {draft.owners.map((owner, index) => (
              <div key={owner.id} className="pc-card">
                <RepeatableHeading
                  title={`Chủ sử dụng ${index + 1}`}
                  removeLabel="Xóa"
                  onRemove={
                    draft.owners.length > 1
                      ? () =>
                          update((next) => {
                            next.owners.splice(index, 1);
                          })
                      : undefined
                  }
                />
                <div className="space-y-4">
                  <Field label="Loại chủ thể" required>
                    <Select
                      value={owner.ownerType}
                      onChange={(value) =>
                        update((next) => {
                          next.owners[index].ownerType = value as OwnerType;
                        })
                      }
                      placeholder="— Chọn —"
                      options={OWNER_TYPES.map((type) => ({
                        code: type,
                        label: OWNER_TYPE_LABELS[type],
                      }))}
                    />
                  </Field>
                  <Field
                    label={owner.ownerType === "TO_CHUC" ? "Tên tổ chức" : "Họ và tên"}
                    required
                    error={errors[`owner-${index}-name`]}
                  >
                    <input
                      className="pc-input"
                      value={owner.fullName}
                      aria-invalid={errors[`owner-${index}-name`] ? "true" : undefined}
                      onChange={(event) =>
                        update((next) => {
                          next.owners[index].fullName = event.target.value;
                        })
                      }
                    />
                  </Field>
                  <Field
                    label={
                      requiresCitizenId(owner.ownerType)
                        ? "Số định danh cá nhân (CCCD)"
                        : "Số định danh tổ chức / CCCD người đại diện"
                    }
                    required={requiresCitizenId(owner.ownerType)}
                    error={errors[`owner-${index}-id`]}
                    hint={
                      requiresCitizenId(owner.ownerType)
                        ? "Gồm đúng 12 chữ số."
                        : "Có thể để trống."
                    }
                  >
                    <input
                      className="pc-input"
                      inputMode="numeric"
                      value={owner.identityNumber}
                      aria-invalid={errors[`owner-${index}-id`] ? "true" : undefined}
                      onChange={(event) =>
                        update((next) => {
                          next.owners[index].identityNumber = event.target.value.trim();
                        })
                      }
                    />
                  </Field>
                  <Field
                    label="Vai trò trên GCN"
                    required
                    error={errors[`owner-${index}-role`]}
                    hint="Ghi theo phần người sử dụng đất in trên bìa Giấy chứng nhận."
                  >
                    <Select
                      value={owner.roleOnCertificate}
                      onChange={(value) =>
                        update((next) => {
                          next.owners[index].roleOnCertificate = value;
                        })
                      }
                      invalid={Boolean(errors[`owner-${index}-role`])}
                      placeholder="— Chọn —"
                      options={CERTIFICATE_ROLE_OPTIONS}
                    />
                  </Field>
                </div>
              </div>
            ))}
            <button
              type="button"
              className="pc-button-quiet"
              onClick={() =>
                update((next) => {
                  next.owners.push(emptyOwner(newId()));
                })
              }
            >
              + Thêm chủ sử dụng
            </button>
          </>
        ) : null}

        {step === 3 ? (
          <>
            {draft.parcels.map((parcel, index) => (
              <div key={parcel.id} className="pc-card">
                <RepeatableHeading
                  title={`Thửa đất ${index + 1}`}
                  removeLabel="Xóa"
                  onRemove={
                    draft.parcels.length > 1
                      ? () =>
                          update((next) => {
                            next.parcels.splice(index, 1);
                          })
                      : undefined
                  }
                />
                <div className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Số tờ bản đồ" hint="Để trống nếu GCN không ghi.">
                      <input
                        className="pc-input"
                        value={parcel.mapSheetNumber}
                        onChange={(event) =>
                          update((next) => {
                            next.parcels[index].mapSheetNumber = event.target.value;
                          })
                        }
                      />
                    </Field>
                    <Field label="Số thứ tự thửa" hint="Để trống nếu GCN không ghi.">
                      <input
                        className="pc-input"
                        value={parcel.parcelNumber}
                        onChange={(event) =>
                          update((next) => {
                            next.parcels[index].parcelNumber = event.target.value;
                          })
                        }
                      />
                    </Field>
                  </div>
                  <Field
                    label="Mã định danh thửa đất"
                    hint="Nếu bạn không có mã này, để trống — cán bộ sẽ bổ sung."
                  >
                    <input
                      className="pc-input"
                      value={parcel.parcelIdCode}
                      onChange={(event) =>
                        update((next) => {
                          next.parcels[index].parcelIdCode = event.target.value;
                        })
                      }
                    />
                  </Field>
                  <Field
                    label="Địa chỉ thửa đất ghi trên GCN"
                    required
                    error={errors[`parcel-${index}-address`]}
                    hint="Chép đúng như in trên bìa, kể cả khi là tên xã/huyện cũ."
                  >
                    <textarea
                      className="pc-textarea"
                      value={parcel.addressOnCertificate}
                      aria-invalid={errors[`parcel-${index}-address`] ? "true" : undefined}
                      onChange={(event) =>
                        update((next) => {
                          next.parcels[index].addressOnCertificate = event.target.value;
                        })
                      }
                    />
                  </Field>
                  <Field
                    label="Tổ dân phố hiện nay"
                    hint="Không bắt buộc. Nếu không chắc, để trống — cán bộ sẽ xác định khi duyệt."
                  >
                    <Select
                      value={parcel.addressTwoLevel}
                      onChange={(value) =>
                        update((next) => {
                          next.parcels[index].addressTwoLevel = value;
                        })
                      }
                      placeholder="— Chưa rõ —"
                      options={NEIGHBORHOOD_HINTS.map((name) => ({ code: name, label: name }))}
                    />
                  </Field>
                  <Field
                    label="Diện tích thửa đất (m²)"
                    required
                    error={errors[`parcel-${index}-area`]}
                  >
                    <input
                      className="pc-input"
                      inputMode="decimal"
                      value={parcel.area}
                      aria-invalid={errors[`parcel-${index}-area`] ? "true" : undefined}
                      onChange={(event) =>
                        update((next) => {
                          next.parcels[index].area = event.target.value;
                        })
                      }
                    />
                  </Field>
                </div>
              </div>
            ))}
            <button
              type="button"
              className="pc-button-quiet"
              onClick={() =>
                update((next) => {
                  next.parcels.push(emptyParcel(newId(), newId()));
                })
              }
            >
              + Thêm thửa đất
            </button>
          </>
        ) : null}

        {step === 4 ? (
          <>
            <div
              className="pc-card"
              style={{ background: "var(--warning-surface)", borderColor: "var(--warning-border)" }}
            >
              <p className="text-sm">
                Bốn thông tin dưới đây in ở mặt trong Giấy chứng nhận, phần &ldquo;Thửa đất&rdquo;.
                Nếu không chắc, cứ chọn theo bìa — cán bộ sẽ kiểm tra lại khi duyệt.
              </p>
            </div>
            {draft.parcels.map((parcel, parcelIndex) => (
              <div key={parcel.id} className="pc-card">
                <h3 className="mb-4 text-base font-semibold">
                  Thửa {parcelIndex + 1}
                  {parcel.parcelNumber ? ` — số thửa ${parcel.parcelNumber}` : ""}
                </h3>
                <div className="space-y-5">
                  {parcel.landUses.map((landUse, useIndex) => {
                    const key = `use-${parcelIndex}-${useIndex}`;
                    return (
                      <div
                        key={landUse.id}
                        className="space-y-4 border-t pt-4 first:border-t-0 first:pt-0"
                        style={{ borderColor: "var(--border)" }}
                      >
                        <RepeatableHeading
                          title={`Mục đích sử dụng ${useIndex + 1}`}
                          removeLabel="Xóa"
                          onRemove={
                            parcel.landUses.length > 1
                              ? () =>
                                  update((next) => {
                                    next.parcels[parcelIndex].landUses.splice(useIndex, 1);
                                  })
                              : undefined
                          }
                        />
                        <Field label="Loại đất" required error={errors[`${key}-purpose`]}>
                          <Select
                            value={landUse.purposeCode}
                            onChange={(value) =>
                              update((next) => {
                                next.parcels[parcelIndex].landUses[useIndex].purposeCode = value;
                              })
                            }
                            invalid={Boolean(errors[`${key}-purpose`])}
                            placeholder="— Chọn —"
                            options={LAND_PURPOSE_OPTIONS}
                          />
                        </Field>
                        <Field label="Nguồn gốc sử dụng" required error={errors[`${key}-origin`]}>
                          <Select
                            value={landUse.originCode}
                            onChange={(value) =>
                              update((next) => {
                                next.parcels[parcelIndex].landUses[useIndex].originCode = value;
                              })
                            }
                            invalid={Boolean(errors[`${key}-origin`])}
                            placeholder="— Chọn —"
                            options={LAND_ORIGIN_OPTIONS}
                          />
                        </Field>
                        <Field label="Hình thức sử dụng" required error={errors[`${key}-form`]}>
                          <Select
                            value={landUse.formCode}
                            onChange={(value) =>
                              update((next) => {
                                next.parcels[parcelIndex].landUses[useIndex].formCode = value;
                              })
                            }
                            invalid={Boolean(errors[`${key}-form`])}
                            placeholder="— Chọn —"
                            options={LAND_USE_FORM_OPTIONS}
                          />
                        </Field>
                        <Field label="Thời hạn sử dụng" required error={errors[`${key}-term`]}>
                          <Select
                            value={landUse.termCode}
                            onChange={(value) =>
                              update((next) => {
                                next.parcels[parcelIndex].landUses[useIndex].termCode = value;
                              })
                            }
                            invalid={Boolean(errors[`${key}-term`])}
                            placeholder="— Chọn —"
                            options={LAND_USE_TERM_OPTIONS}
                          />
                        </Field>
                        <Field
                          label="Diện tích theo mục đích này (m²)"
                          hint="Không bắt buộc. Chỉ nhập khi GCN tách riêng diện tích từng loại đất."
                        >
                          <input
                            className="pc-input"
                            inputMode="decimal"
                            value={landUse.area}
                            onChange={(event) =>
                              update((next) => {
                                next.parcels[parcelIndex].landUses[useIndex].area =
                                  event.target.value;
                              })
                            }
                          />
                        </Field>
                      </div>
                    );
                  })}
                  {errors[`parcel-${parcelIndex}-usearea`] ? (
                    <p className="pc-field-error">{errors[`parcel-${parcelIndex}-usearea`]}</p>
                  ) : null}
                  <button
                    type="button"
                    className="pc-button-quiet"
                    onClick={() =>
                      update((next) => {
                        next.parcels[parcelIndex].landUses.push(emptyLandUse(newId()));
                      })
                    }
                  >
                    + Thêm mục đích sử dụng
                  </button>
                </div>
              </div>
            ))}
          </>
        ) : null}

        {step === 5 ? (
          <>
            <p style={{ color: "var(--muted)" }}>
              Chỉ khai nếu Giấy chứng nhận có ghi tài sản gắn liền với đất (nhà ở, công trình, cây
              lâu năm...). Không có thì bỏ qua bước này.
            </p>
            {draft.assets.map((asset, index) => (
              <div key={asset.id} className="pc-card">
                <RepeatableHeading
                  title={`Tài sản ${index + 1}`}
                  removeLabel="Xóa"
                  onRemove={() =>
                    update((next) => {
                      next.assets.splice(index, 1);
                    })
                  }
                />
                <div className="space-y-4">
                  <Field label="Loại tài sản">
                    <Select
                      value={asset.assetType}
                      onChange={(value) =>
                        update((next) => {
                          next.assets[index].assetType = value;
                        })
                      }
                      placeholder="— Chọn —"
                      options={ASSET_TYPE_OPTIONS}
                    />
                  </Field>
                  <Field label="Mô tả theo GCN">
                    <textarea
                      className="pc-textarea"
                      value={asset.description}
                      onChange={(event) =>
                        update((next) => {
                          next.assets[index].description = event.target.value;
                        })
                      }
                    />
                  </Field>
                </div>
              </div>
            ))}
            <button
              type="button"
              className="pc-button-quiet"
              onClick={() =>
                update((next) => {
                  next.assets.push(emptyAsset(newId()));
                })
              }
            >
              + Thêm tài sản
            </button>
          </>
        ) : null}

        {step === 6 ? (
          <>
            {!secretConfirmed ? (
              <div className="pc-card" style={{ borderColor: "var(--accent)" }}>
                <p className="font-semibold">Xác nhận bạn đã lưu mã bí mật</p>
                <p className="pc-field-hint mb-4">
                  Nhập lại <strong>nhóm 4 ký tự cuối cùng</strong> của mã bí mật ở trên. Chưa xác
                  nhận thì chưa tải ảnh được.
                </p>
                <div className="flex flex-wrap items-start gap-3">
                  <input
                    className="pc-input"
                    style={{ maxWidth: "180px" }}
                    value={secretEcho}
                    aria-invalid={errors.secretEcho ? "true" : undefined}
                    onChange={(event) => setSecretEcho(event.target.value.toUpperCase())}
                  />
                  <button type="button" className="pc-button" onClick={confirmSecret}>
                    Xác nhận
                  </button>
                </div>
                {errors.secretEcho ? <p className="pc-field-error">{errors.secretEcho}</p> : null}
              </div>
            ) : (
              <>
                <Field
                  label="Ảnh CCCD mặt trước"
                  required
                  error={errors.citizenIdPhoto}
                  hint="Đúng một ảnh. Không thu ảnh mặt sau."
                >
                  <input
                    className="pc-input"
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                    disabled={busy || Boolean(citizenIdPhoto)}
                    onChange={(event) => {
                      void handleCitizenIdUpload(event.target.files?.[0] ?? null);
                    }}
                  />
                </Field>
                {citizenIdPhoto ? (
                  <p className="pc-field-hint">Đã tải lên: {citizenIdPhoto.name}</p>
                ) : null}

                <Field
                  label="Ảnh Giấy chứng nhận"
                  required
                  error={errors.certificatePhotos}
                  hint={`Từ 1 đến ${MAX_CERTIFICATE_PHOTOS} ảnh, chụp đủ các trang có thông tin.`}
                >
                  <input
                    className="pc-input"
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                    multiple
                    disabled={busy || certificatePhotos.length >= MAX_CERTIFICATE_PHOTOS}
                    onChange={(event) => {
                      void handleCertificateUpload(
                        Array.from(event.target.files ?? []).slice(
                          0,
                          MAX_CERTIFICATE_PHOTOS - certificatePhotos.length,
                        ),
                      );
                    }}
                  />
                </Field>
                {certificatePhotos.length > 0 ? (
                  <ul className="pc-field-hint list-disc pl-5">
                    {certificatePhotos.map((file) => (
                      <li key={file.name}>{file.name}</li>
                    ))}
                  </ul>
                ) : null}

                {uploadNote ? (
                  <div className="space-y-2">
                    <p style={{ color: "var(--muted)" }} aria-live="polite">
                      {uploadNote}
                      {busy && uploadPercent > 0 ? ` ${uploadPercent}%` : ""}
                    </p>
                    {busy ? (
                      <button type="button" className="pc-button-quiet" onClick={cancelUpload}>
                        Hủy tải ảnh
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </>
            )}
          </>
        ) : null}

        {step === 7 ? (
          <>
            <h2 className="text-xl font-bold">Kiểm tra lại trước khi gửi</h2>
            <dl className="space-y-3">
              <div>
                <dt className="font-semibold">Giấy chứng nhận</dt>
                <dd>
                  Số phát hành {draft.certificate.issueNumber || "—"}, cấp ngày{" "}
                  {draft.certificate.issueDate || "—"}, số vào sổ{" "}
                  {draft.certificate.registryNumber || "—"}
                </dd>
              </div>
              <div>
                <dt className="font-semibold">Chủ sử dụng</dt>
                <dd>
                  {draft.owners.length} người/tổ chức:{" "}
                  {draft.owners.map((owner) => owner.fullName || "(chưa có tên)").join(", ")}
                </dd>
              </div>
              <div>
                <dt className="font-semibold">Thửa đất</dt>
                <dd>
                  {draft.parcels.length} thửa, tổng {totalLandUses} dòng mục đích sử dụng
                </dd>
              </div>
              <div>
                <dt className="font-semibold">Tài sản gắn liền với đất</dt>
                <dd>{draft.assets.length > 0 ? `${draft.assets.length} tài sản` : "Không có"}</dd>
              </div>
              <div>
                <dt className="font-semibold">Giấy tờ</dt>
                <dd>
                  {citizenIdPhoto ? "1 ảnh CCCD" : "Chưa có ảnh CCCD"}, {certificatePhotos.length}{" "}
                  ảnh GCN
                </dd>
              </div>
              <div>
                <dt className="font-semibold">Điện thoại liên hệ</dt>
                <dd>{draft.phone || "—"}</dd>
              </div>
            </dl>
            <p style={{ color: "var(--muted)" }}>
              Sau khi gửi, bản kê khai sẽ bị khóa. Bạn chỉ sửa được khi cán bộ yêu cầu bổ sung.
            </p>
          </>
        ) : null}
      </section>

      {serverError ? (
        <div
          className="pc-card"
          style={{ borderColor: "var(--danger)", color: "var(--danger)" }}
          role="alert"
        >
          {serverError}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        {step > 0 ? (
          <button type="button" className="pc-button-quiet" onClick={goBack} disabled={busy}>
            Quay lại
          </button>
        ) : null}
        {step < STEPS.length - 1 ? (
          <button
            type="button"
            className="pc-button"
            onClick={() => {
              void goNext();
            }}
            disabled={outOfScope || busy}
          >
            {busy ? "Đang xử lý…" : "Tiếp tục"}
          </button>
        ) : (
          <button
            type="button"
            className="pc-button"
            onClick={() => {
              void handleSubmit();
            }}
            disabled={busy}
          >
            {busy ? "Đang gửi…" : "Gửi bản kê khai"}
          </button>
        )}
        {SAVE_STATUS_LABELS[saveStatus] ? (
          <span
            aria-live="polite"
            style={{ color: saveStatus === "SAVED" ? "var(--accent)" : "var(--muted)" }}
          >
            {SAVE_STATUS_LABELS[saveStatus]}
          </span>
        ) : null}
      </div>

      <aside className="pc-card">
        <p className="font-semibold">Không tự làm được?</p>
        <p className="mt-1" style={{ color: "var(--muted)" }}>
          Mang Giấy chứng nhận và CCCD đến Bộ phận một cửa UBND phường Phong Châu trong giờ hành
          chính để được cán bộ hướng dẫn kê khai trực tiếp.
        </p>
      </aside>
    </div>
  );
}
