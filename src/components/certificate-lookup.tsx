"use client";

import { useCallback, useRef, useState } from "react";

import { TurnstileWidget } from "@/components/turnstile-widget";
import { VietnameseDateInput } from "@/components/vietnamese-date-input";
import {
  prepareCitizenIdImage,
  readCitizenIdQr,
} from "@/modules/public-intake/citizen-id-qr.client";
import { IMAGE_FILE_ACCEPT } from "@/modules/public-intake/image-format";

interface LookupResult {
  found: boolean;
  status: "IN_PROCESSING" | "OFFICIALLY_RECEIVED" | null;
  guidance: string;
}

type LookupMethod = "QR" | "CERTIFICATE";
type ScanState =
  | { step: "idle" }
  | { step: "decoding" }
  | { step: "decoded"; identityNumber: string; fullName: string }
  | { step: "checking"; identityNumber: string; fullName: string }
  | { step: "done"; result: LookupResult };

const STATUS_LABELS: Record<NonNullable<LookupResult["status"]>, string> = {
  IN_PROCESSING: "Đang xử lý",
  OFFICIALLY_RECEIVED: "Đã tiếp nhận chính thức",
};

async function readErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    return body.error?.message ?? fallback;
  } catch {
    return fallback;
  }
}

/**
 * Tra cứu công khai theo một trong hai bằng chứng người dân đang có: QR CCCD hoặc số phát hành +
 * ngày cấp GCN. Cả hai nhánh dùng cùng Turnstile và chỉ render DTO tối thiểu do máy chủ trả về.
 */
