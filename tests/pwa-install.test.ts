import { describe, expect, it } from "vitest";

import {
  detectPwaDevice,
  getPwaInstallAction,
  isIosDevice,
  isPwaStandalone,
} from "@/lib/pwa-install";

describe("PWA install state", () => {
  it("recognizes iPhone and iPad user agents", () => {
    expect(
      isIosDevice({
        userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)",
        platform: "iPhone",
        maxTouchPoints: 5,
      }),
    ).toBe(true);
    expect(
      detectPwaDevice({
        userAgent: "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X)",
        platform: "iPad",
        maxTouchPoints: 5,
      }),
    ).toBe("ios");
  });

  it("recognizes iPadOS when Safari reports a Mac platform", () => {
    expect(
      isIosDevice({
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)",
        platform: "MacIntel",
        maxTouchPoints: 5,
      }),
    ).toBe(true);
  });

  it("recognizes Android separately from desktop user agents", () => {
    expect(
      detectPwaDevice({
        userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8)",
        platform: "Linux armv8l",
        maxTouchPoints: 5,
      }),
    ).toBe("android");
    expect(
      detectPwaDevice({
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        platform: "Win32",
        maxTouchPoints: 0,
      }),
    ).toBe("desktop");
  });

  it("accepts both standalone signals", () => {
    expect(isPwaStandalone({ displayModeStandalone: true })).toBe(true);
    expect(isPwaStandalone({ displayModeStandalone: false, navigatorStandalone: true })).toBe(true);
    expect(isPwaStandalone({ displayModeStandalone: false, navigatorStandalone: false })).toBe(
      false,
    );
  });

  it("chooses native prompt, device guide, or hidden state", () => {
    expect(
      getPwaInstallAction({ device: "android", standalone: false, hasNativePrompt: true }),
    ).toBe("native-prompt");
    expect(getPwaInstallAction({ device: "ios", standalone: false, hasNativePrompt: false })).toBe(
      "ios-guide",
    );
    expect(
      getPwaInstallAction({ device: "android", standalone: false, hasNativePrompt: false }),
    ).toBe("android-guide");
    expect(
      getPwaInstallAction({ device: "desktop", standalone: false, hasNativePrompt: false }),
    ).toBe("hidden");
    expect(getPwaInstallAction({ device: "ios", standalone: true, hasNativePrompt: true })).toBe(
      "hidden",
    );
  });
});
