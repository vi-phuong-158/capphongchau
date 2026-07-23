"use client";

import { useRef, useState } from "react";

import {
  assembleIsoDate,
  splitIsoDate,
  type DateBounds,
  type DateParts,
} from "@/modules/public-intake/vietnamese-date";

interface VietnameseDateInputProps {
  /** Giá trị chuẩn `YYYY-MM-DD`, hoặc rỗng khi chưa đủ. */
  value: string;
  /** Phát ra `YYYY-MM-DD` khi ba ô hợp lệ, ngược lại phát chuỗi rỗng. */
  onChange: (isoDate: string) => void;
  bounds?: DateBounds;
  invalid?: boolean;
  disabled?: boolean;
  /** Nhãn cho nhóm ba ô (đọc bởi trình đọc màn hình). */
  groupLabel?: string;
  /** Gắn vào ô Ngày để `htmlFor` của nhãn ngoài trỏ đúng vào một ô thật. */
  id?: string;
  /** Tên gốc; ba ô dùng hậu tố `.day` / `.month` / `.year`. */
  name?: string;
  "aria-describedby"?: string;
}

/**
 * Ba ô số Ngày / Tháng / Năm — bàn phím số, không mở lịch. Chọn cách này vì trên điện thoại lịch
 * gốc bắt cuộn ngược nhiều năm cho ngày sinh, còn gõ tự do thì dễ sai định dạng. Ô tự nhảy khi đủ
 * số, Backspace ở ô rỗng lùi về ô trước.
 */
export function VietnameseDateInput({
  value,
  onChange,
  bounds,
  invalid,
  disabled,
  groupLabel,
  id,
  name,
  "aria-describedby": ariaDescribedBy,
}: VietnameseDateInputProps) {
  const [parts, setParts] = useState<DateParts>(() => splitIsoDate(value));
  const [syncedValue, setSyncedValue] = useState(value);
  const dayRef = useRef<HTMLInputElement>(null);
  const monthRef = useRef<HTMLInputElement>(null);
  const yearRef = useRef<HTMLInputElement>(null);

  // Đồng bộ khi value đổi từ ngoài (ví dụ QR tự điền) — cập nhật ngay trong render theo mẫu React
  // khuyến nghị, không dùng effect. Value rỗng (đang gõ dở) thì không đè phần người dân đang nhập.
  if (value && value !== syncedValue) {
    setSyncedValue(value);
    setParts(splitIsoDate(value));
  }

  function emit(next: DateParts) {
    setParts(next);
    onChange(assembleIsoDate(next.day, next.month, next.year, bounds) ?? "");
  }

  function handleChange(
    field: keyof DateParts,
    raw: string,
    advanceTo: React.RefObject<HTMLInputElement | null> | null,
  ) {
    const maxLen = field === "year" ? 4 : 2;
    const digits = raw.replace(/\D/g, "").slice(0, maxLen);
    emit({ ...parts, [field]: digits });
    if (advanceTo && digits.length === maxLen) {
      advanceTo.current?.focus();
    }
  }

  function handleKeyDown(
    field: keyof DateParts,
    event: React.KeyboardEvent<HTMLInputElement>,
    previous: React.RefObject<HTMLInputElement | null> | null,
  ) {
    if (event.key === "Backspace" && parts[field] === "" && previous) {
      previous.current?.focus();
    }
  }

  const boxClass = "pc-input text-center";

  return (
    <div
      className="flex items-center gap-2"
      role="group"
      aria-label={groupLabel}
      aria-describedby={ariaDescribedBy}
    >
      <input
        ref={dayRef}
        id={id}
        name={name ? `${name}.day` : undefined}
        className={boxClass}
        style={{ width: "3.5rem" }}
        inputMode="numeric"
        autoComplete="off"
        placeholder="Ngày"
        aria-label="Ngày"
        aria-invalid={invalid ? "true" : undefined}
        maxLength={2}
        disabled={disabled}
        value={parts.day}
        onChange={(event) => handleChange("day", event.target.value, monthRef)}
        onKeyDown={(event) => handleKeyDown("day", event, null)}
      />
      <span aria-hidden="true" style={{ color: "var(--muted)" }}>
        /
      </span>
      <input
        ref={monthRef}
        name={name ? `${name}.month` : undefined}
        className={boxClass}
        style={{ width: "3.5rem" }}
        inputMode="numeric"
        autoComplete="off"
        placeholder="Tháng"
        aria-label="Tháng"
        aria-invalid={invalid ? "true" : undefined}
        maxLength={2}
        disabled={disabled}
        value={parts.month}
        onChange={(event) => handleChange("month", event.target.value, yearRef)}
        onKeyDown={(event) => handleKeyDown("month", event, dayRef)}
      />
      <span aria-hidden="true" style={{ color: "var(--muted)" }}>
        /
      </span>
      <input
        ref={yearRef}
        name={name ? `${name}.year` : undefined}
        className={boxClass}
        style={{ width: "5rem" }}
        inputMode="numeric"
        autoComplete="off"
        placeholder="Năm"
        aria-label="Năm"
        aria-invalid={invalid ? "true" : undefined}
        maxLength={4}
        disabled={disabled}
        value={parts.year}
        onChange={(event) => handleChange("year", event.target.value, null)}
        onKeyDown={(event) => handleKeyDown("year", event, monthRef)}
      />
    </div>
  );
}
