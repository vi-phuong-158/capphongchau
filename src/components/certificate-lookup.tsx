"use client";

import { useCallback, useRef, useState } from "react";

import { TurnstileWidget } from "@/components/turnstile-widget";
import {
  prepareCitizenIdImage,
  readCitizenIdQr,
} from "@/modules/public-intake/citizen-id-qr.client";
import { IMAGE_FILE_ACCEPT } from "@/modules/public-intake/image-format";

interface LookupResult {
  matched: boolean;
  pendingWarning: boolean;
  certificates: Array<{ issueNumberMasked: string; issueDate: string }>;
}

type ScanState =
  | { step: "idle" }
  | { step: "decoding" }
  | { step: "decoded"; identityNumber: string; fullName: string }
  | { step: "checking"; identityNumber: string; fullName: string }
  | { step: "done"; fullName: string; result: LookupResult };

async function readErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    return body.error?.message ?? fallback;
  } catch {
    return fallback;
  }
}

/**
 * Tra cứu nhanh "đã nộp Giấy chứng nhận chưa" ngay ở trang chủ, không cần bắt đầu kê khai.
 *
 * Ảnh CCCD không rời trình duyệt: `readCitizenIdQr` giải mã QR bằng canvas cục bộ, chỉ số định
 * danh + họ tên (không phải ảnh) được gửi lên để đối chiếu, và server không lưu lại — chỉ ghi audit
 * kèm số lượng khớp. Số GCN trả về bị che theo quyết định 03-decisions.md 2026-07-23.
 */
export function CertificateLookup() {
  const [scan, setScan] = useState<ScanState>({ step: "idle" });
  const [error, setError] = useState("");
  const [challenge, setChallenge] = useState("");
  const [challengeKey, setChallengeKey] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const onToken = useCallback((token: string) => setChallenge(token), []);

  const reset = useCallback(() => {
    setScan({ step: "idle" });
    setError("");
    setChallenge("");
    setChallengeKey((value) => value + 1);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

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

  const check = useCallback(async () => {
    if (scan.step !== "decoded" || !challenge) return;
    const { identityNumber, fullName } = scan;
    setScan({ step: "checking", identityNumber, fullName });
    setError("");
    try {
      const response = await fetch("/api/public/certificate-lookup", {
        method: "POST",
        headers: { "content-type": "application/json", "x-turnstile-token": challenge },
        body: JSON.stringify({ identityNumber, fullName }),
      });
      if (!response.ok) {
        setError(await readErrorMessage(response, "Chưa kiểm tra được. Vui lòng thử lại."));
        setScan({ step: "decoded", identityNumber, fullName });
        setChallenge("");
        setChallengeKey((value) => value + 1);
        return;
      }
      const result = (await response.json()) as LookupResult;
      setScan({ step: "done", fullName, result });
    } catch {
      setError("Không thể kết nối máy chủ. Vui lòng thử lại.");
      setScan({ step: "decoded", identityNumber, fullName });
    }
  }, [scan, challenge]);

  return (
    <section 
      className="pc-card space-y-6 shadow-md"
      style={{ borderTop: "4px solid var(--gold-500)", background: "var(--surface)" }}
    >
      <div className="space-y-2 text-center">
        <h2 className="text-xl sm:text-2xl font-bold">Kiểm tra đã nộp Giấy chứng nhận chưa?</h2>
        <p className="text-sm sm:text-base max-w-lg mx-auto" style={{ color: "var(--muted)" }}>
          Quét mã QR trên căn cước (chụp ảnh hoặc chọn ảnh có sẵn) để xem đã có hồ sơ nào nộp cho
          CCCD này chưa. Ảnh không được tải lên hay lưu lại — hệ thống chỉ đọc mã QR ngay trên thiết
          bị của bạn.
        </p>
      </div>

      {scan.step === "idle" || scan.step === "decoding" ? (
        <div className="space-y-3">
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
            <div className="flex flex-col items-center text-center space-y-3 pointer-events-none">
              <div className="p-4 rounded-full shadow-sm" style={{ background: "var(--gold-100)", color: "var(--gold-800)" }}>
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <div>
                <p className="font-bold text-lg">Chạm để chụp ảnh / Chọn tệp</p>
                <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>Đưa mã QR trên CCCD vào khung hình</p>
              </div>
            </div>
          </label>
          {scan.step === "decoding" ? (
            <p className="text-sm text-center font-medium animate-pulse" style={{ color: "var(--accent)" }}>
              Đang đọc mã QR trên thiết bị…
            </p>
          ) : null}
        </div>
      ) : null}

      {scan.step === "decoded" || scan.step === "checking" ? (
        <div className="space-y-3">
          <p className="text-sm">
            Đã đọc mã QR của <strong>{scan.fullName}</strong>. Nhấn kiểm tra để tra cứu.
          </p>
          <TurnstileWidget key={challengeKey} action="lookup" onToken={onToken} />
          <div className="flex gap-3">
            <button
              type="button"
              className="pc-button"
              disabled={scan.step === "checking" || !challenge}
              onClick={() => void check()}
            >
              {scan.step === "checking" ? "Đang kiểm tra…" : "Kiểm tra"}
            </button>
            <button
              type="button"
              className="pc-button-quiet"
              disabled={scan.step === "checking"}
              onClick={reset}
            >
              Quét ảnh khác
            </button>
          </div>
        </div>
      ) : null}

      {scan.step === "done" ? (
        <div className="space-y-3">
          {scan.result.matched ? (
            <div
              className="rounded-lg border p-3 text-sm"
              style={{ background: "var(--warning-surface)", borderColor: "var(--warning-border)" }}
            >
              <p className="font-semibold">
                Đã tìm thấy {scan.result.certificates.length} Giấy chứng nhận từng nộp cho{" "}
                {scan.fullName}:
              </p>
              <ul className="mt-2 list-disc pl-5">
                {scan.result.certificates.map((cert, index) => (
                  <li key={`${cert.issueNumberMasked}-${index}`}>
                    Số GCN: <span className="font-mono">{cert.issueNumberMasked}</span> — cấp ngày{" "}
                    {cert.issueDate || "chưa rõ"}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
                Số hiển thị đã được che một phần. Đối chiếu 4 số cuối với Giấy chứng nhận đang cầm;
                nếu khớp thì có thể không cần nộp lại — hãy hỏi cán bộ tiếp nhận để chắc chắn.
              </p>
            </div>
          ) : (
            <p className="rounded-lg border border-stone-200 bg-stone-50 p-3 text-sm">
              Chưa tìm thấy hồ sơ Giấy chứng nhận nào đã nộp cho CCCD này.
            </p>
          )}
          {scan.result.pendingWarning ? (
            <p className="text-sm text-amber-800">
              Lưu ý: đang có một hồ sơ khác chờ xử lý cho cùng CCCD này.
            </p>
          ) : null}
          <button type="button" className="pc-button-quiet" onClick={reset}>
            Kiểm tra CCCD khác
          </button>
        </div>
      ) : null}

      {error ? <p className="pc-field-error">{error}</p> : null}
    </section>
  );
}
