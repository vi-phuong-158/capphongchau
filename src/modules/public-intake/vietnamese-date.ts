/**
 * Logic ngày tháng thuần (không React) cho ô nhập ngày kiểu Việt Nam: ba ô số Ngày / Tháng / Năm,
 * lưu nội bộ dạng chuẩn `YYYY-MM-DD`.
 *
 * Tách khỏi component để kiểm thử được phần khó: ngày không hợp lệ (31/2), năm nhuận, chặn ngày
 * tương lai, và khoảng năm cho phép. PL3 mẫu có `9/10/1017` (năm 1017) lọt vào file chính thức —
 * đúng loại lỗi cần chặn ngay lúc nhập.
 */

export interface DateBounds {
  /** Năm nhỏ nhất được chấp nhận (bao gồm). */
  minYear?: number;
  /** Năm lớn nhất được chấp nhận (bao gồm). */
  maxYear?: number;
  /** Chặn ngày trong tương lai (mặc định bật). */
  disallowFuture?: boolean;
}

export interface DateParts {
  day: string;
  month: string;
  year: string;
}

const ISO_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Tách `YYYY-MM-DD` thành ba ô; chuỗi rỗng/không hợp lệ trả về ba ô rỗng. */
export function splitIsoDate(value: string): DateParts {
  const match = ISO_PATTERN.exec(value ?? "");
  if (!match) return { day: "", month: "", year: "" };
  return { year: match[1], month: match[2], day: match[3] };
}

/**
 * Ghép ba ô thành `YYYY-MM-DD` nếu hợp lệ trong giới hạn, ngược lại trả `null`.
 * `today` cho phép test cố định "hôm nay"; mặc định lấy thời điểm hiện tại.
 */
export function assembleIsoDate(
  dayRaw: string,
  monthRaw: string,
  yearRaw: string,
  bounds: DateBounds = {},
  today: Date = new Date(),
): string | null {
  if (
    !/^\d{1,2}$/.test(dayRaw.trim()) ||
    !/^\d{1,2}$/.test(monthRaw.trim()) ||
    !/^\d{4}$/.test(yearRaw.trim())
  ) {
    return null;
  }
  const day = Number(dayRaw);
  const month = Number(monthRaw);
  const year = Number(yearRaw);

  // Vòng qua Date UTC để bắt ngày không tồn tại (31/2, 30/2, năm nhuận…).
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  ) {
    return null;
  }

  const { minYear, maxYear, disallowFuture = true } = bounds;
  if (minYear !== undefined && year < minYear) return null;
  if (maxYear !== undefined && year > maxYear) return null;
  if (disallowFuture) {
    const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
    if (candidate.getTime() > todayUtc) return null;
  }

  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Chuyển ISO sang định dạng `HH:mm dd/MM/yyyy` cho mốc lịch sử/log. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(date);
  const valueOf = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${valueOf("hour")}:${valueOf("minute")} ${valueOf("day")}/${valueOf("month")}/${valueOf("year")}`;
}
