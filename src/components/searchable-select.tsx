"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

import type { ReferenceOption } from "@/modules/public-intake/reference";

/** Bỏ dấu tiếng Việt để tìm "tho cu" vẫn ra "thổ cư"; hạ chữ thường để không phân biệt hoa/thường. */
function foldVietnamese(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "d")
    .toLowerCase()
    .trim();
}

interface SearchableSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: readonly ReferenceOption[];
  placeholder: string;
  invalid?: boolean;
  id?: string;
  name?: string;
  "aria-describedby"?: string;
}

/**
 * Ô chọn có tìm kiếm cho danh mục dài (loại đất 45 mục). Danh mục dài đổ hết vào `<select>` thuần
 * là không dùng được trên màn 375px — người dân phải cuộn qua 45 dòng chữ dài. Ô này cho gõ vài
 * ký tự (không dấu cũng khớp) rồi chọn, vẫn đi được bằng bàn phím lẫn chạm.
 */
export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder,
  invalid,
  id,
  name,
  "aria-describedby": ariaDescribedBy,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const selected = useMemo(
    () => options.find((option) => option.code === value) ?? null,
    [options, value],
  );

  const filtered = useMemo(() => {
    const needle = foldVietnamese(query);
    if (!needle) return options;
    return options.filter((option) => foldVietnamese(option.label).includes(needle));
  }, [options, query]);

  // Đóng khi bấm ra ngoài — chạm trên điện thoại cũng phải thoát được.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function commit(option: ReferenceOption) {
    onChange(option.code);
    setOpen(false);
    setQuery("");
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      setActiveIndex((current) => Math.min(current + 1, filtered.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => Math.max(current - 1, 0));
    } else if (event.key === "Enter") {
      if (open && filtered[activeIndex]) {
        event.preventDefault();
        commit(filtered[activeIndex]);
      }
    } else if (event.key === "Escape") {
      if (open) {
        event.preventDefault();
        setOpen(false);
        setQuery("");
      }
    }
  }

  const activeOptionId = open && filtered[activeIndex] ? `${listId}-${activeIndex}` : undefined;

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      <input
        id={id}
        name={name}
        className="pc-input"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-invalid={invalid ? "true" : undefined}
        aria-describedby={ariaDescribedBy}
        aria-activedescendant={activeOptionId}
        autoComplete="off"
        placeholder={placeholder}
        value={open ? query : (selected?.label ?? "")}
        onFocus={() => {
          setOpen(true);
          setActiveIndex(0);
        }}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          setActiveIndex(0);
        }}
        onKeyDown={handleKeyDown}
      />
      {open ? (
        <ul
          id={listId}
          role="listbox"
          className="pc-card"
          style={{
            position: "absolute",
            zIndex: 20,
            left: 0,
            right: 0,
            marginTop: "0.25rem",
            maxHeight: "16rem",
            overflowY: "auto",
            padding: "0.25rem",
          }}
        >
          {filtered.length === 0 ? (
            <li className="pc-field-hint" style={{ padding: "0.5rem 0.75rem" }}>
              Không có mục nào khớp “{query}”.
            </li>
          ) : (
            filtered.map((option, index) => {
              const isActive = index === activeIndex;
              const isSelected = option.code === value;
              return (
                <li
                  key={option.code}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={isSelected}
                  // pointerdown chạy trước blur của input, tránh mất lựa chọn trên điện thoại.
                  onPointerDown={(event) => {
                    event.preventDefault();
                    commit(option);
                  }}
                  onMouseEnter={() => setActiveIndex(index)}
                  style={{
                    padding: "0.6rem 0.75rem",
                    borderRadius: "0.375rem",
                    cursor: "pointer",
                    fontWeight: isSelected ? 700 : 400,
                    background: isActive ? "var(--accent-surface, rgba(0,0,0,0.06))" : undefined,
                  }}
                >
                  {option.label}
                </li>
              );
            })
          )}
        </ul>
      ) : null}
    </div>
  );
}
