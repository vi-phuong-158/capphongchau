"use client";

import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from "react";

import Link from "next/link";
import { TurnstileWidget } from "@/components/turnstile-widget";
import { VietnameseDateInput } from "@/components/vietnamese-date-input";
import { adoptServerDraftSnapshot } from "@/modules/public-intake/draft-adoption";
import {
  CERTIFICATE_ROLE_OPTIONS,
  CHANGE_REASON_OPTIONS,
  normalizeCertificateRole,
  LAND_PURPOSE_GHI_THEO_BIA,
  LAND_PURPOSE_SELECT_OPTIONS,
  NEIGHBORHOOD_OPTIONS,
  OLD_WARD_OPTIONS,
  type ReferenceOption,
} from "@/modules/public-intake/reference";
import {
  PUBLIC_WIZARD_STEPS,
  STEP_CONTACT_AND_IDENTITY,
  optionalSummary,
  ownerNeedsIdentityPhotos,
  submitChecklist,
  validatePublicWizardStep,
  type WizardValidationInput,
} from "@/modules/public-intake/public-wizard-validation";
import { canonicalImageMimeType, IMAGE_FILE_ACCEPT } from "@/modules/public-intake/image-format";
import {
  SUPPORT_CONTACTS,
  GENERAL_SUPPORT_CONTACT,
} from "@/modules/public-intake/support-contacts";
import { uploadWithResume, UploadCancelledError } from "@/modules/public-intake/resumable-upload";
import {
  readCitizenIdQr,
  type CitizenIdQrReadResult,
} from "@/modules/public-intake/citizen-id-qr.client";
import {
  normalizeIntakeImage,
  safeUploadFileName,
  type ImageNormalizationResult,
} from "@/modules/public-intake/image-normalization.client";
import {
  classifyPlatform,
  connectionClass,
  type FailureCode,
  type FailureStage,
} from "@/modules/public-intake/upload-metrics";
import { createXhrTransport } from "@/modules/public-intake/xhr-upload-transport.client";
import {
  hasFailedUpload as queueHasFailedUpload,
  hasPendingUpload as queueHasPendingUpload,
  readConnectionHints,
  resolveUploadConcurrency,
  runWithConcurrency,
  uploadPercent as taskPercent,
  uploadTaskLabel,
  type UploadDocumentType,
  type UploadTaskView,
} from "@/modules/public-intake/upload-queue";
import {
  OWNER_TYPES,
  OWNER_TYPE_LABELS,
  emptyDraft,
  emptyLandUse,
  emptyOwner,
  emptyParcel,
  isOrganisationOwner,
  requiresCitizenId,
  type CertificateFileMetadata,
  type IntakeDraft,
  type LandUse,
  type Owner,
  type OwnerType,
  type Parcel,
} from "@/modules/public-intake/types";
import {
  MAX_PURPOSE_FREE_TEXT_LENGTH,
  normalizeLandPurposeFreeText,
} from "@/modules/public-intake/validation";

/**
 * Public Intake V2 — bốn bước thay cho bảy.
 *
 * Cán bộ đi thu hồ sơ báo lại: bảy bước với hàng chục ô bắt buộc theo PL3 khiến hộ dân bỏ dở.
 * Mục tiêu của cổng công khai chỉ là lấy được **CCCD + ảnh GCN + tên chủ đang sử dụng**; phần dữ
 * liệu PL3 còn lại do cán bộ hoàn thiện ở `working_payload` và bị chặn ở `completionChecks` trước
 * khi tiếp nhận chính thức.
 */
const STEPS = PUBLIC_WIZARD_STEPS;

const PUBLIC_CREATE_ENDPOINT = "/api/public/submissions";
/** Route cán bộ: máy chủ tự gắn `OFFICER_ASSISTED` từ phiên đăng nhập, client không khai được. */
const ASSISTED_CREATE_ENDPOINT = "/api/staff/assisted-submissions";

const MAX_CERTIFICATE_PHOTOS = 10;
const MAX_INDIVIDUAL_OWNERS = 10;
const CREATE_IDEMPOTENCY_STORAGE_KEY = "pc_kk_create_idempotency";

type Errors = Record<string, string>;

type SaveStatus = "IDLE" | "SAVING" | "SAVED" | "FAILED" | "OFFLINE";

type IdentityDocumentType = "CITIZEN_ID_FRONT" | "CITIZEN_ID_BACK";
type UploadedIdentityImage = { file?: File; fileId: string; name: string };
type IdentityPhotos = Record<string, Partial<Record<IdentityDocumentType, UploadedIdentityImage>>>;
type UploadedCertificateImage = { file?: File; fileId: string; name: string; pageLabel: string };
type ServerFileSummary = {
  fileId: string;
  ownerId: string;
  documentType: IdentityDocumentType | "CERTIFICATE";
  status: string;
};
type ExistingLookupResult = {
  matched: boolean;
  pendingWarning: boolean;
  canFinishNoAction: boolean;
  linked?: boolean;
  certificates: Array<{
    existingRecordId: string;
    issueNumberMasked: string;
    issueDate: string;
  }>;
};

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

