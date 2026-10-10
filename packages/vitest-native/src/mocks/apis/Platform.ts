import { vi } from "vitest";

export function createPlatformMock(os: "ios" | "android" = "ios") {
  const platform = {
    OS: os,
    Version: os === "ios" ? "17.0" : 34,
    isPad: false,
    isTVOS: false,
    isTV: false,
    isVision: false,
    isTesting: true,
    // Reads `OS` at call time, so setPlatform() only has to change `OS`. An
    // implementation installed later with mockImplementation() would be dropped by
    // vi.resetAllMocks() / `mockReset: true`, leaving select() on the old platform.
    // Key presence (`in`), not `??`, as in RN's Platform.ios.js / Platform.android.js:
    // an explicit `ios: undefined` selects undefined.
    select: vi.fn((spec: Record<string, any>) =>
      platform.OS in spec ? spec[platform.OS] : "native" in spec ? spec.native : spec.default,
    ),
    constants: {
      reactNativeVersion: { major: 0, minor: 76, patch: 0 },
      osVersion: os === "ios" ? 17 : 34,
      systemName: os === "ios" ? "iOS" : "Android",
      isTesting: true,
    },
  };
  return platform;
}
