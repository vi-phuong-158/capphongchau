"use client";

import { useEffect, useRef, useState } from "react";

import {
  detectPwaDevice,
  getPwaInstallAction,
  isPwaStandalone,
  type NavigatorSignals,
  type PwaInstallAction,
} from "@/lib/pwa-install";

interface BeforeInstallPromptChoice {
  readonly outcome: "accepted" | "dismissed";
  readonly platform: string;
}

interface BeforeInstallPromptEvent extends Event {
  readonly userChoice: Promise<BeforeInstallPromptChoice>;
  prompt(): Promise<void>;
}

interface NavigatorWithAppleStandalone extends Navigator {
  readonly standalone?: boolean;
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as { readonly then?: unknown };
  return typeof candidate.then === "function";
}

function isBeforeInstallPromptEvent(event: Event): event is BeforeInstallPromptEvent {
  const candidate = event as Event & {
    readonly prompt?: unknown;
    readonly userChoice?: unknown;
  };

  return typeof candidate.prompt === "function" && isThenable(candidate.userChoice);
}

function getNavigatorSignals(): NavigatorSignals {
  return {
    userAgent: window.navigator.userAgent,
    platform: window.navigator.platform,
    maxTouchPoints: window.navigator.maxTouchPoints,
  };
}

function getStandaloneSignals(): { displayModeStandalone: boolean; navigatorStandalone?: boolean } {
  const navigatorWithAppleStandalone = window.navigator as NavigatorWithAppleStandalone;

  return {
    displayModeStandalone: window.matchMedia("(display-mode: standalone)").matches,
    navigatorStandalone: navigatorWithAppleStandalone.standalone,
  };
}

function InstallIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none">
      <path
        d="M12 3v11m0 0 4-4m-4 4-4-4M5 16.5V19a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function GuideDialog({ device, onClose }: { device: "ios" | "android"; onClose: () => void }) {
  const isIos = device === "ios";
  const title = isIos ? "Cài ứng dụng trên iPhone/iPad" : "Cài ứng dụng trên Android";

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
      style={{ background: "rgba(34, 24, 27, 0.42)" }}
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="w-full max-w-md space-y-5 rounded-[var(--radius-xl)] p-6 shadow-lg sm:p-7"
        style={{ background: "var(--surface)", color: "var(--text-primary)" }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pwa-install-dialog-title"
      >
        <div className="space-y-2">
          <h2 id="pwa-install-dialog-title" className="text-xl font-bold">
            {title}
          </h2>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            {isIos
              ? "Để cài ứng dụng, hãy mở trang này bằng Safari rồi thực hiện các bước sau:"
              : "Nếu chưa thấy hộp thoại cài đặt, hãy mở trang bằng Chrome rồi thực hiện các bước sau:"}
          </p>
        </div>

        <ol className="list-decimal space-y-2 pl-5 text-sm leading-6">
          {isIos ? (
            <>
              <li>Mở trang này bằng Safari.</li>
              <li>Bấm biểu tượng Chia sẻ.</li>
              <li>Chọn “Thêm vào Màn hình chính”.</li>
              <li>Bấm “Thêm”.</li>
            </>
          ) : (
            <>
              <li>Mở trang bằng Chrome.</li>
              <li>Bấm menu ba chấm.</li>
              <li>Chọn “Cài đặt ứng dụng” hoặc “Thêm vào màn hình chính”.</li>
            </>
          )}
        </ol>

        <div className="flex justify-end">
          <button type="button" className="pc-button" onClick={onClose}>
            Đã hiểu
          </button>
        </div>
      </div>
    </div>
  );
}

export function PwaInstallButton() {
  const deferredPromptRef = useRef<BeforeInstallPromptEvent | null>(null);
  const [installAction, setInstallAction] = useState<PwaInstallAction>("hidden");
  const [guideDevice, setGuideDevice] = useState<"ios" | "android" | null>(null);

  useEffect(() => {
    const signals = getNavigatorSignals();
    const device = detectPwaDevice(signals);
    const standalone = isPwaStandalone(getStandaloneSignals());

    let disposed = false;
    queueMicrotask(() => {
      if (disposed) {
        return;
      }

      setInstallAction(
        getPwaInstallAction({
          device,
          standalone,
          hasNativePrompt: deferredPromptRef.current !== null,
        }),
      );
    });

    const handleBeforeInstallPrompt = (event: Event) => {
      if (!isBeforeInstallPromptEvent(event) || standalone || device === "ios") {
        return;
      }

      event.preventDefault();
      deferredPromptRef.current = event;
      setInstallAction("native-prompt");
    };

    const handleAppInstalled = () => {
      deferredPromptRef.current = null;
      setGuideDevice(null);
      setInstallAction("hidden");
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      disposed = true;
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  if (installAction === "hidden") {
    return null;
  }

  const handleInstallClick = async () => {
    const deferredPrompt = deferredPromptRef.current;

    if (installAction === "native-prompt" && deferredPrompt !== null) {
      try {
        await deferredPrompt.prompt();
        await deferredPrompt.userChoice;
      } finally {
        deferredPromptRef.current = null;
        setInstallAction("hidden");
      }
      return;
    }

    if (installAction === "ios-guide" || installAction === "android-guide") {
      setGuideDevice(installAction === "ios-guide" ? "ios" : "android");
    }
  };

  return (
    <>
      <div className="flex w-full flex-col items-center gap-1 pt-1">
        <button
          type="button"
          className="pc-button-quiet w-full sm:w-auto text-sm px-5 py-3"
          onClick={() => void handleInstallClick()}
        >
          <InstallIcon />
          Cài ứng dụng trên điện thoại
        </button>
        <p className="text-center text-xs" style={{ color: "var(--text-secondary)" }}>
          Tạo biểu tượng ngoài màn hình để truy cập nhanh hơn.
        </p>
      </div>

      {guideDevice !== null && (
        <GuideDialog device={guideDevice} onClose={() => setGuideDevice(null)} />
      )}
    </>
  );
}