/** Địa chỉ là thông tin khai báo có thể sửa tự do; bốn trường định danh QR phải để lại lý do. */
function markManualIdentityEdit(owner: Owner): void {
  owner.identitySource = "MANUAL";
  owner.identityStatus =
    owner.identityStatus === "QR_CONFIRMED" ? "QR_OVERRIDE_PENDING_REVIEW" : "MANUAL_COMPLETE";
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

const FILE_PREVIEW_ENDPOINT = "/api/public/submissions/current/files";

/**
 * Ảnh xem trước riêng tư. Ảnh vừa chọn (`file`) hiện ngay từ bộ nhớ; ảnh khôi phục sau khi tải lại
 * trang chỉ còn `fileId` nên phải lấy byte qua API `private, no-store` rồi tạo object URL tạm.
 */
function FilePreview({ file, fileId, alt }: { file?: File; fileId: string; alt: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    async function load() {
      setFailed(false);
      if (file) {
        objectUrl = URL.createObjectURL(file);
        if (cancelled) URL.revokeObjectURL(objectUrl);
        else setUrl(objectUrl);
        return;
      }
      try {
        const response = await fetch(`${FILE_PREVIEW_ENDPOINT}/${fileId}`);
        if (!response.ok) {
          if (!cancelled) setFailed(true);
          return;
        }
        const blob = await response.blob();
        objectUrl = URL.createObjectURL(blob);
        if (cancelled) URL.revokeObjectURL(objectUrl);
        else setUrl(objectUrl);
      } catch {
        if (!cancelled) setFailed(true);
      }
    }
    void load();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [file, fileId]);

  const boxStyle: React.CSSProperties = {
    width: "100%",
    height: "8rem",
    objectFit: "cover",
    borderRadius: "0.5rem",
    border: "1px solid var(--border)",
    background: "var(--surface-muted, rgba(0,0,0,0.04))",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };

  if (failed) {
    return (
      <div style={boxStyle} className="pc-field-hint">
        Không xem trước được
      </div>
    );
  }
  if (!url) {
    return (
      <div style={boxStyle} className="pc-field-hint">
        Đang tải ảnh…
      </div>
    );
  }
  // Ảnh xem trước là object URL riêng tư (`private, no-store`) — không thể và không nên đưa qua
  // trình tối ưu ảnh của Next. Thẻ <img> thường là đúng ở đây.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={alt} style={boxStyle} />;
}

/**
 * Thứ tự và nhãn trang của ảnh GCN chỉ là dữ liệu trình bày nên giữ trong `sessionStorage`: người
 * dân sắp xếp/gắn nhãn xong, tải lại trang vẫn còn. Không đẩy lên Sheets để tránh đổi schema kho.
 */
const CERT_META_STORAGE_KEY = "pc_kk_cert_meta";

function certificateMetadataFromPhotos(
  photos: readonly UploadedCertificateImage[],
): CertificateFileMetadata[] {
  return photos.map((photo) => ({ fileId: photo.fileId, pageLabel: photo.pageLabel }));
}

function withCertificateMetadata(
  draft: IntakeDraft,
  photos: readonly UploadedCertificateImage[],
): IntakeDraft {
  return { ...draft, certificateFileMetadata: certificateMetadataFromPhotos(photos) };
}

function writeCertMeta(photos: readonly UploadedCertificateImage[]): void {
  try {
    sessionStorage.setItem(
      CERT_META_STORAGE_KEY,
      JSON.stringify(certificateMetadataFromPhotos(photos)),
    );
  } catch {
    // sessionStorage riêng tư có thể bị chặn — mất nhãn khi tải lại không phải lỗi chặn.
  }
}

function applyCertMeta(
  photos: UploadedCertificateImage[],
  persisted: readonly CertificateFileMetadata[] = [],
): UploadedCertificateImage[] {
  let local: CertificateFileMetadata[] = [];
  try {
    local = JSON.parse(sessionStorage.getItem(CERT_META_STORAGE_KEY) ?? "[]") as typeof local;
  } catch {
    local = [];
  }
  const fileIds = new Set(photos.map((photo) => photo.fileId));
  const localMatches = local.filter((item) => fileIds.has(item.fileId));
  const meta = localMatches.length > 0 ? localMatches : [...persisted];
  if (meta.length === 0) return photos;
  const order = new Map(meta.map((item, index) => [item.fileId, index]));
  const labels = new Map([
    ...persisted.map((item) => [item.fileId, item.pageLabel] as const),
    ...localMatches.map((item) => [item.fileId, item.pageLabel] as const),
  ]);
  return [...photos]
    .map((photo) => ({ ...photo, pageLabel: labels.get(photo.fileId) ?? photo.pageLabel }))
    .sort(
      (a, b) =>
        (order.get(a.fileId) ?? Number.MAX_SAFE_INTEGER) -
        (order.get(b.fileId) ?? Number.MAX_SAFE_INTEGER),
    );
}

/**
 * Bọc mỗi ô nhập với nhãn, gợi ý, lỗi — và nối chúng lại cho trình đọc màn hình: sinh một `id`,
 * gắn `htmlFor` cho nhãn, tiêm `id`/`aria-describedby` (và `name` với ô gốc) vào phần tử con. Nhờ
 * vậy toàn biểu mẫu có `htmlFor` thật thay vì nhãn treo lơ lửng như trước.
 */
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
  const fieldId = useId();
  const hintId = hint ? `${fieldId}-hint` : undefined;
  const errorId = error ? `${fieldId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  let control = children;
  let controlId = fieldId;
  if (isValidElement(children)) {
    const element = children as ReactElement<Record<string, unknown>>;
    const existingId = element.props.id;
    controlId = typeof existingId === "string" ? existingId : fieldId;
    const existingDescribedBy = element.props["aria-describedby"];
    const mergedDescribedBy =
      [typeof existingDescribedBy === "string" ? existingDescribedBy : null, describedBy]
        .filter(Boolean)
        .join(" ") || undefined;
    const injected: Record<string, unknown> = {
      id: controlId,
      "aria-describedby": mergedDescribedBy,
    };
    if (element.props.name === undefined) {
      injected.name = controlId;
    }
    if (error && element.props["aria-invalid"] === undefined) injected["aria-invalid"] = "true";
    control = cloneElement(element, injected);
  }

  return (
    <div>
      <label htmlFor={controlId} className="pc-field-label">
        {label}
        {required ? <span style={{ color: "var(--danger)" }}> *</span> : null}
      </label>
      {control}
      {hint ? (
        <p id={hintId} className="pc-field-hint">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="pc-field-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function Select({
  value,
  onChange,
  options,
  placeholder,
  invalid,
  id,
  name,
  "aria-describedby": ariaDescribedBy,
}: {
  value: string;
  onChange: (value: string) => void;
  options: readonly ReferenceOption[];
  placeholder: string;
  invalid?: boolean;
  id?: string;
  name?: string;
  "aria-describedby"?: string;
}) {
  return (
    <select
      id={id}
      name={name}
      className="pc-select"
      value={value}
      aria-invalid={invalid ? "true" : undefined}
      aria-describedby={ariaDescribedBy}
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

function optionLabel(options: readonly ReferenceOption[], code: string): string {
  return options.find((option) => option.code === code)?.label ?? code;
}

/**
 * Ghi ký hiệu loại đất người dân gõ vào dòng mục đích **đầu tiên** của thửa.
 *
 * Người dân chỉ thấy một ô chữ; mô hình dữ liệu vẫn là mảng `landUses` để cán bộ tách thành nhiều
 * mục đích ở `working_payload` và để xuất PL3 không đổi. Xóa hết chữ thì trả `purposeCode` về rỗng
 * — giữ lại mã "ghi theo bìa" mà không có nội dung là tạo ra dữ liệu giả.
 */
function setRawLandPurpose(parcel: Parcel, raw: string): void {
  if (parcel.landUses.length === 0) parcel.landUses.push(emptyLandUse(newId()));
  const landUse = parcel.landUses[0];
  landUse.purposeFreeText = raw;
  landUse.purposeCode = raw.trim() ? LAND_PURPOSE_GHI_THEO_BIA : "";
}

/** ISO `YYYY-MM-DD` → `DD/MM/YYYY` cho trang kiểm tra cuối; giá trị khác giữ nguyên. */
function formatVnDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  return match ? `${match[3]}/${match[2]}/${match[1]}` : iso.trim();
}

/**
 * Loại đất để hiển thị trên trang kiểm tra.
 *
 * Ở V2 cổng công khai chỉ thu ký hiệu ghi theo bìa, nên chỉ còn hai trạng thái: có chữ hoặc chưa
 * ghi. Hồ sơ cũ (kê khai trước V2, hoặc cán bộ đã chuẩn hóa ở `working_payload`) vẫn có thể mang
 * mã danh mục — giữ nhánh đó để không hiện mã thô cho người dân.
 */
function landPurposeDisplay(landUse: LandUse | undefined): string {
  if (!landUse) return "cán bộ sẽ bổ sung";
  const text = landUse.purposeFreeText.trim();
  if (text) return text;
  if (!landUse.purposeCode) return "cán bộ sẽ bổ sung";
  return optionLabel(LAND_PURPOSE_SELECT_OPTIONS, landUse.purposeCode);
}

/** Một khối trên trang kiểm tra cuối: tiêu đề + nút "Sửa" đưa thẳng về bước liên quan. */
function ReviewBlock({
  title,
  onEdit,
  children,
}: {
  title: string;
  onEdit?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="pc-card">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold">{title}</h3>
        {onEdit ? (
          <button
            type="button"
            onClick={onEdit}
            className="text-sm font-semibold underline"
            style={{ color: "var(--accent)" }}
          >
            Sửa
          </button>
        ) : null}
      </div>
      {children}
    </div>
  );
}

/**
 * Chế độ cán bộ hỗ trợ kê khai.
 *
 * Dùng lại **nguyên** wizard công khai thay vì dựng một bản song song: hai bản mã cho cùng một
 * biểu mẫu là hai bản sẽ lệch nhau ngay ở lần sửa đầu tiên. Chỉ khác đường tạo hồ sơ và việc bỏ
 * Turnstile; nhãn kênh và danh tính cán bộ do **máy chủ** gán từ phiên đăng nhập.
 */
export interface AssistedModeConfig {
  readonly officerName: string;
}

export function IntakeWizard({ assisted }: { assisted?: AssistedModeConfig } = {}) {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<IntakeDraft>(() => emptyDraft(newId(), newId(), newId()));
  const [errors, setErrors] = useState<Errors>({});

  const [certificateCount, setCertificateCount] = useState("");
  const [hasCertificate, setHasCertificate] = useState("");

  const [receipt, setReceipt] = useState<{ code: string; secret: string } | null>(null);

  const [identityPhotos, setIdentityPhotos] = useState<IdentityPhotos>({});
  const [certificatePhotos, setCertificatePhotos] = useState<UploadedCertificateImage[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [receiptCopied, setReceiptCopied] = useState(false);
  /**
   * Mã tiếp nhận đã gửi trong phiên làm việc này.
   *
   * Chỉ mã, **không** kèm tên, số điện thoại hay CCCD, và chỉ nằm trong bộ nhớ của trang — đóng
   * tab là mất. Cán bộ đi cơ sở làm liên tiếp nhiều hộ cần đọc lại mã vừa tạo mà không phải mở
   * trang tra cứu; ghi thêm bất cứ thứ gì khác là để PII nằm trên máy cá nhân (kế hoạch §12).
   */
  const [recentReceipts, setRecentReceipts] = useState<string[]>([]);
  const successHeadingRef = useRef<HTMLHeadingElement>(null);
  const [existingResults, setExistingResults] = useState<Record<string, ExistingLookupResult>>({});

  const [csrfToken, setCsrfToken] = useState("");
  /** Version PostgreSQL gần nhất đã nhận từ GET/PATCH, gửi lại để phát hiện thiết bị sửa song song. */
  const [serverVersion, setServerVersion] = useState<number | null>(null);
  // Token Turnstile gắn với đúng hành động sinh ra nó; đổi bước là token cũ hết giá trị.
  const [challenge, setChallenge] = useState<{ action: string; token: string }>({
    action: "",
    token: "",
  });
  const [challengeNonce, setChallengeNonce] = useState(0);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("IDLE");
  /**
   * `busy` giờ **chỉ** dành cho các thao tác mạng ngắn khóa cả màn hình (tạo bản kê khai, lưu
   * nháp, xóa ảnh). Việc tải ảnh KHÔNG còn đặt cờ này: người dân phải điền được các ô khác trong
   * lúc ảnh đang lên, thay vì ngồi nhìn màn hình đơ.
   */
  const [busy, setBusy] = useState(false);
  /** Mỗi ảnh đang tải là một việc có trạng thái, phần trăm và nút hủy/thử lại riêng. */
  const [uploadTasks, setUploadTasks] = useState<UploadTaskView[]>([]);
  const [serverError, setServerError] = useState("");
  const [uploadNote, setUploadNote] = useState("");
  const [uploadPercent, setUploadPercent] = useState(0);
  const uploadAbort = useRef<AbortController | null>(null);
  /** Một `AbortController` cho mỗi việc tải, để hủy được từng ảnh mà không đụng ảnh khác. */
  const taskAborts = useRef(new Map<string, AbortController>());
  const createIdempotencyKey = useRef<string | null>(null);
  const submitIdempotencyKey = useRef<string | null>(null);
  const serverErrorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (serverError && serverErrorRef.current) {
      serverErrorRef.current.focus();
    }
  }, [serverError]);

  // Sau khi gửi xong, con trỏ nhảy về dòng "KÊ KHAI THÀNH CÔNG". Không có bước này thì người dùng
  // bàn phím và trình đọc màn hình vẫn đứng ở nút Gửi cũ, không biết chuyện gì vừa xảy ra.
  useEffect(() => {
    if (submitted) successHeadingRef.current?.focus();
  }, [submitted]);

  useEffect(() => {
    if (saveStatus === "SAVING" || saveStatus === "FAILED") {
      const handleBeforeUnload = (e: BeforeUnloadEvent) => {
        e.preventDefault();
        e.returnValue = "";
      };
      window.addEventListener("beforeunload", handleBeforeUnload);
      return () => window.removeEventListener("beforeunload", handleBeforeUnload);
    }
  }, [saveStatus]);

  const outOfScope = hasCertificate === "KHONG" || certificateCount === "NHIEU";

  // Hai hành động phải qua Turnstile: tạo bản kê khai và gửi chính thức. Các bước ở giữa chỉ lưu
  // nháp trong phiên đã có, không cần bắt người dân giải lại.
  // Chế độ cán bộ đã đăng nhập và có CSRF — hai thứ đó mạnh hơn hẳn một bài kiểm tra bot, nên
  // không bắt cán bộ giải Turnstile ở mỗi hộ dân.
  const challengeAction: "create" | "submit" | null = assisted
    ? null
    : step === 0 && !receipt
      ? "create"
      : step === STEPS.length - 1
        ? "submit"
        : null;
  const challengeToken = challenge.action === challengeAction ? challenge.token : "";

  const handleChallengeToken = useCallback(
    (token: string) => {
      setChallenge({ action: challengeAction ?? "", token });
    },
    [challengeAction],
  );

  /** Token dùng một lần: sau mỗi lần gửi đi phải lấy widget mới, không tái sử dụng. */
  const refreshChallenge = useCallback(() => {
    setChallenge({ action: "", token: "" });
    setChallengeNonce((current) => current + 1);
  }, []);

  /**
   * Bản nháp trên máy đã khác bản máy chủ đang giữ chưa.
   *
   * Trước V2, mỗi lần tải ảnh CCCD đều PATCH nháp trước — chọn mặt trước rồi mặt sau là hai lần
   * ghi, dù giữa hai lần đó người dân không sửa gì. Trên mạng yếu đó là hai vòng round-trip thừa
   * ngay trước công đoạn chậm nhất.
   */
  const draftDirtyRef = useRef(false);

  /**
   * Header cho lệnh tạo hồ sơ.
   *
   * Cổng công khai gửi token Turnstile; chế độ cán bộ gửi CSRF của phiên đăng nhập. Không bao giờ
   * gửi cả hai, và **không** gửi trường nào để client tự khai mình là cán bộ — máy chủ suy ra từ
   * chính route và phiên.
   */
  const buildCreateHeaders = useCallback(
    async (idempotencyKey: string): Promise<Record<string, string>> => {
      const headers: Record<string, string> = {
        "content-type": "application/json",
        "idempotency-key": idempotencyKey,
      };
      if (assisted) {
        const response = await fetchApi("/api/security/csrf", { method: "GET" });
        if (!response.ok) throw new Error("CREATE_NETWORK_FAILED");
        headers["x-csrf-token"] = ((await response.json()) as { csrfToken: string }).csrfToken;
      } else {
        headers["x-turnstile-token"] = challengeToken;
      }
      return headers;
    },
    [assisted, challengeToken],
  );

  const update = useCallback((mutate: (next: IntakeDraft) => void) => {
    draftDirtyRef.current = true;
    setDraft((current) => {
      const next = structuredClone(current);
      mutate(next);
      return next;
    });
  }, []);

  /**
   * Mọi thay đổi danh sách ảnh GCN đi qua đây: ghi `sessionStorage` và **đánh dấu nháp bẩn**.
   *
   * Thứ tự và nhãn trang nằm trong `draft.certificateFileMetadata`, tức là một phần của bản nháp.
   * Thiếu việc đánh dấu thì `flushDraft` sẽ bỏ qua và thứ tự/nhãn người dân vừa đặt không được
   * lưu lên máy chủ.
   */
  const updateCertificatePhotos = useCallback(
    (mutate: (current: UploadedCertificateImage[]) => UploadedCertificateImage[]) => {
      draftDirtyRef.current = true;
      setCertificatePhotos((current) => {
        const next = mutate(current);
        writeCertMeta(next);
        return next;
      });
    },
    [],
  );

  /** `ownerId` -> các mặt CCCD đã tải xong, dạng module kiểm tra dùng được. */
  const uploadedIdentitySides = useMemo(() => {
    const sides: Record<string, IdentityDocumentType[]> = {};
    for (const [ownerId, photos] of Object.entries(identityPhotos)) {
      sides[ownerId] = (Object.keys(photos ?? {}) as IdentityDocumentType[]).filter(
        (side) => photos?.[side],
      );
    }
    return sides;
  }, [identityPhotos]);

  const validationInput: WizardValidationInput = useMemo(
    () => ({
      step,
      draft,
      hasReceipt: Boolean(receipt),
      hasCertificate,
      certificateCount,
      uploadedIdentitySides,
      uploadedCertificateCount: certificatePhotos.length,
      hasPendingUpload: queueHasPendingUpload(uploadTasks),
      hasFailedUpload: queueHasFailedUpload(uploadTasks),
    }),
    [
      step,
      draft,
      receipt,
      hasCertificate,
      certificateCount,
      uploadedIdentitySides,
      certificatePhotos.length,
      uploadTasks,
    ],
  );

  /**
   * Kiểm tra bước hiện tại. Toàn bộ luật nghiệp vụ nằm ở
   * `public-wizard-validation.ts` — dùng chung hàm với máy chủ để hai bên không lệch nhau.
   */
  const validate = useCallback(
    (): Errors => validatePublicWizardStep(validationInput),
    [validationInput],
  );

  const certificateSlotsLeft = Math.max(
    0,
    MAX_CERTIFICATE_PHOTOS - certificatePhotos.length - uploadTasks.length,
  );
  const checklist = useMemo(() => submitChecklist(validationInput), [validationInput]);
  const optionalItems = useMemo(() => optionalSummary(draft), [draft]);

  /** Lưu nháp lên server. Chỉ gọi khi chuyển bước để giữ số lần ghi Sheets ở mức thấp. */
  const saveDraft = useCallback(
    async (draftToSave: IntakeDraft = draft): Promise<boolean> => {
      if (!csrfToken) {
        return true;
      }

      setSaveStatus("SAVING");
      try {
        const response = await fetchApi("/api/public/submissions/current", {
          method: "PATCH",
          headers: { "content-type": "application/json", "x-public-csrf-token": csrfToken },
          body: JSON.stringify({
            draft: withCertificateMetadata(draftToSave, certificatePhotos),
            version: serverVersion,
          }),
        });

        if (!response.ok) {
          setSaveStatus("FAILED");
          setServerError(await readErrorMessage(response, "Chưa lưu được. Thử lại sau ít phút."));
          return false;
        }

        const saved = (await response.json()) as { version?: unknown };
        if (
          typeof saved.version !== "number" ||
          !Number.isInteger(saved.version) ||
          saved.version < 1
        ) {
          setSaveStatus("FAILED");
          setServerError("Máy chủ không trả phiên bản bản kê khai hợp lệ. Vui lòng thử lại.");
          return false;
        }

        setServerVersion(saved.version);
        setSaveStatus("SAVED");
        setServerError("");
        // Chỉ hạ cờ khi máy chủ đã nhận. Lưu hỏng mà hạ cờ là mất dữ liệu im lặng ở lần sau.
        draftDirtyRef.current = false;
        return true;
      } catch {
        setSaveStatus("OFFLINE");
        setServerError("Mất kết nối. Dữ liệu bạn nhập vẫn còn trên màn hình, đừng đóng trang.");
        return false;
      }
    },
    [csrfToken, draft, certificatePhotos, serverVersion],
  );

  /**
   * Lưu nháp **một lần** cho mỗi lô thay đổi.
   *
   * Hai việc:
   * - bỏ qua hoàn toàn nếu bản nháp không đổi từ lần lưu trước (tải ảnh mặt sau ngay sau mặt
   *   trước không PATCH lại);
   * - gộp các lời gọi chồng nhau vào cùng một request đang bay, thay vì bắn song song rồi để hai
   *   response ghi đè nhau theo thứ tự ngẫu nhiên.
   */
  const savePromiseRef = useRef<Promise<boolean> | null>(null);

  const flushDraft = useCallback(
    async (options?: { force?: boolean }): Promise<boolean> => {
      if (!options?.force && !draftDirtyRef.current) return true;
      if (savePromiseRef.current) return savePromiseRef.current;
      const promise = saveDraft().finally(() => {
        savePromiseRef.current = null;
      });
      savePromiseRef.current = promise;
      return promise;
    },
    [saveDraft],
  );

  /**
   * Lấy bản nháp mà máy chủ đang giữ về máy.
   *
   * Bắt buộc gọi ngay sau khi tạo: ID chủ sử dụng trong bản nháp là do **máy chủ** sinh, còn
   * trình duyệt lại sinh bộ ID riêng lúc mở trang. Hai bên lệch nhau thì mọi lần tải ảnh CCCD
   * đều bị từ chối vì máy chủ không tìm thấy chủ sử dụng ứng với `ownerId` gửi lên.
   *
   * Ở lần khôi phục (`recovered`), bản của máy chủ còn là bản duy nhất có dữ liệu đã lưu trước
   * đó — nên phải lấy về, không được đẩy bản rỗng trên máy lên đè.
   */
  const adoptServerDraft = useCallback(
    async (options?: { localDraft?: IntakeDraft }): Promise<boolean> => {
      try {
        const response = await fetchApi("/api/public/submissions/current", { method: "GET" });
        if (!response.ok) {
          return false;
        }
        const body = (await response.json()) as {
          draft: (IntakeDraft & { owners?: unknown }) | null;
          files?: ServerFileSummary[];
          version?: unknown;
        };
        if (!body.draft || !Array.isArray(body.draft.owners)) return false;
        // Nháp lưu trước 2026-07-22 mang mã vai trò cũ, không còn trong danh mục PL3. Đổi ngay lúc
        // tải về, nếu không ô "Vai trò trên GCN" hiện trống và người dân không hiểu vì sao.
        const serverDraft = {
          ...body.draft,
          owners: body.draft.owners.map((owner) => ({
            ...owner,
            roleOnCertificate: normalizeCertificateRole(owner.roleOnCertificate),
          })),
        } as IntakeDraft;
        const adopted = adoptServerDraftSnapshot({
          serverDraft,
          serverVersion: body.version,
          localDraft: options?.localDraft,
        });
        if (!adopted) return false;
        const restoredDraft = adopted.draft;
        setDraft(restoredDraft);
        setServerVersion(adopted.version);
        // Nếu người dùng đã nhập thêm dữ liệu trong lúc CREATE đang bay, lần upload/chuyển bước kế
        // tiếp phải PATCH phần được giữ lại; chỉ owner/parcel IDs và version là lấy từ server.
        draftDirtyRef.current = adopted.hasLocalChanges;
        const restoredIdentity: IdentityPhotos = {};
        const restoredCertificates: UploadedCertificateImage[] = [];
        for (const file of body.files ?? []) {
          if (file.status !== "UPLOADED") continue;
          if (file.documentType === "CERTIFICATE") {
            restoredCertificates.push({
              fileId: file.fileId,
              name: "Ảnh GCN đã tải",
              pageLabel: "",
            });
          } else {
            restoredIdentity[file.ownerId] = {
              ...restoredIdentity[file.ownerId],
              [file.documentType]: {
                fileId: file.fileId,
                name:
                  file.documentType === "CITIZEN_ID_FRONT"
                    ? "CCCD mặt trước đã tải"
                    : "CCCD mặt sau đã tải",
              },
            };
          }
        }
        setIdentityPhotos(restoredIdentity);
        setCertificatePhotos(
          applyCertMeta(restoredCertificates, restoredDraft.certificateFileMetadata),
        );
        return true;
      } catch {
        return false;
      }
    },
    [],
  );

  useEffect(() => {
    let recovery: {
      receiptCode?: string;
      accessSecret?: string;
      csrfToken?: string;
    } | null = null;
    try {
      recovery = JSON.parse(sessionStorage.getItem("pc_kk_recovery") ?? "null") as {
        receiptCode?: string;
        accessSecret?: string;
        csrfToken?: string;
      } | null;
      sessionStorage.removeItem("pc_kk_recovery");
    } catch {
      recovery = null;
    }
    if (!recovery?.receiptCode || !recovery.accessSecret || !recovery.csrfToken) return;
    // Khôi phục là đồng bộ từ phiên ngoài React (cookie + sessionStorage), không phải state dẫn xuất.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void adoptServerDraft().then((ok) => {
      setReceipt({ code: recovery.receiptCode!, secret: recovery.accessSecret! });
      setCsrfToken(recovery.csrfToken!);
      if (!ok)
        setServerError(
          "Chưa tải lại được bản kê khai. Vui lòng quay lại trang tra cứu và thử lại.",
        );
    });
  }, [adoptServerDraft]);

  const goNext = useCallback(async () => {
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) {
      // Đưa con trỏ tới ô sai đầu tiên: trên điện thoại người dân không thấy lỗi nằm cuối trang.
      requestAnimationFrame(() => {
        const firstInvalid = document.querySelector<HTMLElement>(
          '[aria-invalid="true"], [data-invalid="true"]',
        );
        if (firstInvalid) {
          firstInvalid.focus({ preventScroll: true });
          firstInvalid.scrollIntoView({ block: "center", behavior: "smooth" });
        }
      });
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

        const createHeaders = await buildCreateHeaders(createIdempotencyKey.current);
        let response: Response | null = null;
        for (let attempt = 0; attempt < 2; attempt += 1) {
          try {
            response = await fetchApi(
              assisted ? ASSISTED_CREATE_ENDPOINT : PUBLIC_CREATE_ENDPOINT,
              {
                method: "POST",
                headers: createHeaders,
                body: JSON.stringify({
                  phone: draft.phone,
                  consent: { accepted: draft.consentAccepted },
                }),
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
          // Token đã tiêu dù request hỏng — phải có widget mới thì lần bấm sau mới đi được.
          refreshChallenge();
          setServerError(await readErrorMessage(response, "Chưa tạo được bản kê khai."));
          return;
        }

        const created = (await response.json()) as {
          receiptCode: string;
          accessSecret: string;
          csrfToken: string;
        };
        setCsrfToken(created.csrfToken);
        createIdempotencyKey.current = null;
        try {
          sessionStorage.removeItem(CREATE_IDEMPOTENCY_STORAGE_KEY);
        } catch {
          // Không có gì cần làm nếu storage bị chặn.
        }
        // Đồng bộ ID chủ sử dụng với máy chủ trước khi người dân kịp chọn ảnh CCCD ở ngay bước
        // này; thiếu bước đồng bộ thì `ownerId` gửi kèm ảnh là ID lạ và máy chủ trả 400.
        if (!(await adoptServerDraft({ localDraft: draft }))) {
          setServerError(
            "Đã tạo được bản kê khai nhưng chưa tải được dữ liệu về máy. Ghi lại mã ở trên, kiểm tra mạng rồi bấm Tiếp tục để thử lại.",
          );
        }
        setReceipt({ code: created.receiptCode, secret: created.accessSecret });
        // Giữ nguyên bước đầu: ngay sau khi tạo nháp/thư mục Drive, người dân tải ảnh CCCD tại
        // chính màn hình này thay vì phải đi qua toàn bộ biểu mẫu rồi mới quay lại.
        return;
      } else if (!(await flushDraft())) {
        return;
      }

      setStep((current) => Math.min(current + 1, STEPS.length - 1));
    } catch {
      refreshChallenge();
      setServerError(
        "Kết nối bị gián đoạn khi tạo bản kê khai. Dữ liệu đã nhập vẫn còn; bấm Tiếp tục để khôi phục và thử lại.",
      );
    } finally {
      setBusy(false);
    }
  }, [
    validate,
    step,
    receipt,
    draft,
    flushDraft,
    assisted,
    buildCreateHeaders,
    refreshChallenge,
    adoptServerDraft,
  ]);

  /** Trình duyệt tải thẳng lên Drive qua phiên resumable; ảnh không đi qua server của app. */
  const uploadFile = useCallback(
    async (
      file: File,
      documentType: IdentityDocumentType | "CERTIFICATE",
      ownerId = "",
      replaceFileId = "",
      hooks?: {
        signal?: AbortSignal;
        onProgress?: (sent: number, total: number) => void;
        /** Kết quả bước chuẩn hóa, dùng để đo tỷ lệ nén thật. Thiếu thì chỉ mất số đo. */
        normalization?: ImageNormalizationResult;
        prepareDurationMs?: number;
      },
    ): Promise<string | null> => {
      const attemptId = crypto.randomUUID();
      const platform = classifyPlatform(
        typeof navigator === "undefined" ? "" : navigator.userAgent,
      );
      const connection = connectionClass(readConnectionHints());
      const metricDocumentType = documentType as UploadDocumentType;

      /**
       * Bắn số đo cho một lượt hỏng. Cố tình không `await` ở chỗ gọi và nuốt mọi lỗi: người dân
       * đang chờ một thông báo lỗi rõ ràng, không phải chờ thêm một request thống kê.
       */
      const reportFailure = (stage: FailureStage, code: FailureCode): void => {
        void fetchApi("/api/public/submissions/current/uploads/metrics", {
          method: "POST",
          headers: { "content-type": "application/json", "x-public-csrf-token": csrfToken },
          body: JSON.stringify({
            documentType: metricDocumentType,
            outcome: code === "CANCELLED" ? "CANCELLED" : "FAILED",
            failureStage: stage,
            failureCode: code,
            clientUpload: {
              attemptId,
              sourceSizeBytes: hooks?.normalization?.source.sizeBytes ?? file.size,
              prepareDurationMs: hooks?.prepareDurationMs ?? 0,
              clientPlatform: platform,
              effectiveConnectionType: connection,
            },
          }),
        }).catch(() => undefined);
      };

      // Ảnh nhận qua Zalo/Messenger hay tải về từ trình duyệt thường có `File.type` rỗng hoặc là
      // bí danh `image/jpg`. Quy về tên chuẩn ngay ở đây để không bị từ chối oan.
      const declaredMimeType = canonicalImageMimeType(file.type, file.name);
      if (!declaredMimeType) {
        setServerError(
          "Không nhận dạng được định dạng của tệp bạn chọn. Hãy chọn ảnh JPG, PNG, WebP hoặc HEIC.",
        );
        reportFailure("PREPARE", "DECODE_FAILED");
        return null;
      }

      const initiateStartedAt = Date.now();
      const initiate = await fetchApi("/api/public/submissions/current/uploads/initiate", {
        method: "POST",
        headers: { "content-type": "application/json", "x-public-csrf-token": csrfToken },
        body: JSON.stringify({
          documentType,
          ownerId,
          replaceFileId,
          // Tên trung tính, KHÔNG phải tên tệp gốc: máy chủ ghép tên client gửi lên vào tên tệp
          // trong Drive, mà tên do máy ảnh/người dân đặt hay mang số CCCD, tên người, ngày giờ.
          fileName: safeUploadFileName(
            documentType === "CERTIFICATE" ? "CERTIFICATE" : "CITIZEN_ID",
            declaredMimeType,
          ),
          mimeType: declaredMimeType,
          sizeBytes: file.size,
        }),
      });

      if (!initiate.ok) {
        setServerError(await readErrorMessage(initiate, "Không tạo được phiên tải lên."));
        reportFailure("INITIATE", "SERVER_REJECTED");
        return null;
      }
      const initiateDurationMs = Date.now() - initiateStartedAt;

      // Dùng đúng loại máy chủ đã đăng ký với phiên, không dùng lại `file.type`.
      const { uploadUrl, mimeType } = (await initiate.json()) as {
        uploadUrl: string;
        mimeType: string;
      };

      const uploadStartedAt = Date.now();
      let id: string;
      try {
        id = await uploadWithResume({
          uploadUrl,
          file,
          contentType: mimeType,
          signal: hooks?.signal ?? uploadAbort.current?.signal,
          // XHR là cách duy nhất lấy được tiến độ tải lên thật ở trình duyệt; `fetch` không có
          // sự kiện nào giữa lúc gửi và lúc nhận response.
          transport: createXhrTransport(),
          onProgress: (sent, total) => {
            hooks?.onProgress?.(sent, total);
            if (!hooks?.onProgress) {
              setUploadPercent(total > 0 ? Math.round((sent / total) * 100) : 0);
            }
          },
        });
      } catch (error) {
        if (error instanceof UploadCancelledError) {
          setServerError("Đã hủy tải ảnh. Bạn có thể chọn lại tệp để thử lần nữa.");
          reportFailure("UPLOAD", "CANCELLED");
        } else {
          setServerError(
            error instanceof Error
              ? `${error.message} Kiểm tra mạng rồi chọn lại tệp để thử lại.`
              : "Tải ảnh lên thất bại.",
          );
          reportFailure("UPLOAD", "NETWORK");
        }
        return null;
      }
      const uploadDurationMs = Date.now() - uploadStartedAt;

      const normalization = hooks?.normalization;
      const complete = await fetchApi("/api/public/submissions/current/uploads/complete", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-public-csrf-token": csrfToken,
          "idempotency-key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          driveFileId: id,
          documentType,
          ownerId,
          replaceFileId,
          /*
           * Số đo hiệu năng. Không có trường tự do nào: mọi thứ ở đây là số hoặc giá trị thuộc
           * danh mục đóng, và tên tệp/CCCD/điện thoại **không** được đưa vào (kế hoạch §3.6).
           * Dung lượng đã tải thì máy chủ tự lấy từ Drive, không tin số client gửi.
           */
          clientUpload: {
            attemptId,
            sourceSizeBytes: normalization?.source.sizeBytes ?? file.size,
            sourceMimeType: normalization?.source.mimeType || undefined,
            sourceWidth: normalization?.source.width || undefined,
            sourceHeight: normalization?.source.height || undefined,
            uploadWidth: normalization?.upload.width || undefined,
            uploadHeight: normalization?.upload.height || undefined,
            normalizationVersion: normalization?.normalizationVersion,
            prepareDurationMs: hooks?.prepareDurationMs ?? 0,
            initiateDurationMs,
            uploadDurationMs,
            retryCount: 0,
            clientPlatform: platform,
            effectiveConnectionType: connection,
          },
        }),
      });

      if (!complete.ok) {
        setServerError(await readErrorMessage(complete, "Ảnh tải lên không hợp lệ."));
        reportFailure("COMPLETE", "SERVER_REJECTED");
        return null;
      }

      return ((await complete.json()) as { fileId: string }).fileId;
    },
    [csrfToken],
  );

  /** Người dân luôn thoát được khỏi trạng thái đang tải, kể cả khi mạng không phản hồi. */
  const cancelUpload = useCallback(() => {
    uploadAbort.current?.abort();
  }, []);

  /**
   * Đổ kết quả QR vào một chủ sử dụng. Dùng chung cho hai đường: đọc ngầm khi tải ảnh CCCD, và
   * quét chủ động bằng nút trong khối thông tin.
   *
   * `force` phân biệt hai đường đó. Đọc ngầm thì không được ghi đè thứ người dân đã tự sửa. Còn
   * khi người dân **bấm nút quét**, im lặng không đổi gì mới là hỏng — nên lần đó luôn ghi đè và
   * đặt lại trạng thái về chờ xác nhận để không có dữ liệu nào được coi là đã đối chiếu mà thực
   * ra chưa.
   *
   * Trả về việc có đọc được mã hay không, phục vụ thông báo cho người dùng.
   */
  const applyQrResult = useCallback(
    (ownerId: string, result: CitizenIdQrReadResult | null, options?: { force?: boolean }) => {
      update((next) => {
        const owner = next.owners.find((candidate) => candidate.id === ownerId);
        if (!owner) return;

        const locked =
          !options?.force &&
          (owner.identitySource === "MANUAL" || owner.identityStatus === "QR_CONFIRMED");
        if (locked) return;

        if (!result) {
          owner.identityStatus = "";
          return;
        }

        owner.identityNumber = result.parsed.identityNumber;
        owner.fullName = result.parsed.fullName;
        owner.dateOfBirth = result.parsed.dateOfBirth;
        owner.gender = result.parsed.gender;
        owner.residenceAddress = result.parsed.residenceAddress;
        owner.identitySource = "QR";
        owner.qrPayloadHash = result.payloadHash;
        owner.qrDecoderVersion = result.decoderVersion;
        owner.qrParserVersion = result.parserVersion;
        owner.identityStatus = "PENDING_CONFIRMATION";
        owner.identityConfirmedAt = "";
        owner.identityOverrideReason = "";
      });

      return result !== null;
    },
    [update],
  );

  const handleCitizenIdUpload = useCallback(
    async (ownerId: string, documentType: IdentityDocumentType, file: File | null) => {
      if (!file) return;
      uploadAbort.current = new AbortController();
      setBusy(true);
      setServerError("");
      setUploadPercent(0);
      const sideLabel = documentType === "CITIZEN_ID_FRONT" ? "mặt trước" : "mặt sau";
      setUploadNote(`Đang chuẩn bị và tải ảnh CCCD ${sideLabel}…`);
      try {
        // Máy chủ chỉ nhận ảnh cho chủ sử dụng đã có trong bản nháp mà nó đang giữ. Người dân có
        // thể vừa bấm "Thêm người" xong là chọn ảnh ngay, lúc đó người mới chưa được lưu — nên
        // đẩy bản nháp lên trước, rồi mới tải ảnh. `flushDraft` bỏ qua nếu nháp không đổi, nên
        // tải mặt sau ngay sau mặt trước không tốn thêm một vòng PATCH.
        if (!(await flushDraft())) {
          setUploadNote("");
          return;
        }
        const prepareStartedAt = Date.now();
        const normalized = await normalizeIntakeImage(file, "CITIZEN_ID");
        const prepareDurationMs = Date.now() - prepareStartedAt;
        const prepared = normalized.file;
        const replaceFileId = identityPhotos[ownerId]?.[documentType]?.fileId ?? "";
        const fileId = await uploadFile(prepared, documentType, ownerId, replaceFileId, {
          normalization: normalized,
          prepareDurationMs,
        });
        if (fileId) {
          setIdentityPhotos((current) => ({
            ...current,
            [ownerId]: {
              ...current[ownerId],
              [documentType]: { file: prepared, fileId, name: prepared.name },
            },
          }));
          setUploadNote(`Đã tải ảnh CCCD ${sideLabel}. Đang đọc QR ngay trên thiết bị…`);
          // Đọc QR trên bản đã chuẩn hóa trước (2400 px vẫn thừa nét cho một mã QR trên thẻ).
          // Chỉ khi thất bại mới thử lại trên ảnh nguồn — làm ngược lại thì mọi ảnh 12MP/HEIC
          // đều phải giải mã hai lần dù bản chuẩn hóa đọc được ngay.
          let qr = await readCitizenIdQr(prepared);
          if (!qr && normalized.changed) qr = await readCitizenIdQr(file);
          setUploadNote(
            applyQrResult(ownerId, qr)
              ? "Đã đọc QR. Kiểm tra và xác nhận các thông tin vừa tự điền."
              : "Không đọc được QR từ ảnh đã tải. Vui lòng nhập thông tin bằng tay.",
          );
        } else {
          setUploadNote("");
        }
      } catch (error) {
        setServerError(
          error instanceof Error ? error.message : "Không thể xử lý ảnh CCCD. Hãy chọn lại ảnh.",
        );
        setUploadNote("");
      } finally {
        setBusy(false);
        setUploadPercent(0);
        uploadAbort.current = null;
      }
    },
    [applyQrResult, identityPhotos, flushDraft, uploadFile],
  );

  const checkExistingRecords = useCallback(
    async (ownerId: string, draftToSave: IntakeDraft = draft) => {
      if (!(await saveDraft(draftToSave))) return;
      setBusy(true);
      setServerError("");
      try {
        const response = await fetchApi("/api/public/submissions/current/existing-records/check", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-public-csrf-token": csrfToken,
            "idempotency-key": crypto.randomUUID(),
          },
          body: JSON.stringify({ ownerId }),
        });
        if (!response.ok) {
          setServerError(
            await readErrorMessage(response, "Chưa kiểm tra được hồ sơ đã có. Vui lòng thử lại."),
          );
          return;
        }
        const result = (await response.json()) as ExistingLookupResult;
        setExistingResults((current) => ({ ...current, [ownerId]: result }));
      } finally {
        setBusy(false);
      }
    },
    [csrfToken, draft, saveDraft],
  );

  const finishWithoutNewCertificate = useCallback(
    async (ownerId: string) => {
      setBusy(true);
      setServerError("");
      try {
        const response = await fetchApi("/api/public/submissions/current/no-action", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-public-csrf-token": csrfToken,
            "idempotency-key": crypto.randomUUID(),
          },
          body: JSON.stringify({ ownerId, confirmAllAlreadySubmitted: true }),
        });
        if (!response.ok) {
          setServerError(await readErrorMessage(response, "Chưa thể hoàn tất tra cứu."));
          return;
        }
        setSubmitted(true);
      } finally {
        setBusy(false);
      }
    },
    [csrfToken],
  );

  const confirmExistingRecords = useCallback(
    async (ownerId: string, result: ExistingLookupResult) => {
      setBusy(true);
      setServerError("");
      try {
        const response = await fetchApi("/api/public/submissions/current/existing-records/link", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-public-csrf-token": csrfToken,
            "idempotency-key": crypto.randomUUID(),
          },
          body: JSON.stringify({
            ownerId,
            existingRecordIds: result.certificates.map((item) => item.existingRecordId),
          }),
        });
        if (!response.ok) {
          setServerError(await readErrorMessage(response, "Chưa xác nhận được các GCN đã có."));
          return;
        }
        setExistingResults((current) => ({
          ...current,
          [ownerId]: { ...current[ownerId], linked: true },
        }));
      } finally {
        setBusy(false);
      }
    },
    [csrfToken],
  );

  const patchTask = useCallback((id: string, patch: Partial<UploadTaskView>) => {
    setUploadTasks((current) =>
      current.map((task) => (task.id === id ? { ...task, ...patch } : task)),
    );
  }, []);

  /** Hủy một việc đang tải; các việc khác chạy tiếp. */
  const cancelTask = useCallback((id: string) => {
    taskAborts.current.get(id)?.abort();
  }, []);

  /** Bỏ một việc đã lỗi khỏi danh sách để người dân gửi được phần còn lại. */
  const dismissTask = useCallback((id: string) => {
    taskAborts.current.delete(id);
    setUploadTasks((current) => current.filter((task) => task.id !== id));
  }, []);

  /**
   * Tải nhiều ảnh Giấy chứng nhận.
   *
   * Trước V2 vòng lặp này tuần tự và `break` ngay khi một ảnh hỏng — chọn 3 ảnh mà ảnh thứ 2 lỗi
   * là mất luôn ảnh thứ 3, dù nó chưa hề được thử. Nay mỗi ảnh là một việc độc lập: tối đa 2 việc
   * chạy song song, một việc hỏng không kéo theo việc nào, và UI chỉ đúng ảnh cần thử lại.
   *
   * Chuẩn hóa ảnh chạy **trong từng việc** chứ không dựng sẵn cả loạt: giữ nhiều bitmap 12MP cùng
   * lúc là đường ngắn nhất tới tab bị trình duyệt kill trên máy yếu.
   */
  const handleCertificateUpload = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      setServerError("");

      const baseIndex = certificatePhotos.length;
      const queued: UploadTaskView[] = files.map((file, index) => ({
        id: newId(),
        documentType: "CERTIFICATE" as UploadDocumentType,
        status: "QUEUED",
        sentBytes: 0,
        totalBytes: file.size,
        errorMessage: "",
        orderIndex: baseIndex + index,
      }));
      setUploadTasks((current) => [...current, ...queued]);

      const concurrency = resolveUploadConcurrency(readConnectionHints());
      const results = await runWithConcurrency(
        queued.map((task, index) => async () => {
          const controller = new AbortController();
          taskAborts.current.set(task.id, controller);
          try {
            patchTask(task.id, { status: "PREPARING" });
            // Ảnh GCN cũng phải qua bước chuyển HEIC như ảnh CCCD: iPhone mặc định chụp HEIC, mà
            // Drive không phải lúc nào cũng nhận dạng được định dạng này khi xác minh sau tải.
            const prepareStartedAt = Date.now();
            const normalized = await normalizeIntakeImage(files[index], "CERTIFICATE");
            const prepareDurationMs = Date.now() - prepareStartedAt;
            const prepared = normalized.file;
            patchTask(task.id, {
              status: "UPLOADING",
              totalBytes: prepared.size,
              sentBytes: 0,
            });

            const fileId = await uploadFile(prepared, "CERTIFICATE", "", "", {
              signal: controller.signal,
              onProgress: (sent) => patchTask(task.id, { sentBytes: sent }),
              normalization: normalized,
              prepareDurationMs,
            });
            if (!fileId) throw new Error("UPLOAD_REJECTED");

            patchTask(task.id, { status: "COMPLETED", sentBytes: prepared.size });
            return { file: prepared, fileId, name: prepared.name, pageLabel: "" };
          } catch (error) {
            patchTask(task.id, {
              status: controller.signal.aborted ? "CANCELLED" : "FAILED",
              errorMessage: controller.signal.aborted
                ? "Đã hủy."
                : error instanceof Error && error.message !== "UPLOAD_REJECTED"
                  ? error.message
                  : "Tải ảnh thất bại. Bấm “Thử lại” hoặc chọn ảnh khác.",
            });
            throw error;
          } finally {
            taskAborts.current.delete(task.id);
          }
        }),
        { concurrency },
      );

      const accepted: UploadedCertificateImage[] = results.flatMap((result) =>
        result.status === "fulfilled" ? [result.value] : [],
      );

      if (accepted.length > 0) {
        updateCertificatePhotos((current) => [...current, ...accepted]);
      }
      // Việc đã xong thì gỡ khỏi danh sách; việc lỗi/hủy ở lại để người dân xử lý.
      setUploadTasks((current) => current.filter((task) => task.status !== "COMPLETED"));

      // Đếm theo tổng số ảnh của cả hồ sơ, không theo lượt chọn tệp vừa rồi — người dân chọn ảnh
      // làm nhiều lượt phải thấy con số cộng dồn đúng.
      const total = certificatePhotos.length + accepted.length;
      setUploadNote(total > 0 ? `Đã tải ${total} ảnh GCN.` : "");
    },
    [uploadFile, updateCertificatePhotos, certificatePhotos.length, patchTask],
  );

  const deleteCertificate = useCallback(
    async (fileId: string) => {
      setBusy(true);
      setServerError("");
      try {
        const response = await fetchApi(`/api/public/submissions/current/files/${fileId}`, {
          method: "DELETE",
          headers: {
            "x-public-csrf-token": csrfToken,
            "idempotency-key": crypto.randomUUID(),
          },
        });
        if (!response.ok) {
          setServerError(
            await readErrorMessage(response, "Chưa xóa được ảnh. Thử lại sau ít phút."),
          );
          return;
        }
        updateCertificatePhotos((current) => current.filter((photo) => photo.fileId !== fileId));
      } finally {
        setBusy(false);
      }
    },
    [csrfToken, updateCertificatePhotos],
  );

  const moveCertificate = useCallback(
    (index: number, direction: -1 | 1) => {
      updateCertificatePhotos((current) => {
        const target = index + direction;
        if (target < 0 || target >= current.length) return current;
        const next = [...current];
        [next[index], next[target]] = [next[target], next[index]];
        return next;
      });
    },
    [updateCertificatePhotos],
  );

  const setCertificateLabel = useCallback(
    (fileId: string, label: string) => {
      updateCertificatePhotos((current) =>
        current.map((photo) => (photo.fileId === fileId ? { ...photo, pageLabel: label } : photo)),
      );
    },
    [updateCertificatePhotos],
  );

  /** Thay một ảnh GCN: tải ảnh mới lên trước, thành công mới xóa mềm ảnh cũ và giữ nguyên vị trí. */
  const replaceCertificate = useCallback(
    async (fileId: string, file: File | null) => {
      if (!file) return;
      uploadAbort.current = new AbortController();
      setBusy(true);
      setServerError("");
      setUploadPercent(0);
      setUploadNote("Đang thay ảnh Giấy chứng nhận…");
      try {
        const prepared = (await normalizeIntakeImage(file, "CERTIFICATE")).file;
        const newFileId = await uploadFile(prepared, "CERTIFICATE", "", fileId);
        if (!newFileId) {
          setUploadNote("");
          return;
        }
        updateCertificatePhotos((current) =>
          current.map((photo) =>
            photo.fileId === fileId
              ? {
                  file: prepared,
                  fileId: newFileId,
                  name: prepared.name,
                  pageLabel: photo.pageLabel,
                }
              : photo,
          ),
        );
        setUploadNote("Đã thay ảnh Giấy chứng nhận.");
      } catch (error) {
        setServerError(
          error instanceof Error ? error.message : "Không thay được ảnh. Hãy thử lại.",
        );
        setUploadNote("");
      } finally {
        setBusy(false);
        setUploadPercent(0);
        uploadAbort.current = null;
      }
    },
    [uploadFile, updateCertificatePhotos],
  );

  /**
   * Đọc lại QR mà không bắt tải thêm ảnh: dùng lại hai ảnh CCCD đã có. Ảnh vừa chọn còn `file`
   * trong bộ nhớ; ảnh khôi phục sau khi tải lại trang chỉ còn `fileId` nên lấy byte qua API rồi
   * dựng lại `File` để giải mã ngay trên thiết bị. Bấm nút là chủ động nên luôn ghi đè (`force`).
   */
  const rereadQr = useCallback(
    async (ownerId: string) => {
      const photos = identityPhotos[ownerId];
      if (!photos?.CITIZEN_ID_BACK && !photos?.CITIZEN_ID_FRONT) return;
      setBusy(true);
      setServerError("");
      setUploadNote("Đang đọc lại QR từ ảnh CCCD đã tải…");
      try {
        // QR nằm ở mặt sau; thử mặt sau trước rồi tới mặt trước.
        const sides: IdentityDocumentType[] = ["CITIZEN_ID_BACK", "CITIZEN_ID_FRONT"];
        let result: CitizenIdQrReadResult | null = null;
        for (const side of sides) {
          const photo = photos?.[side];
          if (!photo) continue;
          let file = photo.file;
          if (!file) {
            const response = await fetchApi(
              `/api/public/submissions/current/files/${photo.fileId}`,
              { method: "GET" },
            );
            if (!response.ok) continue;
            const blob = await response.blob();
            file = new File([blob], photo.name || "cccd.jpg", {
              type: blob.type || "image/jpeg",
            });
          }
          result = await readCitizenIdQr(file);
          if (result) break;
        }
        if (result) applyQrResult(ownerId, result, { force: true });
        setUploadNote(
          result
            ? "Đã đọc lại QR. Kiểm tra và xác nhận các thông tin vừa điền."
            : "Vẫn chưa đọc được QR từ ảnh đã tải. Hãy nhập tay hoặc chọn lại ảnh mặt sau rõ hơn.",
        );
      } catch {
        setServerError("Không đọc lại được QR. Kiểm tra mạng rồi thử lại.");
        setUploadNote("");
      } finally {
        setBusy(false);
      }
    },
    [identityPhotos, applyQrResult],
  );

  const handleSubmit = useCallback(async () => {
    setBusy(true);
    setServerError("");
    try {
      if (!submitIdempotencyKey.current) submitIdempotencyKey.current = crypto.randomUUID();
      const headers: Record<string, string> = {
        "content-type": "application/json",
        "idempotency-key": submitIdempotencyKey.current,
      };
      if (assisted) {
        const csrfResponse = await fetchApi("/api/security/csrf", { method: "GET" });
        if (!csrfResponse.ok) throw new Error("ASSISTED_CSRF_FAILED");
        headers["x-csrf-token"] = ((await csrfResponse.json()) as { csrfToken: string }).csrfToken;
      } else {
        headers["x-public-csrf-token"] = csrfToken;
        headers["x-turnstile-token"] = challengeToken;
      }
      const response = await fetchApi(
        assisted
          ? "/api/staff/assisted-submissions/current/submit"
          : "/api/public/submissions/current/submit",
        {
        method: "POST",
        headers,
        body: JSON.stringify({
          draft: withCertificateMetadata(draft, certificatePhotos),
        }),
      });

      if (!response.ok) {
        submitIdempotencyKey.current = null;
        refreshChallenge();
        setServerError(await readErrorMessage(response, "Chưa gửi được bản kê khai."));
        return;
      }

      submitIdempotencyKey.current = null;
      setSubmitted(true);
    } finally {
      setBusy(false);
    }
  }, [assisted, csrfToken, draft, certificatePhotos, challengeToken, refreshChallenge]);

  const copyReceiptCode = useCallback(() => {
    if (!receipt) return;
    // `navigator.clipboard` không có trên http hoặc trình duyệt cũ; im lặng không sao vì mã vẫn
    // hiển thị to trên màn hình để người dân tự chép.
    void navigator.clipboard
      ?.writeText(receipt.code)
      .then(() => setReceiptCopied(true))
      .catch(() => undefined);
  }, [receipt]);

  /**
   * Bắt đầu một hồ sơ mới ngay trên màn hình thành công.
   *
   * Cán bộ đi thu hồ sơ làm liên tiếp nhiều hộ; bắt quay về trang chủ rồi vào lại từ đầu là thừa
   * một vòng.
   *
   * **Không gọi API tạo hồ sơ ở đây.** Bản đầu tiên của nút này POST thẳng lên endpoint tạo với
   * `phone: ""`, mà cả `/api/public/submissions` lẫn `/api/staff/assisted-submissions` đều bắt
   * buộc `^0\d{9}$` — nên nút luôn trả 400 và không ai kê khai tiếp được. Số điện thoại của hộ
   * **sau** thì lúc bấm nút chưa ai biết; chỉ có thể hỏi ở bước 1.
   *
   * Vì vậy thao tác này thuần cục bộ: dọn sạch PII của hộ trước rồi quay về bước 1. Đường tạo hồ
   * sơ là đúng một đường duy nhất — bấm "Tiếp tục" ở bước 1 sau khi nhập số — nên không có nhánh
   * thứ hai phải bảo trì, và không có lời gọi mạng nào để hỏng.
   *
   * Mã tiếp nhận vừa nhận được đẩy sang danh sách "vừa gửi trong ca" (chỉ trong bộ nhớ trang,
   * không ghi đĩa, không kèm CCCD/tên/điện thoại) để cán bộ vẫn đọc lại được sau khi màn hình đã
   * chuyển sang hộ mới.
   */
  const startNextSubmission = useCallback(() => {
    setRecentReceipts((current) =>
      receipt ? [receipt.code, ...current.filter((code) => code !== receipt.code)].slice(0, 10) : current,
    );

    // Xóa sạch PII của hộ trước. Không giữ lại ảnh, CCCD hay số điện thoại nào.
    setDraft(emptyDraft(newId(), newId(), newId()));
    setIdentityPhotos({});
    setCertificatePhotos([]);
    setUploadTasks([]);
    setExistingResults({});
    setErrors({});
    setServerError("");
    setUploadNote("");
    setReceiptCopied(false);
    setSubmitted(false);
    setStep(STEP_CONTACT_AND_IDENTITY);
    submitIdempotencyKey.current = null;
    draftDirtyRef.current = false;

    // Phiên của hộ trước phải đóng lại: `receipt`/`csrfToken` rỗng buộc bước 1 tạo hồ sơ mới thay
    // vì PATCH tiếp vào bản kê khai vừa gửi.
    setReceipt(null);
    setCsrfToken("");
    setServerVersion(null);
    createIdempotencyKey.current = null;
    try {
      sessionStorage.removeItem(CERT_META_STORAGE_KEY);
      sessionStorage.removeItem(CREATE_IDEMPOTENCY_STORAGE_KEY);
    } catch {
      // Storage riêng tư bị chặn thì thôi; nhãn trang chỉ là dữ liệu trình bày.
    }
    refreshChallenge();
  }, [receipt, refreshChallenge]);

  const goBack = useCallback(() => {
    setErrors({});
    setStep((current) => Math.max(current - 1, 0));
  }, []);

  const individualOwnerCount = useMemo(
    () => draft.owners.filter((owner) => requiresCitizenId(owner.ownerType)).length,
    [draft.owners],
  );

  if (submitted && receipt) {
    return (
      <div className="pc-card pc-step-panel space-y-5 text-center">
        {/*
          Thông báo hoàn thành đặt giữa màn hình và nhận focus ngay.

          Bản cũ chỉ là một dòng tiêu đề lẫn giữa các khối khác, nên cán bộ đi thu hồ sơ báo lại
          là hộ dân không chắc mình đã gửi xong hay chưa. `aria-live` + `tabIndex={-1}` để trình
          đọc màn hình đọc ngay và bàn phím nhảy đúng chỗ.
        */}
        <h2
          ref={successHeadingRef}
          tabIndex={-1}
          className="text-2xl font-bold"
          style={{ color: "var(--accent)", outline: "none" }}
          aria-live="assertive"
        >
          KÊ KHAI THÀNH CÔNG
        </h2>

        <div>
          <p className="text-sm font-semibold" style={{ color: "var(--muted)" }}>
            Mã tiếp nhận
          </p>
          <p className="pc-code text-2xl font-bold">{receipt.code}</p>
          <p className="pc-field-hint">Hãy lưu mã này để tra cứu tiến độ hồ sơ.</p>
        </div>

        <p style={{ color: "var(--muted)" }}>
          Cán bộ sẽ gọi điện tới số bạn đã cung cấp nếu hồ sơ cần bổ sung. Dữ liệu và ảnh giấy tờ đã
          được lưu vào kho của UBND phường.
        </p>

        <div className="flex flex-col items-stretch gap-3 pt-1 sm:flex-row sm:justify-center">
          <button type="button" className="pc-button-secondary" onClick={copyReceiptCode}>
            {receiptCopied ? "Đã sao chép ✓" : "Sao chép mã"}
          </button>
          <button type="button" className="pc-button" onClick={startNextSubmission}>
            Kê khai hồ sơ tiếp theo
          </button>
        </div>

        {recentReceipts.length > 0 ? (
          <div className="pc-field-hint">
            <p className="font-semibold">Đã gửi trong phiên này</p>
            <p className="pc-code">{recentReceipts.join(" · ")}</p>
            <p>Danh sách này mất khi bạn đóng trang. Không chứa thông tin cá nhân của hộ dân.</p>
          </div>
        ) : null}

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link href="/tra-cuu" className="pc-button-quiet">
            Tra cứu hồ sơ
          </Link>
          <Link href="/" className="pc-button-quiet">
            Quay về trang chủ
          </Link>
        </div>

        <p className="pc-field-hint">
          Trang này không tự chuyển đi. Mã tiếp nhận ở trên vẫn hiển thị tới khi bạn tự rời trang.
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

      {assisted ? (
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Cán bộ hỗ trợ: <strong>{assisted.officerName}</strong>
        </p>
      ) : null}

      {receipt ? (
        <div className="pc-card" style={{ borderColor: "var(--accent)" }}>
          <p className="text-sm font-semibold" style={{ color: "var(--muted)" }}>
            Mã tiếp nhận
          </p>
          <p className="pc-code text-xl font-bold">{receipt.code}</p>
          <p className="mt-3 text-sm font-semibold" style={{ color: "var(--muted)" }}>
            Mã bí mật — chỉ hiển thị một lần
          </p>
          <p className="pc-code text-xl font-bold">{receipt.secret}</p>
          <p className="pc-field-hint">
            Chụp màn hình hoặc ghi lại ngay. Mất mã thì phải mang giấy tờ đến UBND phường, không có
            cách khôi phục trực tuyến.
          </p>
        </div>
      ) : null}

      <section className="pc-card pc-step-panel space-y-5">
        {step === 0 ? (
          <>
            {!receipt ? (
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
                      Cổng kê khai trực tuyến hiện chỉ phục vụ trường hợp đã có một Giấy chứng nhận.
                      Đề nghị mang giấy tờ đến Bộ phận một cửa UBND phường Phong Châu để được hướng
                      dẫn.
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
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel"
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
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      id="consentAccepted"
                      name="consentAccepted"
                      aria-invalid={errors.consent ? "true" : undefined}
                      className="mt-1.5 h-5 w-5"
                      checked={draft.consentAccepted}
                      onChange={(event) =>
                        update((next) => {
                          next.consentAccepted = event.target.checked;
                        })
                      }
                    />
                    <label htmlFor="consentAccepted">
                      Tôi đồng ý cung cấp thông tin và ảnh giấy tờ để phục vụ kê khai, đăng ký đất
                      đai trong đợt cao điểm 180 ngày.
                    </label>
                  </div>
                  {errors.consent ? (
                    <p className="pc-field-error" aria-live="polite">
                      {errors.consent}
                    </p>
                  ) : null}
                  <p className="pc-field-hint">
                    Nội dung thông báo bảo vệ dữ liệu cá nhân và thời hạn lưu trữ sẽ được bổ sung
                    nguyên văn trước khi vận hành thật.
                  </p>
                </div>
              </>
            ) : (
              <div className="pc-card" style={{ borderColor: "var(--accent)" }}>
                <p className="font-semibold">Tải ảnh CCCD cho từng người</p>
                <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
                  Bản kê khai đã được tạo. Hãy thêm chủ sử dụng và tải đủ hai mặt CCCD; QR trên ảnh
                  được đọc ngay trên thiết bị để gợi ý tự điền, không dùng OCR.
                </p>
              </div>
            )}
          </>
        ) : null}

        {step === 0 && receipt ? (
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
                <div className="flex flex-col gap-4">
                  <Field label="Loại chủ thể" required>
                    <Select
                      value={owner.ownerType}
                      onChange={(value) =>
                        update((next) => {
                          next.owners[index].ownerType = value as OwnerType;
                          // Vợ/chồng phải là hai dòng cá nhân để mỗi người có một cặp ảnh CCCD.
                          if (
                            value === "VO_CHONG" &&
                            next.owners.filter((candidate) =>
                              requiresCitizenId(candidate.ownerType),
                            ).length < MAX_INDIVIDUAL_OWNERS &&
                            !next.owners.some(
                              (candidate, candidateIndex) =>
                                candidateIndex !== index && candidate.ownerType === "VO_CHONG",
                            )
                          ) {
                            next.owners.push({ ...emptyOwner(newId()), ownerType: "VO_CHONG" });
                          }
                        })
                      }
                      placeholder="— Chọn —"
                      options={OWNER_TYPES.map((type) => ({
                        code: type,
                        label: OWNER_TYPE_LABELS[type],
                      }))}
                    />
                  </Field>
                  {!isOrganisationOwner(owner.ownerType) ? (
                    <label className="flex items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={owner.hasDistinctCurrentUser}
                        onChange={(event) =>
                          update((next) => {
                            next.owners[index].hasDistinctCurrentUser = event.target.checked;
                          })
                        }
                      />
                      <span>
                        Người đứng tên trên Giấy chứng nhận <strong>không còn</strong> là người sử
                        dụng hiện tại (đã mất, thừa kế, tặng cho, chuyển nhượng). Khi đó không cần
                        ảnh CCCD của người trên GCN; chỉ khai thông tin người sử dụng hiện tại bên
                        dưới.
                      </span>
                    </label>
                  ) : null}
                  <Field
                    label={
                      owner.ownerType === "TO_CHUC"
                        ? "Tên tổ chức"
                        : owner.ownerType === "CONG_DONG_DAN_CU"
                          ? "Tên cộng đồng dân cư"
                          : owner.hasDistinctCurrentUser
                            ? "Họ và tên người trên GCN"
                            : "Họ và tên"
                    }
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
                          markManualIdentityEdit(next.owners[index]);
                        })
                      }
                    />
                  </Field>
                  <Field
                    label={
                      isOrganisationOwner(owner.ownerType)
                        ? "Mã số thuế"
                        : owner.hasDistinctCurrentUser
                          ? "Số định danh (CCCD) của người trên GCN"
                          : "Số định danh cá nhân (CCCD)"
                    }
                    required={!owner.hasDistinctCurrentUser}
                    error={errors[`owner-${index}-id`]}
                    hint={
                      isOrganisationOwner(owner.ownerType)
                        ? "Gồm 10 chữ số, hoặc 10 chữ số kèm 3 số đơn vị trực thuộc (0123456789-001)."
                        : owner.hasDistinctCurrentUser
                          ? "Có thể để trống nếu không rõ CCCD của người trên GCN."
                          : "Gồm đúng 12 chữ số."
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
                          markManualIdentityEdit(next.owners[index]);
                        })
                      }
                    />
                  </Field>
                  {isOrganisationOwner(owner.ownerType) ? (
                    <Field
                      label="Địa chỉ trụ sở (nếu biết)"
                      error={errors[`owner-${index}-orgaddress`]}
                    >
                      <textarea
                        className="pc-textarea"
                        value={owner.residenceAddress}
                        onChange={(event) =>
                          update((next) => {
                            next.owners[index].residenceAddress = event.target.value;
                            next.owners[index].identitySource = "MANUAL";
                            next.owners[index].identityStatus = "MANUAL_COMPLETE";
                          })
                        }
                      />
                    </Field>
                  ) : null}
                  {requiresCitizenId(owner.ownerType) && !owner.hasDistinctCurrentUser ? (
                    <>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="Ngày sinh" error={errors[`owner-${index}-dob`]}>
                          <VietnameseDateInput
                            value={owner.dateOfBirth}
                            invalid={Boolean(errors[`owner-${index}-dob`])}
                            bounds={{ minYear: 1900 }}
                            groupLabel="Ngày sinh"
                            onChange={(iso) =>
                              update((next) => {
                                next.owners[index].dateOfBirth = iso;
                                markManualIdentityEdit(next.owners[index]);
                              })
                            }
                          />
                        </Field>
                        <Field label="Giới tính" error={errors[`owner-${index}-gender`]}>
                          <select
                            className="pc-select"
                            value={owner.gender}
                            onChange={(event) =>
                              update((next) => {
                                next.owners[index].gender = event.target.value as "NAM" | "NU" | "";
                                markManualIdentityEdit(next.owners[index]);
                              })
                            }
                          >
                            <option value="">— Chọn —</option>
                            <option value="NAM">Nam</option>
                            <option value="NU">Nữ</option>
                          </select>
                        </Field>
                      </div>
                      <Field label="Địa chỉ thường trú" error={errors[`owner-${index}-address`]}>
                        <textarea
                          className="pc-textarea"
                          value={owner.residenceAddress}
                          onChange={(event) =>
                            update((next) => {
                              next.owners[index].residenceAddress = event.target.value;
                            })
                          }
                        />
                      </Field>
                      {owner.identityStatus === "QR_OVERRIDE_PENDING_REVIEW" ? (
                        <Field
                          label="Lý do sửa thông tin đã đọc từ QR"
                          required
                          error={errors[`owner-${index}-identity-override`]}
                          hint="Sửa địa chỉ không cần lý do; lý do này chỉ áp dụng cho họ tên, CCCD, ngày sinh hoặc giới tính."
                        >
                          <textarea
                            className="pc-textarea"
                            maxLength={500}
                            value={owner.identityOverrideReason}
                            onChange={(event) =>
                              update((next) => {
                                next.owners[index].identityOverrideReason = event.target.value;
                              })
                            }
                          />
                        </Field>
                      ) : null}
                      <div className="order-first rounded-lg border border-stone-200 p-4">
                        <p className="font-semibold">Ảnh CCCD (cần khi nộp GCN mới)</p>
                        <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
                          Chọn đủ mặt trước và mặt sau; hệ thống thử đọc QR từ cả hai ảnh ngay trên
                          thiết bị. Khi QR đọc được và bạn xác nhận thông tin, hệ thống mới kiểm tra
                          GCN đã có. Không cần chụp thêm ảnh thứ ba.
                        </p>
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                          {(["CITIZEN_ID_FRONT", "CITIZEN_ID_BACK"] as const).map(
                            (documentType) => {
                              const isFront = documentType === "CITIZEN_ID_FRONT";
                              const uploaded = identityPhotos[owner.id]?.[documentType];
                              return (
                                <Field
                                  key={documentType}
                                  label={isFront ? "CCCD mặt trước" : "CCCD mặt sau"}
                                  error={errors[`owner-${index}-${isFront ? "front" : "back"}`]}
                                >
                                  {uploaded ? (
                                    <div className="mb-2">
                                      <FilePreview
                                        file={uploaded.file}
                                        fileId={uploaded.fileId}
                                        alt={isFront ? "CCCD mặt trước" : "CCCD mặt sau"}
                                      />
                                    </div>
                                  ) : null}
                                  <label
                                    className={`relative flex flex-col items-center justify-center border-2 border-dashed rounded-xl cursor-pointer transition-all ${
                                      busy ? "opacity-50 pointer-events-none" : "hover:bg-black/5"
                                    } ${uploaded ? "p-3 mt-2" : "p-6 sm:p-8"}`}
                                    style={{
                                      borderColor: "var(--border-strong)",
                                      background: "var(--surface)",
                                    }}
                                  >
                                    <input
                                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                                      type="file"
                                      accept={IMAGE_FILE_ACCEPT}
                                      disabled={busy}
                                      onChange={(event) => {
                                        void handleCitizenIdUpload(
                                          owner.id,
                                          documentType,
                                          event.target.files?.[0] ?? null,
                                        );
                                      }}
                                    />
                                    <div className="flex flex-col items-center text-center space-y-2 pointer-events-none">
                                      {busy ? (
                                        <>
                                          <div className="p-2">
                                            <svg
                                              className="w-6 h-6 animate-spin text-gray-500"
                                              xmlns="http://www.w3.org/2000/svg"
                                              fill="none"
                                              viewBox="0 0 24 24"
                                            >
                                              <circle
                                                className="opacity-25"
                                                cx="12"
                                                cy="12"
                                                r="10"
                                                stroke="currentColor"
                                                strokeWidth="4"
                                              ></circle>
                                              <path
                                                className="opacity-75"
                                                fill="currentColor"
                                                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                              ></path>
                                            </svg>
                                          </div>
                                          <p className="font-semibold text-sm">Đang xử lý ảnh...</p>
                                        </>
                                      ) : uploaded ? (
                                        <div className="flex items-center gap-2">
                                          <svg
                                            className="w-5 h-5"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            stroke="currentColor"
                                            strokeWidth={1.5}
                                            style={{ color: "var(--accent)" }}
                                          >
                                            <path
                                              strokeLinecap="round"
                                              strokeLinejoin="round"
                                              d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                                            />
                                            <path
                                              strokeLinecap="round"
                                              strokeLinejoin="round"
                                              d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
                                            />
                                          </svg>
                                          <p
                                            className="font-medium text-sm"
                                            style={{ color: "var(--text-secondary)" }}
                                          >
                                            Chạm để tải ảnh khác thay thế
                                          </p>
                                        </div>
                                      ) : (
                                        <>
                                          <div
                                            className="p-3 rounded-full shadow-sm"
                                            style={{
                                              background: "var(--gold-100)",
                                              color: "var(--gold-800)",
                                            }}
                                          >
                                            <svg
                                              className="w-6 h-6"
                                              fill="none"
                                              viewBox="0 0 24 24"
                                              stroke="currentColor"
                                              strokeWidth={1.5}
                                            >
                                              <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                                              />
                                              <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
                                              />
                                            </svg>
                                          </div>
                                          <div>
                                            <p className="font-bold text-sm sm:text-base">
                                              Chạm để chụp ảnh / Chọn tệp
                                            </p>
                                            <p
                                              className="text-xs mt-1"
                                              style={{ color: "var(--text-secondary)" }}
                                            >
                                              Ảnh rõ nét, không lóa
                                            </p>
                                          </div>
                                        </>
                                      )}
                                    </div>
                                  </label>
                                </Field>
                              );
                            },
                          )}
                        </div>
                        {identityPhotos[owner.id]?.CITIZEN_ID_FRONT ||
                        identityPhotos[owner.id]?.CITIZEN_ID_BACK ? (
                          <div className="mt-3">
                            <button
                              type="button"
                              className="pc-button-quiet"
                              disabled={busy}
                              onClick={() => void rereadQr(owner.id)}
                            >
                              Đọc lại QR từ ảnh đã tải
                            </button>
                            <p className="pc-field-hint">
                              Dùng lại hai ảnh CCCD đã tải để thử đọc QR — không cần chụp thêm ảnh
                              mới.
                            </p>
                          </div>
                        ) : null}
                        {owner.identityStatus === "PENDING_CONFIRMATION" ? (
                          <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-950">
                            <span>
                              QR đã tự điền thông tin. Hãy đối chiếu ảnh trước khi xác nhận.
                            </span>
                            <button
                              className="pc-button-quiet"
                              type="button"
                              data-invalid={errors[`owner-${index}-identity`] ? "true" : undefined}
                              onClick={() => {
                                const next = structuredClone(draft);
                                next.owners[index].identityStatus = "QR_CONFIRMED";
                                next.owners[index].identityConfirmedAt = new Date().toISOString();
                                setDraft(next);
                                void checkExistingRecords(owner.id, next);
                              }}
                            >
                              Xác nhận và kiểm tra hồ sơ đã có
                            </button>
                          </div>
                        ) : null}
                        {existingResults[owner.id] ? (
                          <div className="mt-3 rounded-lg border border-stone-200 p-3 text-sm">
                            {existingResults[owner.id].matched ? (
                              <>
                                <p className="font-semibold text-emerald-800">
                                  Đã tìm thấy GCN trong dữ liệu đã xác minh — không cần nộp lại các
                                  GCN này.
                                </p>
                                <ul className="mt-2 list-disc pl-5">
                                  {existingResults[owner.id].certificates.map((certificate) => (
                                    <li key={certificate.existingRecordId}>
                                      Số {certificate.issueNumberMasked}, cấp ngày{" "}
                                      {certificate.issueDate || "chưa rõ"}
                                    </li>
                                  ))}
                                </ul>
                                <p className="mt-3">
                                  Nếu còn GCN khác chưa có trong danh sách, tiếp tục kê khai GCN mới
                                  ở các bước sau.
                                </p>
                                <button
                                  className="pc-button-quiet mt-3"
                                  type="button"
                                  disabled={busy || existingResults[owner.id].linked}
                                  onClick={() =>
                                    void confirmExistingRecords(owner.id, existingResults[owner.id])
                                  }
                                >
                                  {existingResults[owner.id].linked
                                    ? "Đã xác nhận các GCN này"
                                    : "Xác nhận các GCN này là đúng"}
                                </button>
                                {existingResults[owner.id].canFinishNoAction ? (
                                  <button
                                    className="pc-button-quiet mt-3"
                                    type="button"
                                    disabled={busy}
                                    onClick={() => void finishWithoutNewCertificate(owner.id)}
                                  >
                                    Tôi không có GCN khác — hoàn tất tại đây
                                  </button>
                                ) : null}
                              </>
                            ) : (
                              <p>
                                Chưa tìm thấy GCN đã xác minh. Vui lòng tiếp tục kê khai GCN mới.
                              </p>
                            )}
                            {existingResults[owner.id].pendingWarning ? (
                              <p className="mt-2 text-amber-800">
                                Hệ thống có một hồ sơ đang xử lý với thông tin này. Bạn vẫn có thể
                                tiếp tục kê khai; cán bộ phường sẽ đối chiếu, hệ thống không liên
                                kết tự động.
                              </p>
                            ) : null}
                          </div>
                        ) : null}
                        {errors[`owner-${index}-identity`] ? (
                          <p className="pc-field-error">{errors[`owner-${index}-identity`]}</p>
                        ) : null}
                      </div>
                    </>
                  ) : null}
                  {owner.hasDistinctCurrentUser ? (
                    <div
                      className="flex flex-col gap-4 rounded-lg border p-4"
                      style={{
                        background: "var(--warning-surface)",
                        borderColor: "var(--warning-border)",
                      }}
                    >
                      <p className="font-semibold">Người sử dụng đất hiện tại</p>
                      <p className="-mt-2 text-sm" style={{ color: "var(--muted)" }}>
                        Khai người đang thực tế sử dụng thửa đất. Cán bộ sẽ đối chiếu giấy tờ thừa
                        kế / sang tên khi duyệt.
                      </p>
                      <Field
                        label="Tên người sử dụng hiện tại"
                        error={errors[`owner-${index}-cu-name`]}
                      >
                        <input
                          className="pc-input"
                          value={owner.currentUserName}
                          aria-invalid={errors[`owner-${index}-cu-name`] ? "true" : undefined}
                          onChange={(event) =>
                            update((next) => {
                              next.owners[index].currentUserName = event.target.value;
                            })
                          }
                        />
                      </Field>
                      <Field
                        label="Số định danh cá nhân (CCCD)"
                        error={errors[`owner-${index}-cu-id`]}
                        hint="Gồm đúng 12 chữ số."
                      >
                        <input
                          className="pc-input"
                          inputMode="numeric"
                          value={owner.currentUserCitizenId}
                          aria-invalid={errors[`owner-${index}-cu-id`] ? "true" : undefined}
                          onChange={(event) =>
                            update((next) => {
                              next.owners[index].currentUserCitizenId = event.target.value.trim();
                            })
                          }
                        />
                      </Field>
                      <Field
                        label="Địa chỉ thường trú (2 cấp)"
                        error={errors[`owner-${index}-cu-address`]}
                      >
                        <textarea
                          className="pc-textarea"
                          value={owner.currentUserAddress}
                          onChange={(event) =>
                            update((next) => {
                              next.owners[index].currentUserAddress = event.target.value;
                            })
                          }
                        />
                      </Field>
                      <Field
                        label="Lý do thay đổi"
                        error={errors[`owner-${index}-cu-reason`]}
                        hint="Vì sao người trên GCN không còn là người sử dụng."
                      >
                        <Select
                          value={owner.changeReason}
                          onChange={(value) =>
                            update((next) => {
                              next.owners[index].changeReason = value;
                            })
                          }
                          invalid={Boolean(errors[`owner-${index}-cu-reason`])}
                          placeholder="— Chọn —"
                          options={CHANGE_REASON_OPTIONS}
                        />
                      </Field>
                    </div>
                  ) : null}
                  <Field
                    label="Vai trò trên GCN (nếu biết)"
                    error={errors[`owner-${index}-role`]}
                    hint="Ghi theo phần người sử dụng đất in trên bìa Giấy chứng nhận. Không rõ thì để trống."
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
              disabled={individualOwnerCount >= MAX_INDIVIDUAL_OWNERS}
            >
              + Thêm chủ sử dụng (tối đa {MAX_INDIVIDUAL_OWNERS} người)
            </button>
            {uploadNote ? (
              <div
                className="mt-6 flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl border shadow-sm transition-all pc-fade-in"
                style={{
                  background: "var(--surface)",
                  borderColor: "var(--accent)",
                  borderLeftWidth: "4px",
                }}
                aria-live="polite"
              >
                <div className="flex items-center gap-3">
                  {busy ? (
                    <svg
                      className="w-5 h-5 animate-spin"
                      style={{ color: "var(--accent)" }}
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                  ) : (
                    <svg
                      className="w-5 h-5 text-emerald-600"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                  <p className="font-medium text-sm sm:text-base">
                    {uploadNote}
                    {busy && uploadPercent > 0 ? ` (${uploadPercent}%)` : ""}
                  </p>
                </div>
                {busy ? (
                  <button
                    type="button"
                    className="text-sm font-semibold underline px-3 py-1.5 rounded-lg hover:bg-black/5 transition-colors"
                    style={{ color: "var(--danger)" }}
                    onClick={cancelUpload}
                  >
                    Hủy tải ảnh
                  </button>
                ) : null}
              </div>
            ) : null}
          </>
        ) : null}

        {step === 1 ? (
          <>
            <div className="pc-card" style={{ borderColor: "var(--accent)" }}>
              <p className="font-semibold">Chụp rõ toàn bộ Giấy chứng nhận</p>
              <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
                Không che góc, không lóa sáng, chụp đủ các trang có chữ. Đây là phần quan trọng nhất
                — cán bộ đối chiếu mọi thông tin còn lại trên chính các ảnh này.
              </p>
            </div>
            <Field
              label="Ảnh Giấy chứng nhận"
              required
              error={errors.certificatePhotos}
              hint={`Từ 1 đến ${MAX_CERTIFICATE_PHOTOS} ảnh, chụp đủ các trang có thông tin.`}
            >
              <label
                className={`relative flex flex-col items-center justify-center p-8 sm:p-10 border-2 border-dashed rounded-xl cursor-pointer transition-all ${
                  certificateSlotsLeft <= 0 ? "opacity-50 pointer-events-none" : "hover:bg-black/5"
                }`}
                style={{ borderColor: "var(--border-strong)", background: "var(--surface)" }}
              >
                <input
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                  type="file"
                  accept={IMAGE_FILE_ACCEPT}
                  multiple
                  disabled={certificateSlotsLeft <= 0}
                  onChange={(event) => {
                    void handleCertificateUpload(
                      Array.from(event.target.files ?? []).slice(0, certificateSlotsLeft),
                    );
                  }}
                />
                <div className="flex flex-col items-center text-center space-y-3 pointer-events-none">
                  {busy ? (
                    <>
                      <div className="p-3">
                        <svg
                          className="w-8 h-8 animate-spin text-gray-500"
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          ></circle>
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          ></path>
                        </svg>
                      </div>
                      <p className="font-bold text-lg">Đang xử lý ảnh...</p>
                    </>
                  ) : (
                    <>
                      <div
                        className="p-4 rounded-full shadow-sm"
                        style={{ background: "var(--gold-100)", color: "var(--gold-800)" }}
                      >
                        <svg
                          className="w-8 h-8"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={1.5}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                          />
                        </svg>
                      </div>
                      <div>
                        <p className="font-bold text-lg">Chạm để chụp ảnh / Chọn nhiều tệp</p>
                        <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
                          Có thể chọn nhiều ảnh cùng lúc
                        </p>
                      </div>
                    </>
                  )}
                </div>
              </label>
            </Field>
            {certificatePhotos.length > 0 ? (
              <ul className="space-y-3">
                {certificatePhotos.map((photo, photoIndex) => (
                  <li key={photo.fileId} className="pc-card">
                    <div className="grid gap-3 sm:grid-cols-[9rem_1fr]">
                      <div style={{ maxWidth: "9rem" }}>
                        <FilePreview
                          file={photo.file}
                          fileId={photo.fileId}
                          alt={`Ảnh Giấy chứng nhận ${photoIndex + 1}`}
                        />
                      </div>
                      <div className="space-y-2">
                        <p className="text-sm font-semibold">
                          Ảnh {photoIndex + 1}/{certificatePhotos.length}
                        </p>
                        <Field
                          label="Nhãn trang (không bắt buộc)"
                          hint="Ví dụ: trang 1 — mặt trước bìa; trang 2 — sơ đồ thửa."
                        >
                          <input
                            className="pc-input"
                            maxLength={120}
                            value={photo.pageLabel}
                            placeholder="Ghi trang này là gì"
                            onChange={(event) =>
                              setCertificateLabel(photo.fileId, event.target.value)
                            }
                          />
                        </Field>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            className="pc-button-quiet"
                            disabled={busy || photoIndex === 0}
                            onClick={() => moveCertificate(photoIndex, -1)}
                          >
                            ↑ Lên
                          </button>
                          <button
                            type="button"
                            className="pc-button-quiet"
                            disabled={busy || photoIndex === certificatePhotos.length - 1}
                            onClick={() => moveCertificate(photoIndex, 1)}
                          >
                            ↓ Xuống
                          </button>
                          <label
                            className="pc-button-quiet"
                            style={{
                              cursor: busy ? "default" : "pointer",
                              color: "var(--accent)",
                            }}
                          >
                            <div className="flex items-center gap-1.5">
                              <svg
                                className="w-4 h-4"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={2}
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                                />
                              </svg>
                              <span className="font-medium">Thay ảnh</span>
                            </div>
                            <input
                              type="file"
                              accept={IMAGE_FILE_ACCEPT}
                              hidden
                              disabled={busy}
                              onChange={(event) =>
                                void replaceCertificate(
                                  photo.fileId,
                                  event.target.files?.[0] ?? null,
                                )
                              }
                            />
                          </label>
                          <button
                            type="button"
                            className="pc-button-quiet"
                            style={{ color: "var(--danger)" }}
                            disabled={busy}
                            onClick={() => void deleteCertificate(photo.fileId)}
                          >
                            Xóa
                          </button>
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}

            {/*
              Danh sách từng việc tải, thay cho một thanh phần trăm chung.

              Một thanh chung không nói được ảnh nào đang chạy, ảnh nào hỏng, và khi có ảnh hỏng
              thì người dân không biết phải làm lại ảnh nào. Nhãn dùng "Trang GCN 1", KHÔNG dùng
              tên tệp gốc — tên do máy ảnh hoặc người dân đặt hay mang số CCCD và tên người.
            */}
            {uploadTasks.length > 0 ? (
              <ul className="space-y-2" aria-live="polite">
                {uploadTasks.map((task) => (
                  <li
                    key={task.id}
                    className="pc-card"
                    style={{
                      borderLeftWidth: "4px",
                      borderLeftColor:
                        task.status === "FAILED" || task.status === "CANCELLED"
                          ? "var(--danger)"
                          : "var(--accent)",
                    }}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold text-sm">
                        {uploadTaskLabel(task.documentType, task.orderIndex)}
                      </p>
                      <p className="text-sm" style={{ color: "var(--muted)" }}>
                        {task.status === "QUEUED"
                          ? "Đang chờ"
                          : task.status === "PREPARING"
                            ? "Đang chuẩn bị ảnh…"
                            : task.status === "UPLOADING"
                              ? `Đang tải ${taskPercent(task)}%`
                              : task.status === "CANCELLED"
                                ? "Đã hủy"
                                : task.status === "FAILED"
                                  ? "Tải lỗi"
                                  : "Xong"}
                      </p>
                    </div>
                    {task.status === "UPLOADING" ? (
                      <div
                        className="mt-2 h-2 w-full overflow-hidden rounded-full"
                        style={{ background: "var(--surface-muted, rgba(0,0,0,0.08))" }}
                        role="progressbar"
                        aria-valuenow={taskPercent(task)}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={`Tiến độ ${uploadTaskLabel(task.documentType, task.orderIndex)}`}
                      >
                        <div
                          className="h-full transition-all"
                          style={{
                            width: `${taskPercent(task)}%`,
                            background: "var(--accent)",
                          }}
                        />
                      </div>
                    ) : null}
                    {task.errorMessage ? (
                      <p className="pc-field-error mt-2">{task.errorMessage}</p>
                    ) : null}
                    <div className="mt-2 flex flex-wrap gap-2">
                      {task.status === "UPLOADING" ||
                      task.status === "QUEUED" ||
                      task.status === "PREPARING" ? (
                        <button
                          type="button"
                          className="pc-button-quiet"
                          style={{ color: "var(--danger)" }}
                          onClick={() => cancelTask(task.id)}
                        >
                          Hủy ảnh này
                        </button>
                      ) : null}
                      {task.status === "FAILED" || task.status === "CANCELLED" ? (
                        <button
                          type="button"
                          className="pc-button-quiet"
                          onClick={() => dismissTask(task.id)}
                        >
                          Bỏ ảnh này
                        </button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}

            {uploadNote && uploadTasks.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--muted)" }} aria-live="polite">
                {uploadNote}
              </p>
            ) : null}

            <div className="pc-card">
              <h3 className="text-base font-semibold">
                Thông tin trên Giấy chứng nhận — nếu đọc được
              </h3>
              <p className="pc-field-hint mt-1 mb-4">
                Ghi <strong>theo đúng Giấy chứng nhận</strong>. Không tìm thấy thì để trống — cán bộ
                sẽ đối chiếu trên chính ảnh bạn vừa tải.
              </p>
              <div className="space-y-4">
                <Field label="Số phát hành GCN" error={errors.issueNumber}>
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
                <Field label="Ngày cấp GCN" error={errors.issueDate}>
                  <VietnameseDateInput
                    value={draft.certificate.issueDate}
                    invalid={Boolean(errors.issueDate)}
                    bounds={{ minYear: 1987 }}
                    groupLabel="Ngày cấp Giấy chứng nhận"
                    onChange={(iso) =>
                      update((next) => {
                        next.certificate.issueDate = iso;
                      })
                    }
                  />
                  <p className="pc-field-hint">
                    Gõ thẳng ngày, tháng, năm bằng bàn phím số — không phải lùi từng tháng trên
                    lịch.
                  </p>
                </Field>
                <Field label="Số vào sổ GCN" error={errors.registryNumber}>
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
              </div>
            </div>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <div className="pc-card">
              <p className="font-semibold">Mọi ô ở bước này đều có thể để trống</p>
              <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
                Chỉ ghi những gì bạn <strong>đọc được trên Giấy chứng nhận</strong>. Không chắc thì
                bỏ qua và bấm Tiếp tục — cán bộ sẽ đọc trên ảnh bạn đã tải.
              </p>
            </div>
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
                  <Field
                    label="Tổ dân phố nơi có thửa đất (nếu biết)"
                    hint="Là nơi có mảnh đất, không phải nơi bạn đang ở. Ở nơi khác hoặc không rõ thì chọn “Chưa xác định”."
                  >
                    <Select
                      value={parcel.addressTwoLevel}
                      onChange={(value) =>
                        update((next) => {
                          next.parcels[index].addressTwoLevel = value;
                        })
                      }
                      placeholder="— Chưa chọn —"
                      options={NEIGHBORHOOD_OPTIONS}
                    />
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field
                      label="Số tờ bản đồ"
                      error={errors[`parcel-${index}-mapsheet`]}
                      hint="Ghi theo GCN."
                    >
                      <input
                        className="pc-input"
                        value={parcel.mapSheetNumber}
                        aria-invalid={errors[`parcel-${index}-mapsheet`] ? "true" : undefined}
                        onChange={(event) =>
                          update((next) => {
                            next.parcels[index].mapSheetNumber = event.target.value;
                          })
                        }
                      />
                    </Field>
                    <Field
                      label="Số thửa"
                      error={errors[`parcel-${index}-parcelnumber`]}
                      hint="Ghi theo GCN."
                    >
                      <input
                        className="pc-input"
                        value={parcel.parcelNumber}
                        aria-invalid={errors[`parcel-${index}-parcelnumber`] ? "true" : undefined}
                        onChange={(event) =>
                          update((next) => {
                            next.parcels[index].parcelNumber = event.target.value;
                          })
                        }
                      />
                    </Field>
                  </div>
                  <Field
                    label="Diện tích (m²)"
                    error={errors[`parcel-${index}-area`]}
                    hint="Ghi theo GCN. Dùng dấu phẩy cho phần lẻ, ví dụ 29,16."
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
                  {/*
                    Ký hiệu loại đất: một ô chữ tự do thay cho danh mục 45 mục đích + nguồn gốc +
                    hình thức + thời hạn của bản cũ. GCN đất nông nghiệp chỉ in ký hiệu ("LUC",
                    "LUK", "màu", "vườn") chứ không in tên pháp lý — bắt hộ dân tự tra ra "đất
                    chuyên trồng lúa" là bắt họ làm việc của cán bộ. Chuỗi gốc lưu nguyên vào
                    `purposeFreeText` kèm mã "ghi theo bìa"; cán bộ chuẩn hóa ở `working_payload`.
                  */}
                  <Field
                    label="Ký hiệu loại đất ghi trên GCN"
                    error={errors[`use-${index}-0-purposefree`]}
                    hint="Ví dụ: LUC, LUK, BHK, ONT… hoặc chữ ghi trên bìa như “màu”, “vườn”. Không biết có thể để trống."
                  >
                    <input
                      className="pc-input"
                      maxLength={MAX_PURPOSE_FREE_TEXT_LENGTH}
                      value={parcel.landUses[0]?.purposeFreeText ?? ""}
                      aria-invalid={errors[`use-${index}-0-purposefree`] ? "true" : undefined}
                      onChange={(event) =>
                        update((next) => {
                          setRawLandPurpose(next.parcels[index], event.target.value);
                        })
                      }
                      onBlur={(event) =>
                        update((next) => {
                          setRawLandPurpose(
                            next.parcels[index],
                            normalizeLandPurposeFreeText(event.target.value),
                          );
                        })
                      }
                    />
                  </Field>
                  <Field
                    label="Thửa đất thuộc đơn vị nào trước sáp nhập? (nếu biết)"
                    error={errors[`parcel-${index}-oldward`]}
                    hint="Xem tên xã/phường in trên bìa GCN. Giúp cán bộ đối chiếu số tờ bản đồ cũ với bản đồ hiện nay."
                  >
                    <Select
                      value={parcel.oldWard}
                      invalid={Boolean(errors[`parcel-${index}-oldward`])}
                      onChange={(value) =>
                        update((next) => {
                          next.parcels[index].oldWard = value;
                        })
                      }
                      placeholder="— Chưa chọn —"
                      options={OLD_WARD_OPTIONS}
                    />
                  </Field>
                  <Field
                    label="Địa chỉ thửa đất ghi trên GCN (nếu chép được)"
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

        {step === 3 ? (
          <div className="space-y-4">
            <h2 className="text-xl font-bold">Kiểm tra lại trước khi gửi</h2>
            <p className="-mt-2 text-sm" style={{ color: "var(--muted)" }}>
              Cần sửa mục nào, bấm “Sửa” ở góc phải mục đó để quay lại đúng bước.
            </p>

            {/*
              Checklist chỉ liệt kê điều kiện BẮT BUỘC. Các thông tin còn lại nằm ở khối "Cán bộ
              sẽ bổ sung" bên dưới và không được hiển thị như lỗi — người dân bỏ trống là đúng
              thiết kế, không phải làm sai.
            */}
            <div className="pc-card">
              <h3 className="text-base font-semibold">Điều kiện bắt buộc</h3>
              <ul className="mt-3 space-y-2 text-sm">
                {checklist.map((item) => (
                  <li key={item.key} className="flex items-start gap-2">
                    <span
                      aria-hidden="true"
                      style={{
                        color: item.done ? "var(--accent)" : "var(--danger)",
                        fontWeight: 700,
                      }}
                    >
                      {item.done ? "✓" : "✕"}
                    </span>
                    <span style={{ color: item.done ? undefined : "var(--danger)" }}>
                      {item.label}
                      <span className="sr-only">{item.done ? " — đã có" : " — còn thiếu"}</span>
                    </span>
                  </li>
                ))}
              </ul>
              {checklist.every((item) => item.done) ? null : (
                <p className="pc-field-error mt-3" aria-live="polite">
                  Còn mục đánh dấu ✕ ở trên. Bấm “Sửa” ở khối tương ứng để bổ sung.
                </p>
              )}
            </div>

            <div className="pc-card">
              <h3 className="text-base font-semibold">Thông tin không bắt buộc</h3>
              <p className="pc-field-hint mt-1">
                Bỏ trống không sao — cán bộ đối chiếu trên ảnh Giấy chứng nhận bạn đã tải.
              </p>
              <ul className="mt-3 space-y-2 text-sm">
                {optionalItems.map((item) => (
                  <li key={item.key} className="flex items-start justify-between gap-3">
                    <span>{item.label}</span>
                    <span
                      className="shrink-0 text-sm font-semibold"
                      style={{ color: item.done ? "var(--accent)" : "var(--muted)" }}
                    >
                      {item.done ? "Đã nhập" : "Cán bộ sẽ bổ sung"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <ReviewBlock title="Chủ sử dụng và CCCD" onEdit={() => setStep(0)}>
              <ul className="space-y-3 text-sm">
                {draft.owners.map((owner, ownerIndex) => (
                  <li
                    key={owner.id}
                    className="border-t pt-2 first:border-t-0 first:pt-0"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <p className="font-semibold">
                      {ownerIndex + 1}. {owner.fullName || "(chưa có tên)"} —{" "}
                      {OWNER_TYPE_LABELS[owner.ownerType]}
                    </p>
                    <p>
                      {isOrganisationOwner(owner.ownerType) ? "Mã số thuế" : "CCCD"}:{" "}
                      {owner.identityNumber || "cán bộ sẽ đọc trên ảnh"}
                    </p>
                    {ownerNeedsIdentityPhotos(owner.ownerType, owner.hasDistinctCurrentUser) ? (
                      <p
                        style={{
                          color:
                            identityPhotos[owner.id]?.CITIZEN_ID_FRONT &&
                            identityPhotos[owner.id]?.CITIZEN_ID_BACK
                              ? undefined
                              : "var(--danger)",
                        }}
                      >
                        Ảnh CCCD:{" "}
                        {identityPhotos[owner.id]?.CITIZEN_ID_FRONT
                          ? "mặt trước đã tải"
                          : "CHƯA CÓ mặt trước"}
                        {", "}
                        {identityPhotos[owner.id]?.CITIZEN_ID_BACK
                          ? "mặt sau đã tải"
                          : "CHƯA CÓ mặt sau"}
                      </p>
                    ) : null}
                    {owner.hasDistinctCurrentUser ? (
                      <p style={{ color: "var(--muted)" }}>
                        Người sử dụng hiện tại: {owner.currentUserName || "—"}
                        {owner.changeReason
                          ? ` — ${optionLabel(CHANGE_REASON_OPTIONS, owner.changeReason)}`
                          : ""}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </ReviewBlock>

            <ReviewBlock title="Ảnh Giấy chứng nhận" onEdit={() => setStep(1)}>
              {certificatePhotos.length > 0 ? (
                <>
                  <p className="text-sm">Đã tải {certificatePhotos.length} ảnh.</p>
                  <ol className="mt-1 list-decimal pl-5 text-sm">
                    {certificatePhotos.map((photo) => (
                      <li key={photo.fileId}>{photo.pageLabel.trim() || "Chưa đặt nhãn trang"}</li>
                    ))}
                  </ol>
                </>
              ) : (
                <p className="text-sm" style={{ color: "var(--danger)" }}>
                  Chưa có ảnh Giấy chứng nhận.
                </p>
              )}
              <dl className="mt-3 space-y-1 text-sm">
                <div>
                  <dt className="inline font-semibold">Số phát hành: </dt>
                  <dd className="inline">{draft.certificate.issueNumber || "cán bộ sẽ bổ sung"}</dd>
                </div>
                <div>
                  <dt className="inline font-semibold">Ngày cấp: </dt>
                  <dd className="inline">
                    {formatVnDate(draft.certificate.issueDate) || "cán bộ sẽ bổ sung"}
                  </dd>
                </div>
                <div>
                  <dt className="inline font-semibold">Số vào sổ: </dt>
                  <dd className="inline">
                    {draft.certificate.registryNumber || "cán bộ sẽ bổ sung"}
                  </dd>
                </div>
              </dl>
            </ReviewBlock>

            <ReviewBlock title="Thửa đất" onEdit={() => setStep(2)}>
              <ul className="space-y-3 text-sm">
                {draft.parcels.map((parcel, parcelIndex) => (
                  <li
                    key={parcel.id}
                    className="border-t pt-2 first:border-t-0 first:pt-0"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <p className="font-semibold">
                      Thửa {parcelIndex + 1}
                      {parcel.parcelNumber ? ` — số thửa ${parcel.parcelNumber}` : ""}
                    </p>
                    <p>
                      Tổ dân phố:{" "}
                      {optionLabel(NEIGHBORHOOD_OPTIONS, parcel.addressTwoLevel) ||
                        "cán bộ sẽ xác định"}
                    </p>
                    <p>
                      Số tờ: {parcel.mapSheetNumber || "—"} · Diện tích: {parcel.area || "—"} m²
                    </p>
                    <p>Ký hiệu loại đất: {landPurposeDisplay(parcel.landUses[0])}</p>
                    <p style={{ color: "var(--muted)" }}>
                      Đơn vị cũ: {optionLabel(OLD_WARD_OPTIONS, parcel.oldWard) || "—"} · Địa chỉ
                      trên GCN: {parcel.addressOnCertificate || "—"}
                    </p>
                  </li>
                ))}
              </ul>
            </ReviewBlock>

            <ReviewBlock title="Điện thoại liên hệ" onEdit={() => setStep(0)}>
              <p className="text-sm">{draft.phone || "—"}</p>
            </ReviewBlock>

            <p style={{ color: "var(--muted)" }}>
              Sau khi gửi, bản kê khai sẽ bị khóa. Bạn chỉ sửa được khi cán bộ yêu cầu bổ sung.
            </p>
          </div>
        ) : null}
      </section>

      {serverError ? (
        <div
          ref={serverErrorRef}
          tabIndex={-1}
          className="pc-card"
          style={{ borderColor: "var(--danger)", color: "var(--danger)", outline: "none" }}
          role="alert"
          aria-live="assertive"
        >
          {serverError}
        </div>
      ) : null}

      {challengeAction && !outOfScope ? (
        <div>
          <TurnstileWidget
            key={`${challengeAction}-${challengeNonce}`}
            action={challengeAction}
            onToken={handleChallengeToken}
          />
          {challengeToken ? null : (
            <p className="text-sm" style={{ color: "var(--muted)" }} aria-live="polite">
              Đang xác minh bạn không phải chương trình tự động. Nếu ô kiểm tra không hiện, kiểm tra
              lại kết nối mạng rồi tải lại trang.
            </p>
          )}
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
            disabled={outOfScope || busy || (challengeAction !== null && !challengeToken)}
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
            disabled={busy || (!assisted && !challengeToken)}
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
          chính để được cán bộ hướng dẫn kê khai trực tiếp. Hoặc liên hệ trưởng khu, cán bộ phụ
          trách địa bàn theo danh bạ dưới đây.
        </p>

        <p className="mt-4 font-semibold">Tư vấn chung</p>
        <p className="mt-1">
          {GENERAL_SUPPORT_CONTACT.officerName} —{" "}
          <a className="font-semibold underline" href={`tel:${GENERAL_SUPPORT_CONTACT.phone}`}>
            {GENERAL_SUPPORT_CONTACT.phone}
          </a>
        </p>

        <p className="mt-4 font-semibold">Cán bộ phụ trách theo tổ dân phố</p>
        <ul className="mt-2 space-y-3">
          {SUPPORT_CONTACTS.map((contact) => (
            <li key={`${contact.neighborhood}-${contact.officerName}`}>
              <span className="font-semibold">TDP {contact.neighborhood}</span>{" "}
              <span style={{ color: "var(--muted)" }}>({contact.areas})</span>
              <br />
              {contact.officerName}
              {contact.phone ? (
                <>
                  {" — "}
                  {/* `tel:` để người dân bấm gọi thẳng trên điện thoại, không phải chép tay. */}
                  <a className="font-semibold underline" href={`tel:${contact.phone}`}>
                    {contact.phone}
                  </a>
                </>
              ) : (
                <span style={{ color: "var(--muted)" }}>
                  {" "}
                  — liên hệ qua đầu mối tư vấn chung ở trên
                </span>
              )}
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
