const PLATFORM_EXTENSIONS_IOS = [
  ".ios.tsx",
  ".ios.ts",
  ".ios.jsx",
  ".ios.js",
  ".native.tsx",
  ".native.ts",
  ".native.jsx",
  ".native.js",
  ".tsx",
  ".ts",
  ".jsx",
  ".js",
];

const PLATFORM_EXTENSIONS_ANDROID = [
  ".android.tsx",
  ".android.ts",
  ".android.jsx",
  ".android.js",
  ".native.tsx",
  ".native.ts",
  ".native.jsx",
  ".native.js",
  ".tsx",
  ".ts",
  ".jsx",
  ".js",
];

export function getPlatformExtensions(platform: "ios" | "android"): string[] {
  return platform === "ios" ? PLATFORM_EXTENSIONS_IOS : PLATFORM_EXTENSIONS_ANDROID;
}
