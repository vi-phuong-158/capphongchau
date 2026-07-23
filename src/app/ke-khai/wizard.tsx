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

import { SearchableSelect } from "@/components/searchable-select";
import { TurnstileWidget } from "@/components/turnstile-widget";
import { VietnameseDateInput } from "@/components/vietnamese-date-input";
import {
  ASSET_TYPE_OPTIONS,
  CERTIFICATE_ROLE_CODES,
  CERTIFICATE_ROLE_OPTIONS,
  CHANGE_REASON_CODES,
  CHANGE_REASON_OPTIONS,
  normalizeCertificateRole,
  LAND_ORIGIN_OPTIONS,
  LAND_PURPOSE_CAN_DOI_CHIEU,
  LAND_PURPOSE_GHI_THEO_BIA,
  LAND_PURPOSE_SELECT_OPTIONS,
  LAND_USE_FORM_OPTIONS,
  LAND_USE_TERM_OPTIONS,
  NEIGHBORHOOD_HINTS,
  OLD_WARD_OPTIONS,
  type ReferenceOption,
} from "@/modules/public-intake/reference";
import { parseVietnameseDecimal } from "@/modules/public-intake/vietnamese-number";
import { canonicalImageMimeType, IMAGE_FILE_ACCEPT } from "@/modules/public-intake/image-format";
import { lastSecretGroup } from "@/modules/public-intake/receipt-code";
import {
  SUPPORT_CONTACTS,
  GENERAL_SUPPORT_CONTACT,
} from "@/modules/public-intake/support-contacts";
import { uploadWithResume, UploadCancelledError } from "@/modules/public-intake/resumable-upload";
import {
  prepareCitizenIdImage,
  readCitizenIdQr,
  type CitizenIdQrReadResult,
} from "@/modules/public-intake/citizen-id-qr.client";
import {
  MAX_LAND_USES_PER_PARCEL,
  OWNER_TYPES,
  OWNER_TYPE_LABELS,
  emptyAsset,
  emptyDraft,
  emptyLandUse,
  emptyOwner,
  emptyParcel,
  isOrganisationOwner,
  requiresCitizenId,
  type CertificateFileMetadata,
  type IntakeDraft,
  type LandUse,
  type OwnerType,
} from "@/modules/public-intake/types";
import { LAND_USE_AREA_TOLERANCE_M2 } from "@/modules/public-intake/validation";

const STEPS = [
  "Khởi tạo và ảnh CCCD",
  "Thông tin GCN",
  "Thửa đất",
  "Loại đất",
  "Tài sản",
  "Tải ảnh GCN",
  "Kiểm tra và gửi",
] as const;

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

/** ISO `YYYY-MM-DD` → `DD/MM/YYYY` cho trang kiểm tra cuối; giá trị khác giữ nguyên. */
function formatVnDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  return match ? `${match[3]}/${match[2]}/${match[1]}` : iso.trim();
}

function genderText(gender: string): string {
  if (gender === "NAM") return "Nam";
  if (gender === "NU") return "Nữ";
  return "";
}

