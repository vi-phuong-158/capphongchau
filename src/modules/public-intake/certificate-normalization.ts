import { isValidDate } from "./validation";

/** Chuẩn hóa chỉ để so sánh; dữ liệu gốc của hồ sơ không bị thay đổi. */
export function normalizeCertificateIssueNumber(value: string): string {
  return value.replace(/[\s-]/g, "").toUpperCase();
}

export function isValidCertificateLookupInput(issueNumber: string, issueDate: string): boolean {
  const normalized = normalizeCertificateIssueNumber(issueNumber);
  // Số phát hành thực tế có tiền tố tiếng Việt như `AĐ`/`Đ`; giới hạn A–Z trước đây làm những
  // GCN này bị từ chối trước khi hề tra cứu. `\p{L}` vẫn loại dấu câu/ký tự đặc biệt, chỉ mở rộng
  // tập chữ cái Unicode hợp lệ.
  return /^[\p{L}0-9]{2,30}$/u.test(normalized) && isValidDate(issueDate);
}
