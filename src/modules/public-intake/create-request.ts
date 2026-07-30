export interface ValidatedCreateSubmissionRequest {
  readonly phone: string;
  readonly consentAccepted: true;
}

export type CreateSubmissionRequestValidation =
  | { readonly ok: true; readonly value: ValidatedCreateSubmissionRequest }
  | { readonly ok: false; readonly message: string };

/**
 * Contract dùng chung cho cả tự kê khai và cán bộ hỗ trợ.
 *
 * `CONSENT_NOTICE_VERSION` vẫn do server chọn và lưu; client chỉ khai báo người dân đã chủ động
 * đồng ý với thông báo đang hiển thị. Không nhận `channel`, danh tính cán bộ hoặc phiên bản
 * consent từ body vì các giá trị đó phải đến từ route/session/config phía server.
 */
export function validateCreateSubmissionRequest(body: unknown): CreateSubmissionRequestValidation {
  if (typeof body !== "object" || body === null) {
    return { ok: false, message: "Nội dung yêu cầu không hợp lệ." };
  }

  const candidate = body as { phone?: unknown; consent?: unknown };
  const phone = typeof candidate.phone === "string" ? candidate.phone.trim() : "";
  if (!/^0\d{9}$/.test(phone)) {
    return {
      ok: false,
      message: "Số điện thoại phải gồm 10 chữ số và bắt đầu bằng 0.",
    };
  }

  const consent =
    typeof candidate.consent === "object" && candidate.consent !== null
      ? (candidate.consent as { accepted?: unknown })
      : null;
  if (consent?.accepted !== true) {
    return {
      ok: false,
      message: "Cần xác nhận đồng ý cho phép xử lý dữ liệu trước khi tạo bản kê khai.",
    };
  }

  return { ok: true, value: { phone, consentAccepted: true } };
}
