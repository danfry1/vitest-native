import type { Preset } from "../types.js";

// react-native-device-info exposes a default `DeviceInfo` object AND individual
// named function exports. Without the native module the real lib returns
// undefined for many getters (then app code does `.toLowerCase()` etc. and
// crashes), so provide sensible string/boolean/number defaults, with both the
// async (`getBrand`) and sync (`getBrandSync`) variants.
const STRINGS: Record<string, string> = {
  getBrand: "Apple",
  getModel: "iPhone",
  getDeviceId: "iPhone14,2",
  getSystemName: "iOS",
  getSystemVersion: "17.0",
  getVersion: "1.0.0",
  getReadableVersion: "1.0.0.1",
  getBuildNumber: "1",
  getBundleId: "com.example.app",
  getApplicationName: "Example",
  getDeviceName: "iPhone",
  getUniqueId: "mock-unique-id",
  getInstallReferrer: "",
  getDeviceType: "Handset",
  getUserAgent: "vitest-native",
  getCarrier: "",
  getManufacturer: "Apple",
};
const BOOLEANS: Record<string, boolean> = {
  hasNotch: true,
  hasDynamicIsland: false,
  isTablet: false,
  isEmulator: false,
  isPinOrFingerprintSet: false,
  isCameraPresent: true,
  isLandscape: false,
  isLowBatteryLevel: false,
  isHeadphonesConnected: false,
};
const NUMBERS: Record<string, number> = {
  getFontScale: 1,
  getBatteryLevel: 1,
  getTotalMemory: 4_000_000_000,
  getUsedMemory: 1_000_000_000,
  getApiLevel: 33,
};

export function deviceInfo(): Preset {
  const exports = [
    ...Object.keys(STRINGS),
    ...Object.keys(BOOLEANS),
    ...Object.keys(NUMBERS),
    // common sync variants
    ...Object.keys(STRINGS).map((k) => k + "Sync"),
    ...Object.keys(BOOLEANS).map((k) => k + "Sync"),
    ...Object.keys(NUMBERS).map((k) => k + "Sync"),
  ];

  return {
    name: "deviceInfo",
    modules: {
      "react-native-device-info": {
        exports,
        factory: () => {
          const api: Record<string, any> = {};
          // Sync getters return the value directly; async getters resolve to it.
          for (const [k, v] of Object.entries({ ...STRINGS, ...BOOLEANS, ...NUMBERS })) {
            api[k] = () => Promise.resolve(v);
            api[k + "Sync"] = () => v;
          }
          // A handful are conventionally synchronous in the real API — make the
          // bare name sync too so `DeviceInfo.hasNotch()`/`getDeviceType()` work.
          for (const k of ["hasNotch", "hasDynamicIsland", "isTablet", "getDeviceType"]) {
            const src = { ...STRINGS, ...BOOLEANS } as Record<string, any>;
            api[k] = () => src[k];
          }
          api.getUniqueIdSync = () => STRINGS.getUniqueId;
          return { __esModule: true, default: api, ...api };
        },
      },
    },
  };
}