export function CertificateLookup() {
  const [method, setMethod] = useState<LookupMethod>("QR");
  const [scan, setScan] = useState<ScanState>({ step: "idle" });
  const [issueNumber, setIssueNumber] = useState("");
  const [issueDate, setIssueDate] = useState("");
  const [certificateResult, setCertificateResult] = useState<LookupResult | null>(null);
  const [certificateChecking, setCertificateChecking] = useState(false);
  const [error, setError] = useState("");
  const [challenge, setChallenge] = useState("");
  const [challengeKey, setChallengeKey] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const onToken = useCallback((token: string) => setChallenge(token), []);

  const resetChallenge = useCallback(() => {
    setChallenge("");
    setChallengeKey((value) => value + 1);
  }, []);

  const resetQr = useCallback(() => {
    setScan({ step: "idle" });
    setError("");
    resetChallenge();
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [resetChallenge]);

  const resetCertificate = useCallback(() => {
    setCertificateResult(null);
    setError("");
    resetChallenge();
  }, [resetChallenge]);

  const changeMethod = useCallback(
    (nextMethod: LookupMethod) => {
      setMethod(nextMethod);
      setError("");
      setScan({ step: "idle" });
      setCertificateResult(null);
      resetChallenge();
    },
    [resetChallenge],
  );

  const handleFile = useCallback(async (file: File | null) => {
    if (!file) return;
    setError("");
    setScan({ step: "decoding" });
    try {
      const prepared = await prepareCitizenIdImage(file);
      const decoded = await readCitizenIdQr(prepared);
      if (!decoded) {
        setScan({ step: "idle" });
        setError(
          "Không đọc được mã QR từ ảnh này. Hãy chụp rõ mặt có mã QR (thường là mặt sau CCCD) và thử lại.",
        );
        return;
      }
      setScan({
        step: "decoded",
        identityNumber: decoded.parsed.identityNumber,
        fullName: decoded.parsed.fullName,
      });
    } catch {
      setScan({ step: "idle" });
      setError("Không thể xử lý ảnh vừa chọn. Hãy thử lại với ảnh khác.");
    }
  }, []);

  const checkQr = useCallback(async () => {
    if (scan.step !== "decoded" || !challenge) return;
    const { identityNumber, fullName } = scan;
    setScan({ step: "checking", identityNumber, fullName });
    setError("");
    try {
      const response = await fetch("/api/public/certificate-lookup", {
        method: "POST",
        headers: { "content-type": "application/json", "x-turnstile-token": challenge },
        body: JSON.stringify({ method: "CITIZEN_ID_QR", identityNumber, fullName }),
      });
      if (!response.ok) {
        setError(await readErrorMessage(response, "Chưa kiểm tra được. Vui lòng thử lại."));
        setScan({ step: "decoded", identityNumber, fullName });
        resetChallenge();
        return;
      }
      setScan({ step: "done", result: (await response.json()) as LookupResult });
    } catch {
      setError("Không thể kết nối máy chủ. Vui lòng thử lại.");
      setScan({ step: "decoded", identityNumber, fullName });
    }
  }, [challenge, resetChallenge, scan]);

  const checkCertificate = useCallback(async () => {
    if (!challenge || !issueNumber.trim() || !issueDate) return;
    setCertificateChecking(true);
    setCertificateResult(null);
    setError("");
    try {
      const response = await fetch("/api/public/certificate-lookup", {
        method: "POST",
        headers: { "content-type": "application/json", "x-turnstile-token": challenge },
        body: JSON.stringify({ method: "CERTIFICATE_NUMBER", issueNumber, issueDate }),
      });
      if (!response.ok) {
        setError(await readErrorMessage(response, "Chưa kiểm tra được. Vui lòng thử lại."));
        resetChallenge();
        return;
      }
      setCertificateResult((await response.json()) as LookupResult);
    } catch {
      setError("Không thể kết nối máy chủ. Vui lòng thử lại.");
    } finally {
      setCertificateChecking(false);
    }
  }, [challenge, issueDate, issueNumber, resetChallenge]);

  const result = method === "QR" && scan.step === "done" ? scan.result : certificateResult;
  const renderResult = result ? (
    <div
      className="rounded-lg border p-3 text-sm"
      style={{
        background: result.found ? "var(--warning-surface)" : "var(--surface-muted)",
        borderColor: result.found ? "var(--warning-border)" : "var(--border)",
      }}
      aria-live="polite"
    >
      <p className="font-semibold">
        {result.found && result.status ? STATUS_LABELS[result.status] : "Chưa có hồ sơ trùng"}
      </p>
      <p className="mt-1">{result.guidance}</p>
    </div>
  ) : null;

  return (
    <section
      className="pc-card space-y-6 shadow-md"
      style={{ borderTop: "4px solid var(--gold-500)", background: "var(--surface)" }}
    >
      <div className="space-y-2 text-center">
        <h2 className="text-xl sm:text-2xl font-bold">Kiểm tra tình trạng Giấy chứng nhận</h2>
        <p className="text-sm sm:text-base max-w-lg mx-auto" style={{ color: "var(--muted)" }}>
          Chọn cách tra cứu phù hợp. Kết quả chỉ cho biết có hồ sơ hay không, trạng thái xử lý và
          hướng dẫn tiếp theo; không hiển thị thông tin cá nhân hoặc ảnh giấy tờ.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2" role="tablist" aria-label="Phương thức tra cứu">
        <button
          type="button"
          role="tab"
          aria-selected={method === "QR"}
          className={method === "QR" ? "pc-button" : "pc-button-quiet"}
          onClick={() => changeMethod("QR")}
        >
          Quét QR CCCD
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={method === "CERTIFICATE"}
          className={method === "CERTIFICATE" ? "pc-button" : "pc-button-quiet"}
          onClick={() => changeMethod("CERTIFICATE")}
        >
          Bằng số GCN
        </button>
      </div>

      {method === "QR" ? (
        <div className="space-y-3" role="tabpanel">
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            Ảnh CCCD không được tải lên hay lưu lại — mã QR chỉ được đọc trên thiết bị của bạn.
          </p>
          {scan.step === "idle" || scan.step === "decoding" ? (
            <label
              className={`relative flex flex-col items-center justify-center p-8 sm:p-10 border-2 border-dashed rounded-xl cursor-pointer transition-all ${
                scan.step === "decoding" ? "opacity-50 pointer-events-none" : "hover:bg-black/5"
              }`}
              style={{ borderColor: "var(--border-strong)" }}
            >
              <input
                ref={fileInputRef}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                type="file"
                accept={IMAGE_FILE_ACCEPT}
                disabled={scan.step === "decoding"}
                onChange={(event) => void handleFile(event.target.files?.[0] ?? null)}
              />
              <span className="text-center font-semibold">Chạm để chụp ảnh / Chọn ảnh CCCD có mã QR</span>
            </label>
          ) : null}
          {scan.step === "decoding" ? <p className="text-sm">Đang đọc mã QR trên thiết bị…</p> : null}
          {scan.step === "decoded" || scan.step === "checking" ? (
            <>
              <p className="text-sm">Đã đọc mã QR. Hoàn thành xác minh rồi nhấn kiểm tra.</p>
              <TurnstileWidget key={challengeKey} action="lookup" onToken={onToken} />
              <div className="flex gap-3">
                <button
                  type="button"
                  className="pc-button"
                  disabled={scan.step === "checking" || !challenge}
                  onClick={() => void checkQr()}
                >
                  {scan.step === "checking" ? "Đang kiểm tra…" : "Kiểm tra"}
                </button>
                <button type="button" className="pc-button-quiet" onClick={resetQr}>
                  Quét ảnh khác
                </button>
              </div>
            </>
          ) : null}
          {renderResult}
          {scan.step === "done" ? (
            <button type="button" className="pc-button-quiet" onClick={resetQr}>
              Kiểm tra CCCD khác
            </button>
          ) : null}
        </div>
      ) : (
        <div className="space-y-4" role="tabpanel">
          <label className="block">
            <span className="pc-field-label">Số phát hành GCN</span>
            <input
              className="pc-input font-mono uppercase"
              value={issueNumber}
              autoComplete="off"
              onChange={(event) => {
                setIssueNumber(event.target.value);
                setCertificateResult(null);
              }}
              placeholder="Ví dụ: CH 012-345"
            />
            <span className="pc-field-hint">Khoảng trắng, dấu gạch và chữ hoa/thường được tự chuẩn hóa khi đối chiếu.</span>
          </label>
          <div>
            <span className="pc-field-label">Ngày cấp GCN</span>
            <VietnameseDateInput
              value={issueDate}
              onChange={(value) => {
                setIssueDate(value);
                setCertificateResult(null);
              }}
              bounds={{ minYear: 1987 }}
              groupLabel="Ngày cấp Giấy chứng nhận để tra cứu"
            />
          </div>
          <TurnstileWidget key={challengeKey} action="lookup" onToken={onToken} />
          <div className="flex gap-3">
            <button
              type="button"
              className="pc-button"
              disabled={certificateChecking || !challenge || !issueNumber.trim() || !issueDate}
              onClick={() => void checkCertificate()}
            >
              {certificateChecking ? "Đang kiểm tra…" : "Tra cứu bằng số GCN"}
            </button>
            {certificateResult ? (
              <button type="button" className="pc-button-quiet" onClick={resetCertificate}>
                Tra cứu lại
              </button>
            ) : null}
          </div>
          {renderResult}
        </div>
      )}

      {error ? <p className="pc-field-error">{error}</p> : null}
    </section>
  );
}
