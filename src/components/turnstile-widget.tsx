"use client";

import { useEffect, useRef } from "react";

/**
 * Widget Turnstile ở chế độ render tường minh.
 *
 * Token dùng một lần và hết hạn sau ít phút, nên component không giữ token: mỗi lần cha cần token
 * mới thì đổi `key` để widget mount lại. Đơn giản hơn quản lý vòng đời reset của Turnstile API,
 * và tránh trường hợp gửi lại token cũ đã bị siteverify từ chối.
 */

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

interface TurnstileApi {
  render(container: HTMLElement, options: Record<string, unknown>): string;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

function loadTurnstileScript(): Promise<TurnstileApi> {
  if (window.turnstile) {
    return Promise.resolve(window.turnstile);
  }

  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
    const script = existing ?? document.createElement("script");
    const settle = () => {
      if (window.turnstile) {
        resolve(window.turnstile);
      } else {
        reject(new Error("TURNSTILE_UNAVAILABLE"));
      }
    };

    script.addEventListener("load", settle, { once: true });
    script.addEventListener("error", () => reject(new Error("TURNSTILE_UNAVAILABLE")), {
      once: true,
    });

    if (!existing) {
      script.src = SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
  });
}

export function TurnstileWidget({
  action,
  onToken,
}: {
  action: "create" | "submit";
  /** Chuỗi rỗng nghĩa là chưa/không còn token hợp lệ — cha phải khóa nút hành động lại. */
  onToken: (token: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  useEffect(() => {
    let widgetId: string | undefined;
    let cancelled = false;

    void loadTurnstileScript()
      .then((turnstile) => {
        if (cancelled || !containerRef.current) {
          return;
        }
        widgetId = turnstile.render(containerRef.current, {
          sitekey: siteKey,
          action,
          callback: onToken,
          "expired-callback": () => onToken(""),
          "error-callback": () => onToken(""),
        });
      })
      .catch(() => {
        // Không tải được Turnstile thì không có token, và server fail-closed sẽ từ chối. Báo cho
        // cha để hiện thông báo thay vì để người dân bấm nút mãi không hiểu vì sao hỏng.
        if (!cancelled) {
          onToken("");
        }
      });

    return () => {
      cancelled = true;
      if (widgetId) {
        window.turnstile?.remove(widgetId);
      }
    };
  }, [action, onToken, siteKey]);

  return <div ref={containerRef} className="my-4" />;
}