/** Loại đất để hiển thị: xử lý hai lối thoát ngoài danh mục như khi xuất PL3. */
function landPurposeDisplay(landUse: LandUse): string {
  if (landUse.purposeCode === LAND_PURPOSE_GHI_THEO_BIA) {
    const text = landUse.purposeFreeText.trim();
    return text ? `${text} (ghi theo bìa)` : "(chưa ghi loại đất)";
  }
  if (landUse.purposeCode === LAND_PURPOSE_CAN_DOI_CHIEU) return "Đề nghị cán bộ đối chiếu";
  if (!landUse.purposeCode) return "(chưa chọn)";
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

export function IntakeWizard() {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<IntakeDraft>(() => emptyDraft(newId(), newId(), newId()));
  const [errors, setErrors] = useState<Errors>({});

  const [certificateCount, setCertificateCount] = useState("");
  const [hasCertificate, setHasCertificate] = useState("");

  const [receipt, setReceipt] = useState<{ code: string; secret: string } | null>(null);
  const [secretEcho, setSecretEcho] = useState("");
  const [secretConfirmed, setSecretConfirmed] = useState(false);

  const [identityPhotos, setIdentityPhotos] = useState<IdentityPhotos>({});
  const [certificatePhotos, setCertificatePhotos] = useState<UploadedCertificateImage[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [existingResults, setExistingResults] = useState<Record<string, ExistingLookupResult>>({});

  const [csrfToken, setCsrfToken] = useState("");
  // Token Turnstile gắn với đúng hành động sinh ra nó; đổi bước là token cũ hết giá trị.
  const [challenge, setChallenge] = useState<{ action: string; token: string }>({
    action: "",
    token: "",
  });
  const [challengeNonce, setChallengeNonce] = useState(0);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("IDLE");
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState("");
  const [uploadNote, setUploadNote] = useState("");
  const [uploadPercent, setUploadPercent] = useState(0);
  const uploadAbort = useRef<AbortController | null>(null);
  const createIdempotencyKey = useRef<string | null>(null);
  const submitIdempotencyKey = useRef<string | null>(null);
  const serverErrorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (serverError && serverErrorRef.current) {
      serverErrorRef.current.focus();
    }
  }, [serverError]);

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
  const challengeAction: "create" | "submit" | null =
    step === 0 && !receipt ? "create" : step === STEPS.length - 1 ? "submit" : null;
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

  const update = useCallback((mutate: (next: IntakeDraft) => void) => {
    setDraft((current) => {
      const next = structuredClone(current);
      mutate(next);
      return next;
    });
  }, []);

  const validate = useCallback((): Errors => {
    const found: Errors = {};

    if (step === 0 && !receipt) {
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

    if (step === 0 && receipt) {
      draft.owners.forEach((owner, index) => {
        if (!owner.fullName.trim()) found[`owner-${index}-name`] = "Bắt buộc theo Phụ lục 8.";
        if (!CERTIFICATE_ROLE_CODES.includes(owner.roleOnCertificate)) {
          found[`owner-${index}-role`] = "Chọn một vai trò trong danh mục.";
        }
        if (isOrganisationOwner(owner.ownerType)) {
          if (!/^\d{10}(-\d{3})?$/.test(owner.identityNumber.trim())) {
            found[`owner-${index}-id`] = "Mã số thuế gồm 10 chữ số.";
          }
          if (!owner.residenceAddress.trim()) {
            found[`owner-${index}-orgaddress`] = "Cần địa chỉ trụ sở.";
          }
        } else if (owner.hasDistinctCurrentUser) {
          // Người trên GCN đã mất / đã sang tên: CCCD của họ tùy có, nhưng người sử dụng hiện tại
          // phải khai đủ (cột O, P và trường 14, 15 của PL3).
          if (owner.identityNumber.trim() && !/^\d{12}$/.test(owner.identityNumber.trim())) {
            found[`owner-${index}-id`] = "CCCD gồm đúng 12 chữ số (có thể để trống).";
          }
          if (!owner.currentUserName.trim())
            found[`owner-${index}-cu-name`] = "Cần tên người sử dụng hiện tại.";
          if (!/^\d{12}$/.test(owner.currentUserCitizenId.trim()))
            found[`owner-${index}-cu-id`] = "CCCD người sử dụng hiện tại gồm đúng 12 chữ số.";
          if (!owner.currentUserAddress.trim())
            found[`owner-${index}-cu-address`] = "Cần địa chỉ thường trú.";
          if (!CHANGE_REASON_CODES.includes(owner.changeReason))
            found[`owner-${index}-cu-reason`] = "Chọn lý do thay đổi.";
        } else if (!/^\d{12}$/.test(owner.identityNumber)) {
          found[`owner-${index}-id`] = "CCCD gồm đúng 12 chữ số.";
        }
        if (requiresCitizenId(owner.ownerType) && !owner.hasDistinctCurrentUser) {
          if (!owner.dateOfBirth) found[`owner-${index}-dob`] = "Cần ngày sinh.";
          if (!owner.gender) found[`owner-${index}-gender`] = "Cần giới tính.";
          if (!owner.residenceAddress.trim())
            found[`owner-${index}-address`] = "Cần địa chỉ thường trú.";
          if (owner.identityStatus === "PENDING_CONFIRMATION") {
            found[`owner-${index}-identity`] = "Xem và xác nhận thông tin đọc từ QR.";
          }
          if (!identityPhotos[owner.id]?.CITIZEN_ID_FRONT) {
            found[`owner-${index}-front`] = "Cần ảnh CCCD mặt trước.";
          }
          if (!identityPhotos[owner.id]?.CITIZEN_ID_BACK) {
            found[`owner-${index}-back`] = "Cần ảnh CCCD mặt sau.";
          }
        }
      });
    }

    if (step === 2) {
      draft.parcels.forEach((parcel, index) => {
        if (!parcel.addressOnCertificate.trim())
          found[`parcel-${index}-address`] = "Bắt buộc theo Phụ lục 8.";
        if (!parcel.oldWard)
          found[`parcel-${index}-oldward`] = "Chọn một mục; không rõ thì chọn “Không rõ”.";
        const area = parseVietnameseDecimal(parcel.area);
        if (area === null || area <= 0) found[`parcel-${index}-area`] = "Nhập diện tích lớn hơn 0.";
      });
    }

    if (step === 3) {
      draft.parcels.forEach((parcel, parcelIndex) => {
        if (parcel.landUses.length > MAX_LAND_USES_PER_PARCEL) {
          found[`parcel-${parcelIndex}-usecount`] =
            `Chỉ ghi tối đa ${MAX_LAND_USES_PER_PARCEL} mục đích sử dụng cho mỗi thửa. Xóa bớt dòng thừa.`;
        }
        parcel.landUses.forEach((landUse, useIndex) => {
          const key = `use-${parcelIndex}-${useIndex}`;
          if (!landUse.purposeCode) found[`${key}-purpose`] = "Bắt buộc theo Phụ lục 8.";
          if (
            landUse.purposeCode === LAND_PURPOSE_GHI_THEO_BIA &&
            !landUse.purposeFreeText.trim()
          ) {
            found[`${key}-purposefree`] = "Nhập loại đất ghi trên bìa Giấy chứng nhận.";
          }
          if (!landUse.originCode) found[`${key}-origin`] = "Bắt buộc theo Phụ lục 8.";
          if (!landUse.formCode) found[`${key}-form`] = "Bắt buộc theo Phụ lục 8.";
          if (!landUse.termCode) found[`${key}-term`] = "Bắt buộc theo Phụ lục 8.";
        });

        const declared = parcel.landUses
          .map((landUse) => parseVietnameseDecimal(landUse.area))
          .filter((value): value is number => value !== null && value > 0);
        const parcelArea = parseVietnameseDecimal(parcel.area);
        if (declared.length > 0 && parcelArea !== null && parcelArea > 0) {
          const total = declared.reduce((sum, value) => sum + value, 0);
          if (total - parcelArea > LAND_USE_AREA_TOLERANCE_M2) {
            found[`parcel-${parcelIndex}-usearea`] =
              `Tổng diện tích theo mục đích (${total} m²) vượt diện tích thửa (${parcelArea} m²).`;
          }
        }
      });
    }

    if (step === 5) {
      if (!secretConfirmed) found.secretEcho = "Cần xác nhận đã lưu mã bí mật trước khi tải ảnh.";
      if (certificatePhotos.length < 1) found.certificatePhotos = "Cần ít nhất một ảnh GCN.";
    }

    return found;
  }, [
    step,
    draft,
    hasCertificate,
    certificateCount,
    receipt,
    secretConfirmed,
    identityPhotos,
    certificatePhotos,
  ]);

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
          }),
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
    },
    [csrfToken, draft, certificatePhotos],
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
  const adoptServerDraft = useCallback(async (): Promise<boolean> => {
    try {
      const response = await fetchApi("/api/public/submissions/current", { method: "GET" });
      if (!response.ok) {
        return false;
      }
      const body = (await response.json()) as {
        draft: (IntakeDraft & { owners?: unknown }) | null;
        files?: ServerFileSummary[];
      };
      let restoredDraft: IntakeDraft | null = null;
      if (body.draft) {
        if (!Array.isArray(body.draft.owners)) return false;
        // Nháp lưu trước 2026-07-22 mang mã vai trò cũ, không còn trong danh mục PL3. Đổi ngay lúc
        // tải về, nếu không ô "Vai trò trên GCN" hiện trống và người dân không hiểu vì sao.
        restoredDraft = {
          ...body.draft,
          owners: body.draft.owners.map((owner) => ({
            ...owner,
            roleOnCertificate: normalizeCertificateRole(owner.roleOnCertificate),
          })),
        } as IntakeDraft;
        setDraft(restoredDraft);
      }
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
        applyCertMeta(restoredCertificates, restoredDraft?.certificateFileMetadata),
      );
      return true;
    } catch {
      return false;
    }
  }, []);

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
      setSecretConfirmed(true);
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
                  "x-turnstile-token": challengeToken,
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
        setReceipt({ code: created.receiptCode, secret: created.accessSecret });
        setCsrfToken(created.csrfToken);
        createIdempotencyKey.current = null;
        try {
          sessionStorage.removeItem(CREATE_IDEMPOTENCY_STORAGE_KEY);
        } catch {
          // Không có gì cần làm nếu storage bị chặn.
        }
        // Đồng bộ ID chủ sử dụng với máy chủ trước khi người dân kịp chọn ảnh CCCD ở ngay bước
        // này; thiếu bước đồng bộ thì `ownerId` gửi kèm ảnh là ID lạ và máy chủ trả 400.
        if (!(await adoptServerDraft())) {
          setServerError(
            "Đã tạo được bản kê khai nhưng chưa tải được dữ liệu về máy. Ghi lại mã ở trên, kiểm tra mạng rồi bấm Tiếp tục để thử lại.",
          );
        }
        // Giữ nguyên bước đầu: ngay sau khi tạo nháp/thư mục Drive, người dân tải ảnh CCCD tại
        // chính màn hình này thay vì phải đi qua toàn bộ biểu mẫu rồi mới quay lại.
        return;
      } else if (!(await saveDraft())) {
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
    draft.phone,
    saveDraft,
    challengeToken,
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
    ): Promise<string | null> => {
      // Ảnh nhận qua Zalo/Messenger hay tải về từ trình duyệt thường có `File.type` rỗng hoặc là
      // bí danh `image/jpg`. Quy về tên chuẩn ngay ở đây để không bị từ chối oan.
      const declaredMimeType = canonicalImageMimeType(file.type, file.name);
      if (!declaredMimeType) {
        setServerError(
          `Không nhận dạng được định dạng của tệp "${file.name}". Hãy chọn ảnh JPG, PNG, WebP hoặc HEIC.`,
        );
        return null;
      }

      const initiate = await fetchApi("/api/public/submissions/current/uploads/initiate", {
        method: "POST",
        headers: { "content-type": "application/json", "x-public-csrf-token": csrfToken },
        body: JSON.stringify({
          documentType,
          ownerId,
          replaceFileId,
          fileName: file.name,
          mimeType: declaredMimeType,
          sizeBytes: file.size,
        }),
      });

      if (!initiate.ok) {
        setServerError(await readErrorMessage(initiate, "Không tạo được phiên tải lên."));
        return null;
      }

      // Dùng đúng loại máy chủ đã đăng ký với phiên, không dùng lại `file.type`.
      const { uploadUrl, mimeType } = (await initiate.json()) as {
        uploadUrl: string;
        mimeType: string;
      };

      let id: string;
      try {
        id = await uploadWithResume({
          uploadUrl,
          file,
          contentType: mimeType,
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
        return null;
      }

      const complete = await fetchApi("/api/public/submissions/current/uploads/complete", {
        method: "POST",
        headers: { "content-type": "application/json", "x-public-csrf-token": csrfToken },
        body: JSON.stringify({ driveFileId: id, documentType, ownerId, replaceFileId }),
      });

      if (!complete.ok) {
        setServerError(await readErrorMessage(complete, "Ảnh tải lên không hợp lệ."));
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
        // đẩy bản nháp lên trước, rồi mới tải ảnh.
        if (!(await saveDraft())) {
          setUploadNote("");
          return;
        }
        const prepared = await prepareCitizenIdImage(file);
        const replaceFileId = identityPhotos[ownerId]?.[documentType]?.fileId ?? "";
        const fileId = await uploadFile(prepared, documentType, ownerId, replaceFileId);
        if (fileId) {
          setIdentityPhotos((current) => ({
            ...current,
            [ownerId]: {
              ...current[ownerId],
              [documentType]: { file: prepared, fileId, name: prepared.name },
            },
          }));
          setUploadNote(`Đã tải ảnh CCCD ${sideLabel}. Đang đọc QR ngay trên thiết bị…`);
          setUploadNote(
            applyQrResult(ownerId, await readCitizenIdQr(prepared))
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
    [applyQrResult, identityPhotos, saveDraft, uploadFile],
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

  const handleCertificateUpload = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      uploadAbort.current = new AbortController();
      setBusy(true);
      setServerError("");
      const accepted: UploadedCertificateImage[] = [];
      try {
        for (const [index, file] of files.entries()) {
          setUploadPercent(0);
          setUploadNote(`Đang tải ảnh GCN ${index + 1}/${files.length}…`);
          // Ảnh GCN cũng phải qua bước chuyển HEIC như ảnh CCCD: iPhone mặc định chụp HEIC, mà
          // Drive không phải lúc nào cũng nhận dạng được định dạng này khi xác minh sau tải.
          const prepared = await prepareCitizenIdImage(file);
          const fileId = await uploadFile(prepared, "CERTIFICATE");
          if (!fileId) {
            break;
          }
          accepted.push({ file: prepared, fileId, name: prepared.name, pageLabel: "" });
        }
        setCertificatePhotos((current) => {
          const next = [...current, ...accepted];
          writeCertMeta(next);
          return next;
        });
        // Đếm theo tổng số ảnh của cả hồ sơ, không theo lượt chọn tệp vừa rồi — người dân chọn ảnh
        // làm nhiều lượt phải thấy con số cộng dồn đúng.
        const total = certificatePhotos.length + accepted.length;
        setUploadNote(total > 0 ? `Đã tải ${total} ảnh GCN.` : "");
      } finally {
        setBusy(false);
        setUploadPercent(0);
        uploadAbort.current = null;
      }
    },
    [uploadFile, certificatePhotos.length],
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
        setCertificatePhotos((current) => {
          const next = current.filter((photo) => photo.fileId !== fileId);
          writeCertMeta(next);
          return next;
        });
      } finally {
        setBusy(false);
      }
    },
    [csrfToken],
  );

  const moveCertificate = useCallback((index: number, direction: -1 | 1) => {
    setCertificatePhotos((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      writeCertMeta(next);
      return next;
    });
  }, []);

  const setCertificateLabel = useCallback((fileId: string, label: string) => {
    setCertificatePhotos((current) => {
      const next = current.map((photo) =>
        photo.fileId === fileId ? { ...photo, pageLabel: label } : photo,
      );
      writeCertMeta(next);
      return next;
    });
  }, []);

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
        const prepared = await prepareCitizenIdImage(file);
        const newFileId = await uploadFile(prepared, "CERTIFICATE", "", fileId);
        if (!newFileId) {
          setUploadNote("");
          return;
        }
        setCertificatePhotos((current) => {
          const next = current.map((photo) =>
            photo.fileId === fileId
              ? {
                  file: prepared,
                  fileId: newFileId,
                  name: prepared.name,
                  pageLabel: photo.pageLabel,
                }
              : photo,
          );
          writeCertMeta(next);
          return next;
        });
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
    [uploadFile],
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
      const response = await fetchApi("/api/public/submissions/current/submit", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-public-csrf-token": csrfToken,
          "x-turnstile-token": challengeToken,
          "idempotency-key": submitIdempotencyKey.current,
        },
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
  }, [csrfToken, draft, certificatePhotos, challengeToken, refreshChallenge]);

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

  const individualOwnerCount = useMemo(
    () => draft.owners.filter((owner) => requiresCitizenId(owner.ownerType)).length,
    [draft.owners],
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
                Gõ thẳng ngày, tháng, năm bằng bàn phím số — không phải lùi từng tháng trên lịch.
              </p>
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
                          next.owners[index].identitySource = "MANUAL";
                          next.owners[index].identityStatus = "MANUAL_COMPLETE";
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
                          next.owners[index].identitySource = "MANUAL";
                          next.owners[index].identityStatus = "MANUAL_COMPLETE";
                        })
                      }
                    />
                  </Field>
                  {isOrganisationOwner(owner.ownerType) ? (
                    <Field
                      label="Địa chỉ trụ sở"
                      required
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
                        <Field label="Ngày sinh" required error={errors[`owner-${index}-dob`]}>
                          <VietnameseDateInput
                            value={owner.dateOfBirth}
                            invalid={Boolean(errors[`owner-${index}-dob`])}
                            bounds={{ minYear: 1900 }}
                            groupLabel="Ngày sinh"
                            onChange={(iso) =>
                              update((next) => {
                                next.owners[index].dateOfBirth = iso;
                                next.owners[index].identitySource = "MANUAL";
                                next.owners[index].identityStatus = "MANUAL_COMPLETE";
                              })
                            }
                          />
                        </Field>
                        <Field label="Giới tính" required error={errors[`owner-${index}-gender`]}>
                          <select
                            className="pc-select"
                            value={owner.gender}
                            onChange={(event) =>
                              update((next) => {
                                next.owners[index].gender = event.target.value as "NAM" | "NU" | "";
                                next.owners[index].identitySource = "MANUAL";
                                next.owners[index].identityStatus = "MANUAL_COMPLETE";
                              })
                            }
                          >
                            <option value="">— Chọn —</option>
                            <option value="NAM">Nam</option>
                            <option value="NU">Nữ</option>
                          </select>
                        </Field>
                      </div>
                      <Field
                        label="Địa chỉ thường trú"
                        required
                        error={errors[`owner-${index}-address`]}
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
                                  <input
                                    className="pc-input"
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
                                  {uploaded ? (
                                    <div className="mt-2 space-y-1">
                                      <FilePreview
                                        file={uploaded.file}
                                        fileId={uploaded.fileId}
                                        alt={isFront ? "CCCD mặt trước" : "CCCD mặt sau"}
                                      />
                                      <p className="pc-field-hint">
                                        Đã tải. Chọn tệp khác ở trên để thay riêng mặt này.
                                      </p>
                                    </div>
                                  ) : null}
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
                        required
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
                        required
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
                        required
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
                        required
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
              disabled={individualOwnerCount >= MAX_INDIVIDUAL_OWNERS}
            >
              + Thêm chủ sử dụng (tối đa {MAX_INDIVIDUAL_OWNERS} người)
            </button>
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
        ) : null}

        {step === 2 ? (
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
                    label="Thửa đất thuộc đơn vị nào trước sáp nhập?"
                    required
                    error={errors[`parcel-${index}-oldward`]}
                    hint="Xem tên xã/phường in trên bìa GCN. Cần thông tin này để đối chiếu số tờ bản đồ cũ với bản đồ hiện nay."
                  >
                    <Select
                      value={parcel.oldWard}
                      invalid={Boolean(errors[`parcel-${index}-oldward`])}
                      onChange={(value) =>
                        update((next) => {
                          next.parcels[index].oldWard = value;
                        })
                      }
                      placeholder="— Chọn —"
                      options={OLD_WARD_OPTIONS}
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

        {step === 3 ? (
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
                        <Field
                          label="Loại đất"
                          required
                          error={errors[`${key}-purpose`]}
                          hint="Gõ vài chữ để tìm trong 45 loại đất. Không thấy loại phù hợp thì chọn một lối thoát ở cuối danh sách."
                        >
                          <SearchableSelect
                            value={landUse.purposeCode}
                            onChange={(value) =>
                              update((next) => {
                                const target = next.parcels[parcelIndex].landUses[useIndex];
                                target.purposeCode = value;
                                // Đổi sang loại có mã thì bỏ chữ tự do đã nhập cho "ghi theo bìa".
                                if (value !== LAND_PURPOSE_GHI_THEO_BIA)
                                  target.purposeFreeText = "";
                              })
                            }
                            invalid={Boolean(errors[`${key}-purpose`])}
                            placeholder="— Chọn hoặc gõ để tìm —"
                            options={LAND_PURPOSE_SELECT_OPTIONS}
                          />
                        </Field>
                        {landUse.purposeCode === LAND_PURPOSE_GHI_THEO_BIA ? (
                          <Field
                            label="Loại đất ghi trên bìa"
                            required
                            error={errors[`${key}-purposefree`]}
                            hint="Ví dụ: đất thổ cư, đất vườn, đất ao — chép đúng chữ trên Giấy chứng nhận."
                          >
                            <input
                              className="pc-input"
                              value={landUse.purposeFreeText}
                              aria-invalid={errors[`${key}-purposefree`] ? "true" : undefined}
                              onChange={(event) =>
                                update((next) => {
                                  next.parcels[parcelIndex].landUses[useIndex].purposeFreeText =
                                    event.target.value;
                                })
                              }
                            />
                          </Field>
                        ) : null}
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
                  {errors[`parcel-${parcelIndex}-usecount`] ? (
                    <p className="pc-field-error">{errors[`parcel-${parcelIndex}-usecount`]}</p>
                  ) : null}
                  <button
                    type="button"
                    className="pc-button-quiet"
                    onClick={() =>
                      update((next) => {
                        next.parcels[parcelIndex].landUses.push(emptyLandUse(newId()));
                      })
                    }
                    disabled={parcel.landUses.length >= MAX_LAND_USES_PER_PARCEL}
                  >
                    + Thêm mục đích sử dụng (tối đa {MAX_LAND_USES_PER_PARCEL})
                  </button>
                  {parcel.landUses.length >= MAX_LAND_USES_PER_PARCEL ? (
                    <p className="pc-field-hint">
                      Biểu mẫu tổng hợp của cơ quan chỉ có chỗ cho {MAX_LAND_USES_PER_PARCEL} loại
                      đất mỗi thửa. Nếu Giấy chứng nhận ghi nhiều hơn, đề nghị liên hệ cán bộ hỗ
                      trợ.
                    </p>
                  ) : null}
                </div>
              </div>
            ))}
          </>
        ) : null}

        {step === 4 ? (
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

        {step === 5 ? (
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
                  label="Ảnh Giấy chứng nhận"
                  required
                  error={errors.certificatePhotos}
                  hint={`Từ 1 đến ${MAX_CERTIFICATE_PHOTOS} ảnh, chụp đủ các trang có thông tin.`}
                >
                  <input
                    className="pc-input"
                    type="file"
                    accept={IMAGE_FILE_ACCEPT}
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
                                style={{ cursor: busy ? "default" : "pointer" }}
                              >
                                Thay ảnh
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

        {step === 6 ? (
          <div className="space-y-4">
            <h2 className="text-xl font-bold">Kiểm tra lại trước khi gửi</h2>
            <p className="-mt-2 text-sm" style={{ color: "var(--muted)" }}>
              Đọc kỹ toàn bộ nội dung dưới đây. Cần sửa mục nào, bấm “Sửa” ở góc phải mục đó để quay
              lại đúng bước.
            </p>

            <ReviewBlock title="Giấy chứng nhận" onEdit={() => setStep(1)}>
              <dl className="space-y-1 text-sm">
                <div>
                  <dt className="inline font-semibold">Số phát hành: </dt>
                  <dd className="inline">{draft.certificate.issueNumber || "—"}</dd>
                </div>
                <div>
                  <dt className="inline font-semibold">Ngày cấp: </dt>
                  <dd className="inline">{formatVnDate(draft.certificate.issueDate) || "—"}</dd>
                </div>
                <div>
                  <dt className="inline font-semibold">Số vào sổ: </dt>
                  <dd className="inline">{draft.certificate.registryNumber || "—"}</dd>
                </div>
              </dl>
            </ReviewBlock>

            <ReviewBlock title="Chủ sử dụng" onEdit={() => setStep(0)}>
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
                      {owner.identityNumber || "—"}
                    </p>
                    {requiresCitizenId(owner.ownerType) && !owner.hasDistinctCurrentUser ? (
                      <>
                        <p>
                          Ngày sinh: {formatVnDate(owner.dateOfBirth) || "—"} · Giới tính:{" "}
                          {genderText(owner.gender) || "—"}
                        </p>
                        <p>Địa chỉ: {owner.residenceAddress || "—"}</p>
                        <p>
                          Ảnh CCCD:{" "}
                          {identityPhotos[owner.id]?.CITIZEN_ID_FRONT
                            ? "mặt trước đã tải"
                            : "thiếu mặt trước"}
                          {", "}
                          {identityPhotos[owner.id]?.CITIZEN_ID_BACK
                            ? "mặt sau đã tải"
                            : "thiếu mặt sau"}
                        </p>
                      </>
                    ) : null}
                    {owner.hasDistinctCurrentUser ? (
                      <p style={{ color: "var(--muted)" }}>
                        Người sử dụng hiện tại: {owner.currentUserName || "—"} —{" "}
                        {optionLabel(CHANGE_REASON_OPTIONS, owner.changeReason)}
                      </p>
                    ) : null}
                    <p>
                      Vai trò trên GCN:{" "}
                      {optionLabel(CERTIFICATE_ROLE_OPTIONS, owner.roleOnCertificate) || "—"}
                    </p>
                  </li>
                ))}
              </ul>
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
                    <p>Địa chỉ trên GCN: {parcel.addressOnCertificate || "—"}</p>
                    <p>
                      Đơn vị cũ: {optionLabel(OLD_WARD_OPTIONS, parcel.oldWard) || "—"} · Diện tích:{" "}
                      {parcel.area || "—"} m²
                    </p>
                  </li>
                ))}
              </ul>
            </ReviewBlock>

            <ReviewBlock title="Loại đất" onEdit={() => setStep(3)}>
              <ul className="space-y-3 text-sm">
                {draft.parcels.map((parcel, parcelIndex) => (
                  <li key={parcel.id}>
                    <p className="font-semibold">Thửa {parcelIndex + 1}</p>
                    <ul className="list-disc pl-5">
                      {parcel.landUses.map((landUse) => (
                        <li key={landUse.id}>
                          {landPurposeDisplay(landUse)}
                          {landUse.area ? ` — ${landUse.area} m²` : ""} ·{" "}
                          {optionLabel(LAND_ORIGIN_OPTIONS, landUse.originCode) || "?"} ·{" "}
                          {optionLabel(LAND_USE_FORM_OPTIONS, landUse.formCode) || "?"} ·{" "}
                          {optionLabel(LAND_USE_TERM_OPTIONS, landUse.termCode) || "?"}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </ReviewBlock>

            <ReviewBlock title="Tài sản gắn liền với đất" onEdit={() => setStep(4)}>
              {draft.assets.length > 0 ? (
                <ul className="list-disc pl-5 text-sm">
                  {draft.assets.map((asset) => (
                    <li key={asset.id}>
                      {optionLabel(ASSET_TYPE_OPTIONS, asset.assetType) || "(chưa chọn loại)"}
                      {asset.description ? ` — ${asset.description}` : ""}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm" style={{ color: "var(--muted)" }}>
                  Không khai tài sản.
                </p>
              )}
            </ReviewBlock>

            <ReviewBlock title="Ảnh Giấy chứng nhận" onEdit={() => setStep(5)}>
              {certificatePhotos.length > 0 ? (
                <ol className="list-decimal pl-5 text-sm">
                  {certificatePhotos.map((photo) => (
                    <li key={photo.fileId}>{photo.pageLabel.trim() || "Chưa đặt nhãn trang"}</li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm" style={{ color: "var(--danger)" }}>
                  Chưa có ảnh Giấy chứng nhận.
                </p>
              )}
            </ReviewBlock>

            <ReviewBlock title="Điện thoại liên hệ">
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
            disabled={busy || !challengeToken}
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
