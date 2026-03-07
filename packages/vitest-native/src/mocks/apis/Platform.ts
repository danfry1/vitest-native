import { vi } from "vitest";

export function createPlatformMock(os: "ios" | "android" = "ios") {
  return {
    OS: os,
    Version: os === "ios" ? "17.0" : 34,
    isPad: false,
    isTVOS: false,
    isTV: false,
    isVision: false,
    isTesting: true,
    select: vi.fn((specifics: Record<string, any>) => {
      return specifics[os] ?? specifics.default;
    }),
    constants: {
      reactNativeVersion: { major: 0, minor: 76, patch: 0 },
      osVersion: os === "ios" ? 17 : 34,
      systemName: os === "ios" ? "iOS" : "Android",
      isTesting: true,
    },
  };
}
