export type PwaDevice = "ios" | "android" | "desktop";

export type PwaInstallAction = "hidden" | "native-prompt" | "ios-guide" | "android-guide";

export interface NavigatorSignals {
  readonly userAgent: string;
  readonly platform: string;
  readonly maxTouchPoints: number;
}

export interface StandaloneSignals {
  readonly displayModeStandalone: boolean;
  readonly navigatorStandalone?: boolean;
}

export function isIosDevice({ userAgent, platform, maxTouchPoints }: NavigatorSignals): boolean {
  return /iPad|iPhone|iPod/i.test(userAgent) || (platform === "MacIntel" && maxTouchPoints > 1);
}

export function isAndroidDevice({ userAgent }: NavigatorSignals): boolean {
  return /Android/i.test(userAgent);
}

export function detectPwaDevice(signals: NavigatorSignals): PwaDevice {
  if (isIosDevice(signals)) {
    return "ios";
  }

  if (isAndroidDevice(signals)) {
    return "android";
  }

  return "desktop";
}

export function isPwaStandalone({
  displayModeStandalone,
  navigatorStandalone,
}: StandaloneSignals): boolean {
  return displayModeStandalone || navigatorStandalone === true;
}

export function getPwaInstallAction({
  device,
  standalone,
  hasNativePrompt,
}: {
  readonly device: PwaDevice;
  readonly standalone: boolean;
  readonly hasNativePrompt: boolean;
}): PwaInstallAction {
  if (standalone) {
    return "hidden";
  }

  if (hasNativePrompt) {
    return "native-prompt";
  }

  if (device === "ios") {
    return "ios-guide";
  }

  if (device === "android") {
    return "android-guide";
  }

  return "hidden";
}
