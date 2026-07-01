---
"vitest-native": patch
---

Provide `SourceCode.getConstants().scriptURL` at the native boundary. RN's `getDevServer` (`Libraries/Core/Devtools/getDevServer.js`) reads `scriptURL` and calls `.match()` on it; under the native engine the value was `undefined`, so `getDevServer` threw and took down any test whose module graph reached it. The boundary now returns a `file://` (bundled) URL for the `SourceCode` native module. It is deliberately not an `http(s)` URL: `getDevServer` only treats `http(s)` script URLs as a live dev server, so a `file://` value keeps `bundleLoadedFromServer` false — tests run as if loaded from a bundle rather than a Metro dev server, which prevents RN internals and third-party SDKs from believing they're connected to a packager and attempting real network I/O against `localhost:8081`. This mirrors the intent of RN's own Jest mock (which keeps that flag off).
