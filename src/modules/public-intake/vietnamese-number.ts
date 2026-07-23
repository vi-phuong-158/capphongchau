/**
 * Chuẩn hóa số thập phân người dân gõ theo thói quen Việt Nam.
 *
 * Cần thiết vì `Number("123,5")` trả `NaN`: người dân gõ dấu phẩy làm dấu thập phân (chuẩn Việt),
 * đôi khi kèm dấu chấm hoặc khoảng trắng làm dấu phân nhóm hàng nghìn. Bản thân PL3 mẫu ghi diện
 * tích bằng dấu phẩy, nên chuỗi gốc vẫn giữ nguyên khi xuất — hàm này chỉ dùng cho **so sánh/kiểm
 * tra số học** (diện tích > 0, tổng loại đất ≤ diện tích thửa), không dùng để đổi thứ người dân đã
 * gõ.
 *
 * Chấp nhận: `123,5` · `123.5` · `1 234,5` · `1.234,5` · `1,234.5`.
 */
export function parseVietnameseDecimal(input: string): number | null {
  let text = input.trim();
  if (!text) return null;

  // Dấu phân nhóm dạng khoảng trắng (kể cả khoảng trắng không ngắt dòng).
  text = text.replace(/[\s ]/g, "");

  const hasComma = text.includes(",");
  const hasDot = text.includes(".");

  if (hasComma && hasDot) {
    // Có cả hai dấu: dấu xuất hiện sau cùng là dấu thập phân, dấu kia là phân nhóm hàng nghìn.
    const decimalSeparator = text.lastIndexOf(",") > text.lastIndexOf(".") ? "," : ".";
    const groupSeparator = decimalSeparator === "," ? "." : ",";
    text = text.split(groupSeparator).join("").replace(decimalSeparator, ".");
  } else if (hasComma) {
    // Chỉ có dấu phẩy: kiểu Việt — phẩy là dấu thập phân.
    text = text.replace(",", ".");
  }

  // Sau khi quy đổi chỉ được còn chữ số và tối đa một dấu chấm thập phân.
  if (!/^-?\d*\.?\d+$/.test(text)) return null;

  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}
