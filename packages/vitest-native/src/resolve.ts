import { extensionsFor } from "./native/resolve.mjs";

/**
 * Extension search order for the Vite graph, taken from the same definition the
 * Node graph uses. Vite's default list is replaced wholesale by whatever is set
 * here, so anything Metro treats as a source extension has to appear — `.json`
 * included, or `import config from './config'` resolves in the app and fails in
 * the test.
 */
const PLATFORM_EXTENSIONS_IOS = extensionsFor("ios");
const PLATFORM_EXTENSIONS_ANDROID = extensionsFor("android");

export function getPlatformExtensions(platform: "ios" | "android"): string[] {
  return platform === "ios" ? PLATFORM_EXTENSIONS_IOS : PLATFORM_EXTENSIONS_ANDROID;
}
